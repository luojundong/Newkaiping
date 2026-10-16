// 统一响应包络工具与业务错误类型。
// 所有成功响应均包裹为 { code:0, data, message:'' }；错误由 GlobalExceptionFilter 统一处理。

export interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

export function ok<T>(data: T, message = ''): ApiEnvelope<T> {
  return { code: 0, data, message };
}

// 业务错误：携带非零 code 与建议 HTTP 状态，供 GlobalExceptionFilter 映射。
export class BizError extends Error {
  constructor(public readonly code: number, message: string, public readonly httpStatus = 400) {
    super(message);
    this.name = 'BizError';
  }
}
