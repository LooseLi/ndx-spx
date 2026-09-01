import { createHmac } from 'node:crypto'
import { renderMarkdown } from './render'
import { postJson, type Notifier, type NotifyPayload } from './types'

/**
 * 飞书签名校验。机器人安全设置里勾了"签名校验"才需要，
 * 算法是把 "{timestamp}\n{secret}" 当 HMAC 密钥对空串做 SHA256。
 */
function sign(secret: string, timestamp: number): string {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64')
}

/**
 * 飞书自定义机器人。在群设置里添加"自定义机器人"拿到 webhook 地址，
 * 填到环境变量 FEISHU_WEBHOOK 即可，无需审核。
 * 若安全设置启用了签名校验，再把密钥填到 FEISHU_SECRET。
 */
export const feishuNotifier: Notifier = {
  name: 'feishu',

  isEnabled() {
    return Boolean(process.env.FEISHU_WEBHOOK)
  },

  async send(payload: NotifyPayload) {
    const webhook = process.env.FEISHU_WEBHOOK as string
    const secret = process.env.FEISHU_SECRET
    const timestamp = Math.floor(Date.now() / 1000)
    // 有"恢复申购"或"取消限额"这类好事时用绿色，只有额度下调/暂停时用红色
    const good = payload.changes.some((c) =>
      ['reopened', 'limit_up', 'limit_removed', 'direct_only'].includes(c.kind),
    )

    const res = await postJson(webhook, {
      ...(secret ? { timestamp: String(timestamp), sign: sign(secret, timestamp) } : {}),
      msg_type: 'interactive',
      card: {
        config: { wide_screen_mode: true },
        header: {
          template: good ? 'green' : 'red',
          title: { tag: 'plain_text', content: payload.title },
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: renderMarkdown(payload) } },
        ],
      },
    })

    const parsed = JSON.parse(res) as { code?: number; msg?: string }
    if (parsed.code && parsed.code !== 0) {
      // 这两个错误码都源自机器人的安全设置，直接把排查方向写出来
      const hint =
        parsed.code === 19021
          ? '（签名校验失败：FEISHU_SECRET 需与机器人安全设置里的密钥一致；未启用校验则应留空）'
          : parsed.code === 19024
            ? '（机器人设置了自定义关键词，消息标题里必须包含该关键词）'
            : ''
      throw new Error(`飞书返回错误 ${parsed.code}: ${parsed.msg}${hint}`)
    }
  },
}
