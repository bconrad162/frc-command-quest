/** Minimal RFC 4180 CSV builder with spreadsheet formula-injection protection. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  // Nicknames come from students: neutralize cells that a spreadsheet would treat as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
