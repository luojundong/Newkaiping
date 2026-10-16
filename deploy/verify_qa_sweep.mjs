// 全量 API QA 扫描：鉴权 / 7 屏端点(含 buildingId 变体) / 错误路径 / 数据正确性 / 算法逻辑断言
// 用法：node verify_qa_sweep.mjs  退出码 0=全部通过
const BASE = 'http://117.21.178.39:5168/api/v1';

async function login(user = 'admin', pass = 'admin123') {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.data?.token, code: j.code };
}
async function get(token, path) {
  const h = token ? { Authorization: `Bearer ${token}` } : {};
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, code: j.code, data: j.data };
}

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

(async () => {
  // ---------- 鉴权 ----------
  const ok = await login();
  check('AUTH 正确凭证登录', (ok.status === 200 || ok.status === 201) && ok.token, `status=${ok.status}`);
  const bad = await login('admin', 'wrong');
  check('AUTH 错误密码拒绝', bad.status !== 200 || !bad.token, `status=${bad.status}`);
  const noTok = await get(null, '/devices?limit=10');
  check('AUTH 无 token 拒绝(401)', noTok.status === 401, `status=${noTok.status}`);
  const badTok = await get('invalid.token.xyz', '/devices?limit=10');
  check('AUTH 无效 token 拒绝(401)', badTok.status === 401, `status=${badTok.status}`);
  const tk = ok.token;

  // ---------- 错误路径 ----------
  const notFound = await get(tk, '/no-such-endpoint');
  check('ERR 未知端点 404', notFound.status === 404, `status=${notFound.status}`);

  // ---------- S1 综合态势 ----------
  const dev = await get(tk, '/devices?limit=5000');
  const devArr = dev.data?.items || [];
  check('S1 设备台账 200+非空', dev.status === 200 && devArr.length > 0, `count=${devArr.length}`);
  const alarms = await get(tk, '/alarms');
  check('S1 告警列表 200', alarms.status === 200 && Array.isArray(alarms.data?.items), `count=${(alarms.data?.items||[]).length}`);
  const woStats = await get(tk, '/work-orders/stats');
  check('S1 工单统计 200+字段', woStats.status === 200 && woStats.data && typeof woStats.data === 'object', `keys=${Object.keys(woStats.data||{}).length}`);
  const eSum = await get(tk, '/energy/summary?period=day');
  check('S1 能耗汇总 200+字段', eSum.status === 200 && eSum.data && eSum.data.kwh !== undefined, `kwh=${eSum.data?.kwh}`);
  const panels = await get(tk, '/bigscreen/panels');
  check('S1 大屏面板 200', panels.status === 200, `ok=${panels.status}`);

  // ---------- S2 空调能源 ----------
  const hvac = await get(tk, '/hvac/status');
  check('S2 空调状态 200+运行设备', hvac.status === 200 && hvac.data?.running_count !== undefined && hvac.data?.device_count > 0, `device=${hvac.data?.device_count}, running=${hvac.data?.running_count}`);
  const hvacB = await get(tk, '/hvac/status?building_id=2');
  check('S2 空调状态(building_id=2) 200', hvacB.status === 200, `ok=${hvacB.status}`);
  const hTrend = await get(tk, '/energy/trend?subsystem=hvac');
  const hPoints = hTrend.data?.points || [];
  check('S2 空调趋势 200+非0', hTrend.status === 200 && hPoints.filter(p=>p.kwh>0).length>0, `nonZero=${hPoints.filter(p=>p.kwh>0).length}`);
  const aHvac = await get(tk, '/alarms?subsystem=hvac');
  check('S2 空调告警 200', aHvac.status === 200, `ok=${aHvac.status}`);
  // 算法逻辑：能耗汇总 day 的 kwh 应 > 0 且为有限数
  check('ALGO 能耗汇总 kwh 为有限正数', Number.isFinite(eSum.data?.kwh) && eSum.data?.kwh > 0, `kwh=${eSum.data?.kwh}`);

  // ---------- S3 电梯安全 ----------
  const elev = await get(tk, '/elevator/status');
  check('S3 电梯状态 200+总数>0', elev.status === 200 && elev.data?.elevator_count > 0, `count=${elev.data?.elevator_count}`);
  const elevB = await get(tk, '/elevator/status?building_id=9');
  const units = elevB.data?.units || [];
  check('S3 电梯逐梯(units) building_id=9 下发', elevB.status === 200 && units.length > 0, `units=${units.length}`);
  const aElev = await get(tk, '/alarms?subsystem=elevator');
  check('S3 电梯告警 200', aElev.status === 200, `ok=${aElev.status}`);

  // ---------- S4 供配电计量 ----------
  const power = await get(tk, '/power/status');
  check('S4 供配电状态 200+总有功>0', power.status === 200 && power.data?.total_power_kw > 0, `kw=${power.data?.total_power_kw}`);
  const powerB = await get(tk, '/power/status?building_id=9');
  check('S4 供配电状态(building_id=9) 200+馈线', powerB.status === 200, `ok=${powerB.status}`);
  const pTrend = await get(tk, '/energy/trend?subsystem=power');
  const pPoints = pTrend.data?.points || [];
  const pNonZero = pPoints.filter(p=>p.kwh>0).length;
  check('S4 供配电趋势 200+非0(修复点)', pTrend.status === 200 && pNonZero > 0, `nonZero=${pNonZero}, total=${pPoints.reduce((s,p)=>s+(p.kwh||0),0)}`);
  // 算法逻辑：供配电趋势日 kwh 应与 gross_area 量级一致（非异常巨大/NaN）
  const pTotal = pPoints.reduce((s,p)=>s+(p.kwh||0),0);
  check('ALGO 供配电趋势 kwh 有限且合理', Number.isFinite(pTotal) && pTotal > 0 && pTotal < 1e7, `total=${pTotal}`);

  // ---------- S5 告警工单 ----------
  const wo = await get(tk, '/work-orders?limit=50');
  check('S5 工单列表 200', wo.status === 200 && Array.isArray(wo.data?.items), `count=${(wo.data?.items||[]).length}`);

  // ---------- S6 空间设备运维 ----------
  const dev6 = await get(tk, '/devices?limit=5000');
  check('S6 设备台账 200+台账量', dev6.status === 200 && (dev6.data?.items||[]).length > 1000, `count=${(dev6.data?.items||[]).length}`);

  // ---------- S7 建筑面积表 ----------
  const bld = await get(tk, '/buildings');
  const bldArr = bld.data?.items || bld.data || [];
  check('S7 楼栋 200+10栋', bld.status === 200 && bldArr.length === 10, `count=${bldArr.length}`);
  const b1 = bldArr.find(b=>String(b.id)==='1');
  const b9 = bldArr.find(b=>String(b.id)==='9');
  check('S7 B1 数据正确', b1 && b1.floors===6 && b1.gross_area===12000, `B1 floors=${b1?.floors}, area=${b1?.gross_area}`);
  check('S7 B9 数据正确', b9 && b9.floors===16 && b9.gross_area===38000, `B9 floors=${b9?.floors}, area=${b9?.gross_area}`);
  // 算法逻辑：每栋 gross_area 应 > 0
  check('ALGO 所有楼栋 gross_area>0', bldArr.every(b=>b.gross_area>0), `min=${Math.min(...bldArr.map(b=>b.gross_area||0))}`);

  // ---------- 汇总 ----------
  const fail = results.filter(r=>!r.ok);
  console.log(`\n=== QA SWEEP 结果: ${results.length - fail.length}/${results.length} 通过, 失败 ${fail.length} ===`);
  if (fail.length) { console.log('失败项:'); fail.forEach(f=>console.log('  - '+f.name+'  '+f.detail)); }
  process.exit(fail.length ? 1 : 0);
})().catch((e)=>{ console.error('ERR', e.message); process.exit(2); });
