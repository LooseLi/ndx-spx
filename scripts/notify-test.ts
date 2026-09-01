/**
 * 推送自检：用当前快照构造一批模拟变更，渲染出消息内容。
 *
 *   npm run notify:preview   只打印消息，不发送
 *   npm run notify:test      向所有已配置渠道真实发送一条测试消息
 *
 * 用来验证 webhook 配得对不对，不用等真的额度变动。
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Change, Snapshot } from '@/lib/types'
import { dispatch, enabledNotifiers } from './notifiers'
import { renderMarkdown } from './notifiers/render'

const SEND = process.argv.includes('--send')

async function main() {
  const snapshot = JSON.parse(
    await readFile(path.join(process.cwd(), 'data', 'latest.json'), 'utf8'),
  ) as Snapshot

  const changes = buildMockChanges(snapshot)
  if (changes.length === 0) {
    throw new Error('快照里没有足够的基金用于构造测试消息，请先执行 npm run track')
  }

  const payload = {
    title: `[测试] ${changes.length} 项额度变更`,
    changes,
    snapshot,
    siteUrl: process.env.SITE_URL,
  }

  console.log('=== 消息标题 ===')
  console.log(payload.title)
  console.log('\n=== 消息正文 ===')
  console.log(renderMarkdown(payload))

  const targets = enabledNotifiers()
  console.log(
    `\n=== 已启用渠道 ===\n${targets.length ? targets.map((t) => t.name).join(', ') : '（无，检查环境变量）'}`,
  )

  if (!SEND) {
    console.log('\n加 --send 参数可真实发送。当前仅预览。')
    return
  }
  if (targets.length === 0) throw new Error('没有可用渠道，无法发送')

  const result = await dispatch(payload)
  console.log(`\n发送完成：成功 [${result.ok.join(', ')}] 失败 [${result.failed.join(', ')}]`)
  if (result.ok.length === 0) process.exit(1)
}

/** 拿真实基金拼出各种类型的变更，覆盖消息模板的所有分支 */
function buildMockChanges(snapshot: Snapshot): Change[] {
  const cny = snapshot.funds.filter((f) => f.currency === 'CNY')
  const suspended = cny.filter((f) => f.state === 'suspended')
  const limited = cny.filter((f) => f.state === 'limited')

  const changes: Change[] = []
  const base = (f: (typeof cny)[number]) => ({
    code: f.code,
    name: f.name,
    company: f.company,
    index: f.index,
    currency: f.currency,
  })

  if (suspended[0]) {
    changes.push({
      kind: 'reopened',
      ...base(suspended[0]),
      fromLimit: 0,
      toLimit: 50_000,
      fromState: 'suspended',
      toState: 'limited',
    })
  }
  if (limited[0]) {
    changes.push({
      kind: 'limit_up',
      ...base(limited[0]),
      fromLimit: limited[0].limit,
      toLimit: 10_000,
      fromState: 'limited',
      toState: 'limited',
    })
  }
  if (limited[1]) {
    changes.push({
      kind: 'limit_removed',
      ...base(limited[1]),
      fromLimit: limited[1].limit,
      toLimit: null,
      fromState: 'limited',
      toState: 'open',
    })
  }
  if (limited[2]) {
    changes.push({
      kind: 'suspended',
      ...base(limited[2]),
      fromLimit: limited[2].limit,
      toLimit: 0,
      fromState: 'limited',
      toState: 'suspended',
    })
  }
  const direct = cny.find((f) => f.state === 'direct_only') ?? suspended[1]
  if (direct) {
    changes.push({
      kind: 'direct_only',
      ...base(direct),
      fromLimit: 0,
      toLimit: null,
      fromState: 'suspended',
      toState: 'direct_only',
    })
  }
  return changes
}

main().catch((err) => {
  console.error(`\n失败: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
