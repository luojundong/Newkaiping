import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BizError } from '../response.util';

// 全局异常过滤器：将 HttpException / BizError / 未知异常统一映射为 { code, data:null, message }。
// 兼容 Fastify(.code().send) 与 Express(.status().json) 两种响应对象。
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse() as any;

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 50000;
    let message = 'Internal server error';

    if (exception instanceof BizError) {
      httpStatus = exception.httpStatus;
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      code = httpStatus;
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
      } else if (resp && typeof resp === 'object') {
        const r = resp as Record<string, any>;
        if (Array.isArray(r.message)) {
          message = r.message.join('; ');
        } else if (typeof r.message === 'string') {
          message = r.message;
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    const payload = { code, data: null, message };
    if (typeof res.json === 'function') {
      res.status(httpStatus).json(payload);
    } else {
      res.code(httpStatus).send(payload);
    }
  }
}
