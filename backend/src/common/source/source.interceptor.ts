// 统一识别审计来源（GK-26）。
//
// 识别优先级：
//   1) JWT claim `src`（若登录时签发了 automation / human 声明，最高可信）
//   2) 请求头 X-KP-Source: automation | human（大小写不敏感）
//   3) 缺省一律回退 'human'，保证既有人操作 / 既有 e2e 脚本不受影响
//
// 识别结果写入 AsyncLocalStorage（见 request-context.ts），由 LogsService.record() 统一透传，
// 不在任何 controller 里散写。

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestContext, RequestSource } from '../request-context';

const HEADER_NAME = 'x-kp-source';

@Injectable()
export class SourceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const source = resolveSource(context.switchToHttp().getRequest());
    return RequestContext.run(source, () => next.handle());
  }
}

function resolveSource(req: any): RequestSource {
  // 1) JWT claim（auth.guard 已在此前完成校验并把 user 挂到 req 上）
  const claim = req?.user?.src;
  if (claim === 'automation' || claim === 'human') return claim;

  // 2) 请求头
  const header = req?.headers?.[HEADER_NAME];
  const h = typeof header === 'string' ? header.trim().toLowerCase() : '';
  if (h === 'automation') return 'automation';
  if (h === 'human') return 'human';

  // 3) 缺省
  return 'human';
}
