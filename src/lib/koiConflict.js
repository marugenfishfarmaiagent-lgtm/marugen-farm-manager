import { KOI_STATUS } from '../data/constants.js'

const TERMINAL_KOI_STATUSES = new Set([KOI_STATUS.SOLD, KOI_STATUS.DECEASED])

function ts(record) {
  if (!record?.updatedAt) return 0
  const t = new Date(record.updatedAt).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Prefer sold/deceased when timestamps tie — avoids cloud pull reverting a just-marked sale. */
export function resolveKoiConflict(local, remote) {
  const lt = ts(local)
  const rt = ts(remote)
  const ls = local?.status || KOI_STATUS.AVAILABLE
  const rs = remote?.status || KOI_STATUS.AVAILABLE
  if (TERMINAL_KOI_STATUSES.has(ls) && !TERMINAL_KOI_STATUSES.has(rs)) {
    if (rt > lt) return remote
    return local
  }
  if (TERMINAL_KOI_STATUSES.has(rs) && !TERMINAL_KOI_STATUSES.has(ls)) {
    if (lt >= rt) return local
    return remote
  }
  if (lt !== rt) return lt > rt ? local : remote
  return local
}
