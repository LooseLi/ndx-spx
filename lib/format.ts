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

export interface LimitDisplayFund {
  state: PurchaseState
  limit: number | null
  company?: string
}

/**
 * 额度列主文案。天天基金接口只给代销渠道额度；
 * direct_only 在接口里 MAXSG 常为空，不能填数字也不能写成「不限额」。
 */
export function formatFundLimit(fund: LimitDisplayFund): string {
  switch (fund.state) {
    case 'suspended':
      return '不可申购'
    case 'direct_only':
      return '未披露'
    case 'unknown':
      return '未知'
    default:
      return formatLimit(fund.limit)
  }
}

/** 额度列副文案，解释渠道差异或指引去 App 查看 */
export function formatFundLimitHint(fund: LimitDisplayFund): string | null {
  switch (fund.state) {
    case 'open':
    case 'limited':
      return '天天基金代销'
    case 'direct_only':
      return fund.company ? `查${fund.company} App` : '查基金公司 App'
    default:
      return null
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
  reopened: { emoji: '🟢', label: '代销恢复申购' },
  limit_up: { emoji: '📈', label: '代销额度提升' },
  limit_removed: { emoji: '🎉', label: '代销取消限额' },
  direct_only: { emoji: '🏦', label: '直销开放' },
  new_fund: { emoji: '🆕', label: '新增基金' },
  limit_down: { emoji: '📉', label: '代销额度下调' },
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
    return `${head}\n    代销渠道仍不可买，基金已在${c.company} App 开放（额度未披露，需 App 查看）`
  }
  if (c.kind === 'new_fund') {
    return `${head}\n    当前代销额度 ${describeState(c.toState, c.toLimit, c.company)}`
  }
  const from = describeState(c.fromState, c.fromLimit ?? null, c.company)
  const to = describeState(c.toState, c.toLimit, c.company)
  const tail =
    c.toState === 'direct_only'
      ? `（代销无数据，需查${c.company} App）`
      : c.toState === 'open' || c.toState === 'limited'
        ? '（天天基金代销额度，直销可能不同）'
        : ''
  return `${head}\n    代销 ${from} → ${to}${tail}`
}

function describeState(
  state: PurchaseState | undefined,
  limit: number | null,
  company?: string,
): string {
  return state ? formatFundLimit({ state, limit, company }) : formatLimit(limit)
}
