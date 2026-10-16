// 通用文件下载助手：用于历史数据 / 报表 CSV 导出（返回文本字符串时前端触发下载）
// 后端 /history/export、/reports/export 返回 CSV 文本，本助手负责生成带 BOM 的文件。

// 触发浏览器下载一个 Blob（自动清理临时 URL）
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟回收，确保下载已开始
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// 下载文本文件（默认 CSV，自动加 UTF-8 BOM 防止中文在 Excel 中乱码）
export function downloadTextFile(
  filename: string,
  text: string,
  mime = 'text/csv;charset=utf-8',
): void {
  const type = mime.includes('charset') ? mime : `${mime};charset=utf-8`
  const blob = new Blob([`﻿${text}`], { type })
  downloadBlob(filename, blob)
}
