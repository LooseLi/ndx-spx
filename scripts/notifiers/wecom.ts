import { renderMarkdown } from './render'
import { postJson, type Notifier, type NotifyPayload } from './types'

/**
 * 企业微信群机器人。群设置 -> 添加群机器人 -> 复制 webhook,
 * 填到环境变量 WECOM_WEBHOOK。
 */
export const wecomNotifier: Notifier = {
  name: 'wecom',

  isEnabled() {
    return Boolean(process.env.WECOM_WEBHOOK)
  },

  async send(payload: NotifyPayload) {
    const webhook = process.env.WECOM_WEBHOOK as string
    const content = `## ${payload.title}\n\n${renderMarkdown(payload)}`

    const res = await postJson(webhook, {
      msgtype: 'markdown',
      // 企微单条消息上限 4096 字节，留出余量截断
      markdown: { content: content.slice(0, 3800) },
    })

    const parsed = JSON.parse(res) as { errcode?: number; errmsg?: string }
    if (parsed.errcode && parsed.errcode !== 0) {
      throw new Error(`企业微信返回错误 ${parsed.errcode}: ${parsed.errmsg}`)
    }
  },
}
