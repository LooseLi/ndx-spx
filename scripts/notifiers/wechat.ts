import { renderMarkdown } from './render'
import { postJson, type Notifier, type NotifyPayload } from './types'

/**
 * 个人微信没有官方开放接口，必须经第三方服务中转。
 * 这里提供两个常用选择，配了哪个就用哪个，也可以同时开。
 */

/** Server 酱 Turbo：sct.ftqq.com 扫码绑定微信后拿 SendKey */
export const serverChanNotifier: Notifier = {
  name: 'serverchan',

  isEnabled() {
    return Boolean(process.env.SERVERCHAN_SENDKEY)
  },

  async send(payload: NotifyPayload) {
    const key = process.env.SERVERCHAN_SENDKEY as string
    const res = await postJson(`https://sctapi.ftqq.com/${key}.send`, {
      title: payload.title,
      desp: renderMarkdown(payload),
    })

    const parsed = JSON.parse(res) as { code?: number; message?: string }
    if (parsed.code !== undefined && parsed.code !== 0) {
      throw new Error(`Server酱返回错误 ${parsed.code}: ${parsed.message}`)
    }
  },
}

/**
 * WxPusher：wxpusher.zjiecode.com 创建应用拿 appToken，
 * 关注二维码后拿到 UID。UID 支持逗号分隔多个，或改用 topicId 群发。
 */
export const wxPusherNotifier: Notifier = {
  name: 'wxpusher',

  isEnabled() {
    return Boolean(
      process.env.WXPUSHER_APP_TOKEN &&
        (process.env.WXPUSHER_UIDS || process.env.WXPUSHER_TOPIC_IDS),
    )
  },

  async send(payload: NotifyPayload) {
    const uids = split(process.env.WXPUSHER_UIDS)
    const topicIds = split(process.env.WXPUSHER_TOPIC_IDS).map(Number).filter(Number.isFinite)

    const res = await postJson('https://wxpusher.zjiecode.com/api/send/message', {
      appToken: process.env.WXPUSHER_APP_TOKEN,
      contentType: 3, // markdown
      summary: payload.title.slice(0, 20), // 微信通知栏摘要上限 20 字
      content: `## ${payload.title}\n\n${renderMarkdown(payload)}`,
      uids,
      topicIds,
    })

    const parsed = JSON.parse(res) as { code?: number; msg?: string }
    if (parsed.code !== 1000) {
      throw new Error(`WxPusher 返回错误 ${parsed.code}: ${parsed.msg}`)
    }
  },
}

function split(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
