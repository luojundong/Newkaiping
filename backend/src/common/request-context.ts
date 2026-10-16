// 请求级上下文（GK-26）：在请求生命周期内传递「审计来源」标记。
//
// 采用 Node AsyncLocalStorage，由 SourceInterceptor 在请求进入时写入，
// 由 LogsService.record() 在落审计时读取 —— 统一一处，无需在各 controller 散写。
// 请求外（如启动期、定时任务）读取返回 undefined，由调用方回退为 'human'。

import { AsyncLocalStorage } from 'async_hooks';

export type RequestSource = 'human' | 'automation';

interface ReqCtx {
  source: RequestSource;
}

const als = new AsyncLocalStorage<ReqCtx>();

export const RequestContext = {
  /** 在请求作用域内运行 fn，使后续 LogsService.record 能读到 source */
  run<T>(source: RequestSource, fn: () => T): T {
    return als.run({ source }, fn);
  },
  /** 读取当前请求来源；请求外返回 undefined */
  getSource(): RequestSource | undefined {
    return als.getStore()?.source;
  },
};
