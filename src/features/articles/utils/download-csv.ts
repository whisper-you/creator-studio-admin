/**
 * Builds a CSV string from the given rows (each row is an array of cell
 * values) and triggers a client-side download.
 */
export function downloadCsv(
  filename: string,
  rows: Array<Array<string | number>>
) {
  const escapeCell = (value: string | number) => {
    const str = String(value)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }

  const csv = rows.map((row) => row.map(escapeCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
