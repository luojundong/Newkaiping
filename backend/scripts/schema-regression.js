#!/usr/bin/env node
/**
 * GK-02 · Scene Schema materializer 回归校验
 *
 * 单文件、零第三方依赖（仅用 node>=18 内置 fetch）、幂等可重复跑。
 * 目的：防止后续改动把冻结 schema 契约破坏（11 顶层段 / deviceType 枚举 /
 * 引用完整性 / 数量不变量）。
 *
 * 用法：
 *   node scripts/schema-regression.js [baseUrl]
 *   # baseUrl 默认 http://localhost:5168
 *   # 可用环境变量覆盖：KP_REG_BASE_URL / KP_REG_USER / KP_REG_PASS
 *
 * 断言分组：
 *   A 结构   —— 顶层段齐全且无多余键、hudLayout.widgets 字段形状
 *   B 数量   —— 可调阈值常量（默认实测基线，允许 >= 容错数据微增）
 *   C 语义   —— deviceType ∈ 冻结枚举、id 前缀规范、bindings 引用完整、preset id 唯一
 *
 * 输出：逐条 PASS/FAIL → stdout；最终 "GK-02 RESULT: PASS/FAIL (X/Y passed)"；
 * 任一 FAIL → process.exit(1)。
 */

'use strict';

/* eslint-disable no-console */

// ---------------------------------------------------------------- 可调阈值
// 2026-09-04 实测基线：sceneGraph 1983 = root1 + building10 + floor110 +
// device1842 + decor20；hudLayout=17；cameraPresets=120；scenarios=8；
// bindings=pointTable=1842；assets=1。全部允许 "≥" 以容错服务器数据微增。
const MIN_SCENE_GRAPH_BY_TYPE = {
  root: 1,
  building: 10,
  floor: 110,
  device: 1842,
  decor: 20,
};
const MIN_SCENE_GRAPH_TOTAL = 1983;
const MIN_HUD_WIDGETS = 17;
const MIN_CAMERA_PRESETS = 100; // 实测 120
const MIN_SCENARIOS = 8;
const MIN_BINDINGS = 1800; // 实测 1842
const MIN_ASSETS = 1;

// 冻结 deviceType 枚举（scene-schema.v1.schema.json §sceneGraph.semantic.deviceType）
const DEVICE_TYPE_ENUM = [
  'ARCH', 'CAB', 'AC', 'PDU', 'UPS', 'BAT', 'PIPE', 'SENSOR', 'CAM', 'FIRE',
  'LIGHT', 'DECO', 'FURN', 'AHU', 'LEAK', 'RACK', 'PUMP', 'CHILLER', 'HP',
  'CT', 'ELEVATOR', 'METER', 'BOILER',
];
const DEVICE_TYPE_SET = new Set(DEVICE_TYPE_ENUM);

// 11 个顶层必需段（冻结顺序）
const TOP_LEVEL_REQUIRED = [
  'schemaVersion', 'meta', 'dataSources', 'pointTable', 'assets', 'sceneGraph',
  'bindings', 'rules', 'hudLayout', 'cameraPresets', 'scenarios',
];
// 允许出现的额外顶层键（控制器注入的运行时元数据）
const ALLOWED_EXTRA_TOP_KEYS = new Set(['_meta']);

// node id 前缀规范：type → 前缀（root/group/decor 豁免，root 固定为 'root'）
const ID_PREFIX_BY_TYPE = {
  building: 'bldg_',
  floor: 'floor_',
  device: 'device_',
  room: 'room_',
};
const ID_PREFIX_EXEMPT = new Set(['root', 'group', 'decor']);

// ---------------------------------------------------------------- 运行配置
const BASE_URL = (
  process.env.KP_REG_BASE_URL || process.argv[2] || 'http://localhost:5168'
).replace(/\/+$/, '');
const USER = process.env.KP_REG_USER || 'admin';
const PASS = process.env.KP_REG_PASS || 'admin123';

const HTTP_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------- 状态
let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`FAIL  ${label}${detail ? `  (${detail})` : ''}`);
  }
  return cond;
}

