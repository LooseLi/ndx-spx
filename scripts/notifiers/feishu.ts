import { renderMarkdown } from './render'
import { postJson, type Notifier, type NotifyPayload } from './types'

/**
 * 飞书自定义机器人。在群设置里添加"自定义机器人"拿到 webhook 地址，
 * 填到环境变量 FEISHU_WEBHOOK 即可，无需审核。
 */
export const feishuNotifier: Notifier = {
  name: 'feishu',

  isEnabled() {
    return Boolean(process.env.FEISHU_WEBHOOK)
  },

  async send(payload: NotifyPayload) {
    const webhook = process.env.FEISHU_WEBHOOK as string
    // 有"恢复申购"或"取消限额"这类好事时用绿色，只有额度下调/暂停时用红色
    const good = payload.changes.some((c) =>
      ['reopened', 'limit_up', 'limit_removed', 'aip_reopened'].includes(c.kind),
    )

    const res = await postJson(webhook, {
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
      throw new Error(`飞书返回错误 ${parsed.code}: ${parsed.msg}`)
    }
  },
}
