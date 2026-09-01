/** 跟踪的指数 */
export type IndexKey = 'NDX' | 'SPX'

/** 份额计价币种。美元份额需要外币账户，普通用户通常只关心 CNY */
export type Currency = 'CNY' | 'USD_WIRE' | 'USD_CASH'

/** 申购状态，归一化后的枚举 */
export type PurchaseState =
  | 'open' // 开放申购，无额度限制
  | 'limited' // 限大额，有单日累计上限
  | 'direct_only' // 基金本身开放，但代销渠道买不了，需去基金公司直销（F/I 类份额常见）
  | 'suspended' // 基金公司暂停申购，任何渠道都买不了
  | 'unknown' // 接口未给出可识别状态

/** 基金池条目，由 build-pool 生成，人工可校订 */
export interface PoolEntry {
  code: string
  name: string
  index: IndexKey
  currency: Currency
  /** A/C/D/E/I 等份额类别，取不到时为空串 */
  shareClass: string
}

/** 单只基金的一次抓取结果 */
export interface FundSnapshot {
  code: string
  name: string
  company: string
  index: IndexKey
  currency: Currency
  shareClass: string

  state: PurchaseState
  /** 接口原文，如 "限大额" */
  stateText: string
  /** 接口的限额说明文案，如 "限大额(单日累计购买上限10元。)" */
  stateNote: string | null

  /**
   * 单日累计申购上限（元）。仅在 state 为 open / limited 时有意义，
   * null 表示不限额，0 表示暂停。
   * state 为 direct_only 时代销接口拿不到直销额度，一律为 null，
   * 此时不可解读为"不限额"——展示与比对都应走 state 分支。
   * 注意不能直接用接口的 MAXSG，暂停申购时该字段会残留旧额度。
   */
  limit: number | null

  redeemStatus: string

  /**
   * 接口给出的跟踪标的代码，如 NDX100 / SPX / SP500EWTR。
   * 比按名称猜可靠，用来区分标普500与标普500等权重这类实为不同标的的基金。
   * FOF 类基金不直接跟踪指数，此处为 null。
   */
  indexCode: string | null
  indexName: string | null

  /** 近一年收益率（百分数，17.03 表示 17.03%） */
  yield1y: number | null

  /** 基金规模（元） */
  scale: number | null
}

/** 一次完整抓取的快照文件 */
export interface Snapshot {
  /** ISO 时间戳 */
  fetchedAt: string
  /** 成功抓取的基金数 */
  okCount: number
  /** 抓取失败的基金代码 */
  failed: string[]
  funds: FundSnapshot[]
}

/** 变更事件类型，数组顺序即推送时的优先级 */
export const CHANGE_KINDS = [
  'reopened', // 代销渠道恢复可买，最高价值
  'limit_up', // 额度提升
  'limit_removed', // 有限额 -> 不限额
  'direct_only', // 全面暂停 -> 仅直销可买，提示可去基金公司 App 申购
  'new_fund', // 新入池
  'limit_down', // 额度下调
  'suspended', // 可买 -> 买不了
] as const

export type ChangeKind = (typeof CHANGE_KINDS)[number]

export interface Change {
  kind: ChangeKind
  code: string
  name: string
  company: string
  index: IndexKey
  currency: Currency
  /** 变更前的额度，新基金为 undefined */
  fromLimit?: number | null
  toLimit: number | null
  fromState?: PurchaseState
  toState: PurchaseState
}
