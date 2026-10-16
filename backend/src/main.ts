import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { attachSchemaSyncChannel } from './websocket/schema-sync.channel';
import * as path from 'path';
import * as fs from 'fs';
import Busboy from '@fastify/busboy';

async function bootstrap(): Promise<void> {
  // bodyLimit：默认 Fastify 限制 1MB，普通 JSON 够用但 .glb 场景模型可达上百 MB。
  // 之前设 50MB 挡不住 66MB 的 hospital.glb（报 Network Error / 413），统一放宽到 300MB。
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 300 * 1024 * 1024 }),
  );
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const corsOrigin = (config.get<string>('CORS_ORIGIN') || '').trim();
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
    credentials: true,
  });

  // 阶段四：multipart 解析。Fastify 默认 body parser 会先消费请求流，导致 busboy 收不到数据，
  // 故在此注册 multipart/form-data 的 content-type parser，将 Fastify 的 payload 流交给 busboy 解析，
  // 解析结果挂到 req.body._upload 供 scene 上传接口使用（避免引入与 fastify v5 不兼容的 @fastify/multipart）。
  const fastify0 = app.getHttpAdapter().getInstance();
  // 将 multipart 请求体整体读为 Buffer（parseAs: 'buffer'），再从 Buffer 构造可读流交给 busboy，
  // 避免直接依赖 Fastify 内部 payload 流的语义差异（不同 fastify 版本表现不一致）。
  // 注意：@fastify/busboy 3.x 的 file 事件签名为 (fieldname, file, filename, encoding, mimetype)，
  // 其中第 3 个参数即为文件名字符串（不是 info 对象）；且本环境下 busboy 只触发 'finish' 不触发 'close'，
  // 因此用 'finish'（兼 'close' 兜底）来收尾并回传解析结果。
  fastify0.addContentTypeParser(
    'multipart/form-data',
    // 大文件 .glb 上传：bodyLimit 与实例一致放宽到 300MB（超限会直接 413）
    { parseAs: 'buffer', bodyLimit: 300 * 1024 * 1024 },
    (req: any, payload: Buffer, done: any) => {
      const bb = Busboy({ headers: req.headers });
      const files: { field: string; filename: string; buffer: Buffer }[] = [];
      let errored: any = null;
      bb.on('file', (field: string, stream: any, filename: string) => {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () =>
          files.push({ field, filename: filename || 'model.glb', buffer: Buffer.concat(chunks) }),
        );
      });
      bb.on('error', (e: any) => {
        errored = e;
      });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (errored) return done(errored);
        done(null, { _upload: { files } });
      };
      bb.on('close', finish);
      bb.on('finish', finish);
      const { Readable } = require('stream');
      Readable.from(payload).pipe(bb);
    },
  );

  // 注意：空 body 写接口（DELETE /buildings/:id 等）的 400 问题已在【前端】解决——
  // request.ts 的 apiDelete 在无 data 时显式把 Content-Type 设为 undefined，Fastify 即按空体处理（返回 200/404）。
  // 切勿在此注册 addContentTypeParser('application/json', ...) 覆盖：Nest 的 Fastify 适配器启动时会再次注册
  // 同名 parser，触发 FST_ERR_CTP_ALREADY_PRESENT 导致进程启动即崩溃（已踩坑）。

  // 阶段四：静态服务 /uploads（模型上传后访问）。本服务基于 Fastify，使用原生路由直接托管，
  // 避免引入与 fastify v5 不兼容的 @nestjs/serve-static（Express 版）。
  const uploadRoot = path.join(process.cwd(), 'public', 'uploads');
  fs.mkdirSync(uploadRoot, { recursive: true });
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/uploads/*', async (req: any, reply: any) => {
    const rel = (req.params && req.params['*']) || '';
    const safe = rel.replace(/[^a-zA-Z0-9._\-/]/g, '_');
    const filePath = path.join(uploadRoot, safe);
    if (!filePath.startsWith(uploadRoot) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      reply.code(404).send({ code: 404, message: '文件不存在' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const buf = fs.readFileSync(filePath);
    const MIME: Record<string, string> = {
      '.glb': 'model/gltf-binary',
      '.gltf': 'model/gltf+json',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    reply
      .header('Content-Type', MIME[ext] || 'application/octet-stream')
      .header('Content-Length', buf.length)
      .header('Cache-Control', 'no-cache')
      .send(buf);
  });

  // 阶段六：生产环境前端静态托管（部署时把 frontend/dist/* 拷到 public/web/）。
  // 单进程单端口方案：/api/v1 与 /uploads 由上文路由先匹配，其余路径回落到前端 SPA。
  // SPA 路由（如 /admin/xxx、/bigscreen/xxx）回退到 index.html。
  const webRoot = path.join(process.cwd(), 'public', 'web');
  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
    '.glb': 'model/gltf-binary',
  };
  fastify.get('/*', async (req: any, reply: any) => {
    // API 前缀路由未被控制器命中时，应返回 404 JSON，而非回落 SPA HTML（避免掩盖接口错误）。
    const url = (req.url || '').split('?')[0];
    if (url.startsWith('/api/')) {
      reply.code(404).send({ code: 404, message: 'Not Found' });
      return;
    }
    let rel = (req.params && req.params['*']) || '';
    // 空路径与目录 → index.html
    if (!rel || rel.endsWith('/')) rel = 'index.html';
    const safe = rel.replace(/[^a-zA-Z0-9._\-/]/g, '');
    let filePath = path.join(webRoot, safe);
    if (!filePath.startsWith(webRoot) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(webRoot, 'index.html');
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      reply.code(404).send({ code: 404, message: 'Not Found' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const buf = fs.readFileSync(filePath);
    reply
      .header('Content-Type', MIME[ext] || 'application/octet-stream')
      .header('Content-Length', buf.length)
      .header('Cache-Control', 'no-cache')
      .send(buf);
  });

  const port = Number(config.get<number>('PORT', 3000));
  // GK-11：schema.updated 跨端同步 —— 裸 WS 半通道挂在既有 HTTP server 上。
  // 必须在 app.listen 之前 attach（保证 upgrade 监听器先于 engine.io 注册，
  // 见 backend/src/websocket/schema-sync.channel.ts 头注释的共存论证）。
  attachSchemaSyncChannel(app.getHttpAdapter().getInstance().server);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Nest application successfully started on port ${port}`);
}

bootstrap();
