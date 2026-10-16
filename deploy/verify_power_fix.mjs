// 后端真实数据回填验证：确认 (1) /energy/trend?subsystem=power 不再全 0；(2) /buildings 的 B1/B9 建筑面积真实非空
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

(async () => {
  const token = await login();
  console.log('LOGIN: OK\n');

  // (1) power 趋势不再全 0
  const tr = await get(token, '/energy/trend?subsystem=power');
  const points = tr.data?.points || [];
  const nonZero = points.filter((p) => p.kwh > 0).length;
  const totalKwh = points.reduce((s, p) => s + (p.kwh || 0), 0);
  console.log(`[S4] /energy/trend?subsystem=power -> ${tr.status} (points=${points.length}, nonZeroKwh=${nonZero}, totalKwh=${totalKwh})`);
  const trendOk = tr.status === 200 && points.length > 0 && nonZero > 0 && totalKwh > 0;

  // (2) 对比 hvac 趋势基线（确认趋势端点本身工作）
  const hv = await get(token, '/energy/trend?subsystem=hvac');
  const hvNonZero = (hv.data?.points || []).filter((p) => p.kwh > 0).length;
  console.log(`[S2] /energy/trend?subsystem=hvac -> ${hv.status} (nonZeroKwh=${hvNonZero})`);

  // (3) S7 楼栋建筑面积真实非空
  const bd = await get(token, '/buildings');
  const items = bd.data?.items || bd.data || [];
  const pick = items.filter((b) => ['1', '9'].includes(String(b.id)));
  console.log(`[S7] /buildings -> ${bd.status} (total=${items.length})`);
  for (const b of pick) {
    console.log(`    楼栋 ${b.id} ${b.name}: floors=${b.floors}, gross_area=${b.gross_area}`);
  }
  const bldOk = pick.length === 2 && pick.every((b) => b.gross_area && b.floors);

  const allOk = trendOk && hvNonZero > 0 && bldOk;
  console.log(`\nPOWER_TREND_FIX: ${trendOk ? 'PASS' : 'FAIL'}`);
  console.log(`S7_AREA_REAL: ${bldOk ? 'PASS' : 'FAIL'}`);
  console.log(allOk ? 'BACKFILL_VERIFY: PASS' : 'BACKFILL_VERIFY: FAIL');
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });
