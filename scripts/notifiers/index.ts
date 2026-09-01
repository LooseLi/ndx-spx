import { feishuNotifier } from './feishu'
import { wecomNotifier } from './wecom'
import { serverChanNotifier, wxPusherNotifier } from './wechat'
import type { Notifier, NotifyPayload } from './types'

/** 所有可用渠道。新增渠道在这里注册即可 */
export const ALL_NOTIFIERS: Notifier[] = [
  feishuNotifier,
  wecomNotifier,
  serverChanNotifier,
  wxPusherNotifier,
]

export function enabledNotifiers(): Notifier[] {
  return ALL_NOTIFIERS.filter((n) => n.isEnabled())
}

/**
 * 向所有已配置渠道推送。单个渠道失败不影响其他渠道，
 * 返回失败列表由调用方决定是否让任务失败。
 */
export async function dispatch(payload: NotifyPayload): Promise<{ ok: string[]; failed: string[] }> {
  const targets = enabledNotifiers()
  const ok: string[] = []
  const failed: string[] = []

  await Promise.all(
    targets.map(async (n) => {
      try {
        await n.send(payload)
        ok.push(n.name)
        console.log(`[推送] ${n.name} 成功`)
      } catch (err) {
        failed.push(n.name)
        console.error(`[推送] ${n.name} 失败: ${(err as Error).message}`)
      }
    }),
  )

  return { ok, failed }
}

export type { Notifier, NotifyPayload }
