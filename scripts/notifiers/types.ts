import type { Change, Snapshot } from '@/lib/types'

export interface NotifyPayload {
  /** 消息标题，如 "3 只基金额度变更" */
  title: string
  changes: Change[]
  snapshot: Snapshot
  /** 网页地址，附在消息末尾方便点进去看全量 */
  siteUrl?: string
}

/**
 * 推送渠道统一接口。新增渠道只要实现它并注册进 notifiers/index.ts，
 * 不需要动抓取和 diff 逻辑。
 */
export interface Notifier {
  /** 渠道名，用于日志 */
  readonly name: string
  /** 依据环境变量判断是否启用。没配就自动跳过 */
  isEnabled(): boolean
  send(payload: NotifyPayload): Promise<void>
}

export async function postJson(url: string, body: unknown): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  return text
}