// ---------------------------------------------------------------- HTTP 工具
async function request(path, { method = 'GET', token = null, body = null } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let json = null;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { httpStatus: res.status, json, raw: text };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- 断言：登录
async function login() {
  const r = await request('/api/v1/auth/login', {
    method: 'POST',
    body: { username: USER, password: PASS },
  });
  const j = r.json;
  if (r.httpStatus !== 200 && r.httpStatus !== 201) {
    console.log(`[step] login http=${r.httpStatus}`);
    return null;
  }
  if (!j || j.code !== 0 || !j.data || typeof j.data.token !== 'string' || !j.data.token) {
    console.log(`[step] login envelope invalid: ${r.raw.slice(0, 300)}`);
    return null;
  }
  return j.data.token;
}

// ---------------------------------------------------------------- main
async function main() {
  console.log(`GK-02 schema regression @ ${BASE_URL}  user=${USER}`);
  console.log(`time: ${new Date().toISOString()}`);
  console.log('');

  // 0. 登录
  console.log('--- 步骤 0：登录 ---');
  const token = await login();
  ok(!!token, 'S0 login 获取 token');
  console.log('');

  if (!token) {
    finish(1);
    return;
  }

  // 1. GET schema
  console.log('--- 步骤 1：GET /api/v1/scene/schema ---');
  const schemaRes = await request('/api/v1/scene/schema', { token });
  ok(schemaRes.httpStatus === 200, 'S1 schema http 200', `http=${schemaRes.httpStatus}`);
  ok(schemaRes.json && schemaRes.json.code === 0, 'S1 schema 包络 code=0');
  const doc = schemaRes.json && schemaRes.json.data;
  ok(doc && typeof doc === 'object', 'S1 schema data 为对象');
  console.log('');

  if (!doc || typeof doc !== 'object') {
    finish(2);
    return;
  }

  // 2. GET version
  console.log('--- 步骤 2：GET /api/v1/scene/schema/version ---');
  const verRes = await request('/api/v1/scene/schema/version', { token });
  const verDoc = verRes.json && verRes.json.data;
  ok(verRes.httpStatus === 200, 'S2 version http 200', `http=${verRes.httpStatus}`);
  ok(
    verRes.json && verRes.json.code === 0 && verDoc && typeof verDoc.version === 'number',
    'S2 version 返回 {version:number}',
    verDoc ? `version=${verDoc.version}` : 'no data',
  );
  console.log('');

  // -------------------------------------------------- A 结构
  console.log('--- 断言组 A：结构 ---');
  const topKeys = Object.keys(doc);
  const missingTop = TOP_LEVEL_REQUIRED.filter((k) => !(k in doc));
  ok(
    missingTop.length === 0,
    'A1 顶层必需 11 段齐全',
    missingTop.length ? `缺失: ${missingTop.join(',')}` : `${TOP_LEVEL_REQUIRED.length} 段 present`,
  );
  const extraTop = topKeys.filter((k) => !TOP_LEVEL_REQUIRED.includes(k) && !ALLOWED_EXTRA_TOP_KEYS.has(k));
  ok(
    extraTop.length === 0,
    'A2 无多余顶层键（允许 _meta）',
    extraTop.length ? `多余: ${extraTop.join(',')}` : `顶层键=${topKeys.join(',')}`,
  );

  const hud = doc.hudLayout;
  ok(hud && typeof hud === 'object' && Array.isArray(hud.widgets), 'A3 hudLayout 为 {canvas, widgets[]}');
  const widgets = hud && Array.isArray(hud.widgets) ? hud.widgets : [];
  const widgetFieldErr = widgets
    .filter((w) => w && typeof w === 'object')
    .filter(
      (w) =>
        !(typeof w.id === 'string' && w.id) ||
        !(typeof w.type === 'string' && w.type) ||
        !(typeof w.title === 'string') ||
        !Array.isArray(w.rect) ||
        w.rect.length !== 4 ||
        !(typeof w.z === 'number') ||
        typeof w.locked !== 'boolean',
    )
    .map((w) => w.id || '(no-id)');
  ok(
    widgetFieldErr.length === 0,
    'A4 hudLayout.widgets 每项含 id/type/title/rect[4]/z/locked',
    widgetFieldErr.length ? `违规 widget: ${widgetFieldErr.slice(0, 5).join(',')}` : `${widgets.length} widgets 全合规`,
  );
  console.log('');

  // -------------------------------------------------- B 数量
  console.log('--- 断言组 B：数量不变量（阈值可调，允许 ≥）---');
  const byType = {};
  for (const n of Array.isArray(doc.sceneGraph) ? doc.sceneGraph : []) {
    byType[n.type] = (byType[n.type] || 0) + 1;
  }
  for (const [type, min] of Object.entries(MIN_SCENE_GRAPH_BY_TYPE)) {
    const actual = byType[type] || 0;
    ok(actual >= min, `B1 sceneGraph.type=${type} ≥ ${min}`, `actual=${actual}`);
  }
  const graphTotal = Array.isArray(doc.sceneGraph) ? doc.sceneGraph.length : 0;
  ok(graphTotal >= MIN_SCENE_GRAPH_TOTAL, `B2 sceneGraph 总数 ≥ ${MIN_SCENE_GRAPH_TOTAL}`, `actual=${graphTotal}`);

  const hudCount = widgets.length;
  ok(hudCount >= MIN_HUD_WIDGETS, `B3 hudLayout.widgets.length ≥ ${MIN_HUD_WIDGETS}`, `actual=${hudCount}`);

  const presetCount = Array.isArray(doc.cameraPresets) ? doc.cameraPresets.length : 0;
  ok(presetCount >= MIN_CAMERA_PRESETS, `B4 cameraPresets.length ≥ ${MIN_CAMERA_PRESETS}`, `actual=${presetCount}`);

  const scenarioCount = Array.isArray(doc.scenarios) ? doc.scenarios.length : 0;
  ok(scenarioCount >= MIN_SCENARIOS, `B5 scenarios.length ≥ ${MIN_SCENARIOS}`, `actual=${scenarioCount}`);

  const bindingCount = Array.isArray(doc.bindings) ? doc.bindings.length : 0;
  const pointCount = Array.isArray(doc.pointTable) ? doc.pointTable.length : 0;
  ok(bindingCount >= MIN_BINDINGS && bindingCount === pointCount,
    `B6 bindings ≥ ${MIN_BINDINGS} 且 === pointTable.length`,
    `bindings=${bindingCount} pointTable=${pointCount}`);

  const assetCount = Array.isArray(doc.assets) ? doc.assets.length : 0;
  ok(assetCount >= MIN_ASSETS, `B7 assets.length ≥ ${MIN_ASSETS}`, `actual=${assetCount}`);
  console.log('');

  // -------------------------------------------------- C 语义
  console.log('--- 断言组 C：语义合规 ---');
  const graphNodes = Array.isArray(doc.sceneGraph) ? doc.sceneGraph : [];

  // C1 deviceType ∈ 冻结枚举（只校验携带 deviceType 语义的节点）
  const badDeviceType = graphNodes
    .filter((n) => n && n.semantic && typeof n.semantic.deviceType === 'string')
    .filter((n) => !DEVICE_TYPE_SET.has(n.semantic.deviceType))
    .map((n) => `${n.id || '(no-id)'}:${n.semantic.deviceType}`);
  ok(
    badDeviceType.length === 0,
    'C1 所有 node.semantic.deviceType ∈ 冻结枚举',
    badDeviceType.length ? `违规: ${badDeviceType.slice(0, 5).join(', ')}` : `枚举 ${DEVICE_TYPE_ENUM.length} 值`,
  );

  // C2 非 root/group/decor 节点的 id 前缀匹配其 type 约定
  const prefixBad = graphNodes
    .filter((n) => n && typeof n.type === 'string' && !ID_PREFIX_EXEMPT.has(n.type))
    .filter((n) => {
      const prefix = ID_PREFIX_BY_TYPE[n.type];
      if (n.type === 'root') return n.id !== 'root';
      if (!prefix) return true; // 未知 type（不匹配本规范）
      return !(typeof n.id === 'string' && n.id.startsWith(prefix));
    })
    .map((n) => `${n.type}:${n.id}`);
  ok(
    prefixBad.length === 0,
    'C2 非 root/group/decor 节点 id 前缀匹配 type 约定',
    prefixBad.length ? `违规: ${prefixBad.slice(0, 5).join(', ')}` : 'building→bldg_/floor→floor_/device→device_/room→room_',
  );

  // C3 bindings 引用完整性
  const nodeIds = new Set(graphNodes.map((n) => n.id));
  const pointIds = new Set((Array.isArray(doc.pointTable) ? doc.pointTable : []).map((p) => p.pointId));
  const badNodeRef = [];
  const badPointRef = [];
  for (const b of Array.isArray(doc.bindings) ? doc.bindings : []) {
    if (!b || typeof b !== 'object') {
      badNodeRef.push('(non-object binding)');
      continue;
    }
    if (!nodeIds.has(b.nodeId)) badNodeRef.push(`${b.id || '(no-id)'}->node:${b.nodeId}`);
    if (!pointIds.has(b.pointId)) badPointRef.push(`${b.id || '(no-id)'}->point:${b.pointId}`);
  }
  ok(
    badNodeRef.length === 0,
    'C3 bindings.nodeId 均存在于 sceneGraph',
    badNodeRef.length ? `悬空: ${badNodeRef.slice(0, 5).join(', ')}` : `${Array.isArray(doc.bindings) ? doc.bindings.length : 0} 引用`,
  );
  ok(
    badPointRef.length === 0,
    'C3 bindings.pointId 均存在于 pointTable',
    badPointRef.length ? `悬空: ${badPointRef.slice(0, 5).join(', ')}` : '全引用命中',
  );

  // C4 cameraPresets id 唯一
  const presetIds = (Array.isArray(doc.cameraPresets) ? doc.cameraPresets : []).map((p) => p && p.id);
  const dupPreset = presetIds.filter((id, i) => presetIds.indexOf(id) !== i);
  ok(
    dupPreset.length === 0,
    'C4 cameraPresets id 唯一',
    dupPreset.length ? `重复: ${[...new Set(dupPreset)].slice(0, 5).join(', ')}` : `${presetIds.length} presets 无重复`,
  );
  console.log('');

  // -------------------------------------------------- 汇总
  finish(0);
}

function finish(exitBase = 0) {
  const total = passed + failed;
  const verdict = failed === 0 ? 'PASS' : 'FAIL';
  console.log('='.repeat(70));
  console.log(`GK-02 RESULT: ${verdict} (${passed}/${total} passed)`);
  if (failures.length) {
    console.log('FAILED 断言:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[fatal] ${err && err.stack ? err.stack : err}`);
  finish(9);
});
