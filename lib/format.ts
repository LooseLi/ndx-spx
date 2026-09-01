import type { Change, ChangeKind, Currency, PurchaseState } from './types'

/** 把额度格式化成中文习惯的可读金额。null = 不限额，0 = 买不了 */
export function formatLimit(limit: number | null): string {
  if (limit === null) return '不限额'
  if (limit <= 0) return '不可申购'
  if (limit >= 1e8) return `${trim(limit / 1e8)} 亿`
  if (limit >= 1e4) return `${trim(limit / 1e4)} 万`
  return `${trim(limit)} 元`
}

export function formatScale(scale: number | null): string {
  if (scale === null) return '—'
  if (scale >= 1e8) return `${trim(scale / 1e8)} 亿`
  if (scale >= 1e4) return `${trim(scale / 1e4)} 万`
  return `${trim(scale)}`
}

function trim(n: number): string {
  const r = Math.round(n * 100) / 100
  return String(r)
}

export const STATE_LABEL: Record<PurchaseState, string> = {
  open: '开放申购',
  limited: '限大额',
  suspended: '暂停申购',
  unknown: '状态未知',
}

export const CURRENCY_LABEL: Record<Currency, string> = {
  CNY: '人民币',
  USD_WIRE: '美元现汇',
  USD_CASH: '美元现钞',
}

export const INDEX_LABEL = {
  NDX: '纳斯达克100',
  SPX: '标普500',
} as const

interface KindMeta {
  emoji: string
  label: string
}

export const CHANGE_META: Record<ChangeKind, KindMeta> = {
  reopened: { emoji: '🟢', label: '恢复申购' },
  limit_up: { emoji: '📈', label: '额度提升' },
  limit_removed: { emoji: '🎉', label: '取消限额' },
  new_fund: { emoji: '🆕', label: '新增基金' },
  limit_down: { emoji: '📉', label: '额度下调' },
  suspended: { emoji: '🔴', label: '暂停申购' },
  aip_reopened: { emoji: '🔁', label: '定投恢复' },
}

/** 单条变更的一行文字描述，飞书和微信共用 */
export function describeChange(c: Change): string {
  const meta = CHANGE_META[c.kind]
  const cur = c.currency === 'CNY' ? '' : `（${CURRENCY_LABEL[c.currency]}）`
  const head = `${meta.emoji} ${meta.label}｜${c.name}${cur} (${c.code})`

  if (c.kind === 'new_fund') {
    return `${head}\n    当前额度 ${formatLimit(c.toLimit)}`
  }
  if (c.kind === 'aip_reopened') {
    return `${head}\n    定投通道已开放，申购额度 ${formatLimit(c.toLimit)}`
  }
  const from = formatLimit(c.fromLimit ?? null)
  const to = formatLimit(c.toLimit)
  return `${head}\n    ${from} → ${to}`
}
