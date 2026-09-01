import { CHANGE_META, INDEX_LABEL, describeChange, formatFundLimit } from '@/lib/format'
import type { Change } from '@/lib/types'
import type { NotifyPayload } from './types'

/** 按事件类型分组，保持 diff 里排好的优先级顺序 */
function groupByKind(changes: Change[]): Array<[Change['kind'], Change[]]> {
  const groups = new Map<Change['kind'], Change[]>()
  for (const c of changes) {
    const list = groups.get(c.kind) ?? []
    list.push(c)
    groups.set(c.kind, list)
  }
  return [...groups.entries()]
}

/** 生成推送正文，飞书 lark_md / 企微 markdown / Server酱 都能用 */
export function renderMarkdown(payload: NotifyPayload): string {
  const { changes, snapshot, siteUrl } = payload
  const lines: string[] = []

  for (const [kind, list] of groupByKind(changes)) {
    const meta = CHANGE_META[kind]
    lines.push(`**${meta.emoji} ${meta.label}（${list.length}）**`)
    for (const c of list) {
      lines.push(describeChange(c).split('\n').slice(0, 2).join('\n'))
    }
    lines.push('')
  }

  // 附上当前可买清单，收到提醒时不用再去翻网页。
  // 只列代销直接买得到的，direct_only 的额度拿不到，混进来会显示成"不限额"
  const buyable = snapshot.funds
    .filter((f) => f.currency === 'CNY' && (f.state === 'open' || f.state === 'limited'))
    .sort((a, b) => (b.limit ?? Infinity) - (a.limit ?? Infinity))
    .slice(0, 8)

  if (buyable.length > 0) {
    lines.push('**当前代销额度最宽松（人民币份额）**')
    for (const f of buyable) {
      lines.push(`· ${INDEX_LABEL[f.index]}｜${f.name} (${f.code})　${formatFundLimit(f)}`)
    }
    lines.push('（天天基金代销额度，直销 App 可能不同）')
    lines.push('')
  }

  const directOnly = snapshot.funds.filter((f) => f.currency === 'CNY' && f.state === 'direct_only')
  if (directOnly.length > 0) {
    lines.push(`**仅直销可买（${directOnly.length} 只，额度未披露）**`)
    for (const f of directOnly.slice(0, 5)) {
      lines.push(`· ${f.name} (${f.code})　查${f.company} App`)
    }
    lines.push('')
  }

  const time = new Date(snapshot.fetchedAt).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
  lines.push(`数据时间 ${time}　仅供参考，申购以基金公司公告为准`)
  if (siteUrl) lines.push(`[查看全部基金额度](${siteUrl})`)

  return lines.join('\n')
}

/** 纯文本版，给不支持 markdown 的渠道 */
export function renderPlainText(payload: NotifyPayload): string {
  return renderMarkdown(payload)
    .replace(/\*\*/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1 $2')
}
