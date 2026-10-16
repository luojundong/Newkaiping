#!/usr/bin/env node
/**
 * GK-06 · reset-hud-layout.js
 *
 * 清掉 scene_config 里残留的 GK-03 测试 widget 数据（left-alarm=「GK-03 测试框」、
 * right-hvac=「右1」、right-power=「右2」等），恢复默认 17 框布局。
 *
 * 方式：直接操作 backend/data/runtime.json（与后端 MockConnector.writeRuntime()
 * 同款 lowdb JSON 读写），将 scene_config.hud_layout_widgets 键删除
 * （删除 = 回退纯种子默认；等价于置空数组，mergeHudLayout 空/缺省即返回默认 17 框）。
 *
 * 约束：
 *   - 零第三方依赖（仅 node 内置 fs/path）
 *   - 幂等：可重复运行；键不存在时视为已清理
 *   - 不改任何 src/ 业务代码
 *   - 不重启后端（是否即时生效取决于后端是否每次读盘，见证据 report）
 *
 * 用法： node scripts/reset-hud-layout.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RUNTIME_PATH = path.resolve(__dirname, '..', 'data', 'runtime.json');
const TARGET_KEY = 'hud_layout_widgets';

function log(...args) {
  console.log(...args);
}

// 在 scene_config 叠加上找到「可写的单对象」容器。
// 兼容三种形态：
//   { sceneConfig: { data: {...} } }   —— 新版 writeRuntime 格式（PERSIST_MAP 使用）
//   { sceneConfig: {...} }             —— 旧版纯对象
//   { sceneConfig: [ {...} ] }         —— 兜底数组
function resolveSceneConfigContainer(runtime) {
  if (!runtime || typeof runtime !== 'object') return null;
  const sc = runtime.sceneConfig;
  if (sc === undefined) return null;
  // 数组形态 → 取首元素作为容器
  if (Array.isArray(sc)) return sc.length ? sc[0] : null;
  // 新版 { data: {...} } 形态
  if (sc && typeof sc === 'object' && 'data' in sc) {
    if (Array.isArray(sc.data)) return sc.data.length ? sc.data[0] : null;
    return sc.data;
  }
  // 纯对象形态
  return sc;
}

function main() {
  log(`[reset-hud-layout] runtime=${RUNTIME_PATH}`);
  log(`[reset-hud-layout] targetKey=${TARGET_KEY}`);

  if (!fs.existsSync(RUNTIME_PATH)) {
    log('WARN  runtime.json 不存在，无需清理（视为已复位）');
    log('RESULT: PASS (runtime.json absent)');
    process.exit(0);
    return;
  }

  const raw = fs.readFileSync(RUNTIME_PATH, 'utf-8');
  let runtime;
  try {
    runtime = JSON.parse(raw);
  } catch (e) {
    log(`FATAL runtime.json 解析失败: ${e.message}`);
    process.exit(1);
    return;
  }

  const container = resolveSceneConfigContainer(runtime);
  if (!container || typeof container !== 'object') {
    log('WARN  sceneConfig 不存在，无需清理（视为已复位）');
    log('RESULT: PASS (sceneConfig absent)');
    process.exit(0);
    return;
  }

  const had = Object.prototype.hasOwnProperty.call(container, TARGET_KEY);
  let removedCount = 0;
  if (had) {
    const before = JSON.stringify(container[TARGET_KEY]);
    removedCount = Array.isArray(container[TARGET_KEY]) ? container[TARGET_KEY].length : 1;
    delete container[TARGET_KEY];
    log(`[reset-hud-layout] removed ${TARGET_KEY} (was length=${removedCount})`);
    log(`[reset-hud-layout] before=${before.slice(0, 400)}`);
  } else {
    log(`[reset-hud-layout] ${TARGET_KEY} 键不存在，无需清理`);
  }

  // 保留原文件缩进风格（minified 或 pretty），避免整文件格式剧变
  const pretty = raw.includes('\n');
  const out = pretty ? JSON.stringify(runtime, null, 2) : JSON.stringify(runtime);
  fs.writeFileSync(RUNTIME_PATH, out, 'utf-8');

  // 写回后自校验
  const verifyRaw = fs.readFileSync(RUNTIME_PATH, 'utf-8');
  const verify = JSON.parse(verifyRaw);
  const verifyContainer = resolveSceneConfigContainer(verify);
  const still = verifyContainer && Object.prototype.hasOwnProperty.call(verifyContainer, TARGET_KEY);
  if (still) {
    log('FATAL 写回后 TARGET_KEY 仍存在，复位失败');
    process.exit(1);
    return;
  }

  log(`[reset-hud-layout] written OK; file bytes=${Buffer.byteLength(out)}`);
  log(`RESULT: PASS (${had ? `removed ${removedCount} test widget(s)` : 'already clean'})`);
  process.exit(0);
}

main();
