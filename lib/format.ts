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
  direct_only: '仅直销',
  suspended: '暂停申购',
  unknown: '状态未知',
}

/**
 * 按状态展示额度。必须走这个函数而不是直接 formatLimit，
 * 因为 direct_only 的 limit 是"拿不到"而非"不限额"，
 * 直接格式化会把买不到的渠道显示成额度无限制。
 */
export function formatFundLimit(fund: { state: PurchaseState; limit: number | null }): string {
  switch (fund.state) {
    case 'suspended':
      return '不可申购'
    case 'direct_only':
      return '直销可买'
    case 'unknown':
      return '额度未知'
    default:
      return formatLimit(fund.limit)
  }
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
  direct_only: { emoji: '🏦', label: '直销开放' },
  new_fund: { emoji: '🆕', label: '新增基金' },
  limit_down: { emoji: '📉', label: '额度下调' },
  suspended: { emoji: '🔴', label: '暂停申购' },
}

/** 近一年收益率，带正负号 */
export function formatYield(v: number | null): string {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`
}

/**
 * 跟踪标的的简短标签。同一个 Tab 下可能混着不同标的，
 * 比如标普500和标普500等权重走势并不相同，需要区分出来。
 */
export function indexTag(indexCode: string | null): string | null {
  switch (indexCode) {
    case 'SP500EWTR':
      return '等权重'
    case 'NDX100':
    case 'SPX':
      return null // 主流标的，不必额外标注
    default:
      return indexCode ? '其他标的' : null
  }
}

/** 单条变更的一行文字描述，飞书和微信共用 */
export function describeChange(c: Change): string {
  const meta = CHANGE_META[c.kind]
  const cur = c.currency === 'CNY' ? '' : `（${CURRENCY_LABEL[c.currency]}）`
  const head = `${meta.emoji} ${meta.label}｜${c.name}${cur} (${c.code})`

  if (c.kind === 'direct_only') {
    return `${head}\n    基金已开放，但代销渠道无额度，需在${c.company}自家 App 申购`
  }
  if (c.kind === 'new_fund') {
    return `${head}\n    当前额度 ${describeState(c.toState, c.toLimit)}`
  }
  const from = describeState(c.fromState, c.fromLimit ?? null)
  const to = describeState(c.toState, c.toLimit)
  const tail = c.toState === 'direct_only' ? `（仅${c.company}直销可买）` : ''
  return `${head}\n    ${from} → ${to}${tail}`
}

function describeState(state: PurchaseState | undefined, limit: number | null): string {
  return state ? formatFundLimit({ state, limit }) : formatLimit(limit)
}
