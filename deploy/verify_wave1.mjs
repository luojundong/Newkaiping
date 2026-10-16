// Wave 1 运行时验证：确认屏1(ScreenHero)消费的真实接口在公网后端返回真实数据
const BASE = 'http://117.21.178.39:5168/api/v1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
  const j = await r.json();
  return { status: r.status, code: j.code, data: j.data };
}

(async () => {
  const token = await login();
  console.log('LOGIN: OK');
  const out = {};
  // 屏1 消费的 4 个接口 + panels
  const dev = await get(token, '/devices?limit=5000');
  out.devices = { status: dev.status, code: dev.code, count: dev.data?.items?.length ?? dev.data?.length ?? '?',
    sample: Array.isArray(dev.data?.items) ? dev.data.items.slice(0,1).map(d=>({id:d.id,building:d.building_id,status:d.status})) : null };

  const alm = await get(token, '/alarms');
  out.alarms = { status: alm.status, code: alm.code, count: alm.data?.items?.length ?? alm.data?.length ?? '?' };

  const wo = await get(token, '/work-orders/stats');
  out.workOrdersStats = { status: wo.status, code: wo.code, keys: wo.data ? Object.keys(wo.data) : null,
    snapshot: wo.data ? { total: wo.data.total, completed: wo.data.completed, processing: wo.data.processing } : null };

  const en = await get(token, '/energy/summary?period=day');
  out.energy = { status: en.status, code: en.code, sample: en.data ? { kwh: en.data.kwh, carbon_kg: en.data.carbon_kg, cost: en.data.cost } : null };

  const pan = await get(token, '/bigscreen/panels');
  out.panels = { status: pan.status, code: pan.code, hasBottom: !!pan.data?.bottom, hasRight: !!pan.data?.right };

  console.log(JSON.stringify(out, null, 2));
  // 断言
  const ok = dev.status===200 && alm.status===200 && wo.status===200 && en.status===200 && pan.status===200
    && typeof out.devices.count === 'number' && out.devices.count > 0;
  console.log(ok ? '\nWAVE1_RUNTIME: PASS (所有接口200 + devices 有真实台账)' : '\nWAVE1_RUNTIME: FAIL');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(2); });
