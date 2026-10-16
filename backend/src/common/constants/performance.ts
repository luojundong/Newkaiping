// 性能目标常量（对应 SPEC §9 AC-09 / §10，R2 决策已确认）。
//
// 控制指令下发 / 模型状态同步的端到端延迟目标：100–500 毫秒。
// 该数值为甲方（开平市中心医院）于 2026-08-17 确认的验收基准，MVP Mock 连接器
// 实际控制路径远低于此区间，故无需改动控制逻辑；真实连接器接入后应保证在此窗口内回写状态。

export const LATENCY_TARGET_MS = '100-500';

// 解析为数值区间，便于运行时断言/埋点。
export const LATENCY_TARGET_RANGE_MS: { min: number; max: number } = (() => {
  const [min, max] = LATENCY_TARGET_MS.split('-').map((n) => Number(n.trim()));
  return { min, max };
})();
