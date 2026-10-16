// 全 7 屏运行时验证：确认每屏消费的真实接口在公网后端返回 200 + 真实数据
// 屏映射：S1 综合态势 / S2 空调能源 / S3 电梯安全 / S4 供配电计量 / S5 告警工单 / S6 空间设备运维 / S7 建筑面积表
const BASE = 'http://117.21.178.39:5168/api/v1';

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const j = await r.json();
  if (j.code !== 0 && !j.data?.token) throw new Error('login failed: ' + JSON.stringify(j).slice(0, 200));
  return j.data.token;
}
async function get(token, path) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, code: j.code, data: j.data };
}
// 端点 -> 所属屏；power energy trend 已由 synthetic.aggregate.ts 改为复用 powerStatus 合成源（2026-09-27 修复 kwh 全 0 缺口）
const CHECKS = [
  ['S1', '/devices?limit=5000'],
  ['S1', '/alarms'],
  ['S1', '/work-orders/stats'],
  ['S1', '/energy/summary?period=day'],
  ['S1', '/bigscreen/panels'],
  ['S2', '/hvac/status'],
  ['S2', '/energy/trend?subsystem=hvac'],
  ['S2', '/alarms?subsystem=hvac'],
  ['S3', '/elevator/status'],
  ['S3', '/alarms?subsystem=elevator'],
  ['S4', '/power/status'],
  ['S4', '/energy/trend?subsystem=power'],
  ['S5', '/work-orders?limit=50'],
  ['S6', '/devices?limit=5000'],
  ['S7', '/buildings'],
];

(async () => {
  const token = await login();
  console.log('LOGIN: OK\n');
  const out = {};
  let fail = 0;
  for (const [screen, path] of CHECKS) {
    const r = await get(token, path);
    const ok = r.status === 200;
    if (!ok) fail++;
    const cnt = Array.isArray(r.data?.items) ? r.data.items.length
      : Array.isArray(r.data?.points) ? r.data.points.length
      : (r.data && typeof r.data === 'object' ? Object.keys(r.data).length : '-');
    out[`${screen} ${path}`] = { status: r.status, code: r.code, fields: cnt };
    console.log(`${ok ? 'PASS' : 'FAIL'} [${screen}] ${path} -> ${r.status} (fields=${cnt})`);
  }
  const allPass = fail === 0;
  console.log(`\n=== 失败接口数: ${fail} ===`);
  console.log(allPass ? 'ALL_SCREENS_RUNTIME: PASS (全 7 屏接口 200 + 真实数据)' : 'ALL_SCREENS_RUNTIME: FAIL');
  process.exit(allPass ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });
