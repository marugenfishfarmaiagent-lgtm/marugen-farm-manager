export function touchUpdatedAt(record) {
  if (!record || typeof record !== 'object') return record
  return { ...record, updatedAt: new Date().toISOString() }
}

export function withUpdatedAt(row) {
  if (!row) return row
  const ts = row.updated_at ?? row.updatedAt
  return ts ? { ...row, updatedAt: ts } : row
}

export function touchPondData(pondData) {
  if (!pondData || typeof pondData !== 'object') return pondData
  return touchUpdatedAt(pondData)
}
