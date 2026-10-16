// 通用 CSV 构造工具：含 UTF-8 BOM（防止中文乱码），自动转义逗号/引号/换行。

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  // BOM + CRLF，便于 Excel 正确识别 UTF-8
  return '﻿' + lines.join('\r\n');
}
