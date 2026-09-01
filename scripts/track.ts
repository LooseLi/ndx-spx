/**
 * 主任务：抓取基金池当前额度 -> 与上次快照 diff -> 推送变更 -> 落盘。
 *
 * 用法：
 *   npm run track            正常执行
 *   npm run track:dry        只抓取和比对，不写文件不推送
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fetchFundSnapshot, mapLimit } from './lib/eastmoney'
import { diffSnapshots } from './lib/diff'
import { CHANGE_META, describeChange, formatFundLimit, STATE_LABEL } from '@/lib/format'
import type { Change, PoolEntry, Snapshot } from '@/lib/types'
import { dispatch, enabledNotifiers } from './notifiers'

const DATA_DIR = path.join(process.cwd(), 'data')
const POOL_FILE = path.join(DATA_DIR, 'pool.json')
const LATEST_FILE = path.join(DATA_DIR, 'latest.json')
const CHANGES_FILE = path.join(DATA_DIR, 'changes.json')
const HISTORY_DIR = path.join(DATA_DIR, 'history')

const CONCURRENCY = 8
/** 失败率超过这个比例就认为数据源异常，放弃本轮，不污染基线 */
const MAX_FAILURE_RATIO = 0.3
/** 变更日志保留条数，够前端时间线展示 */
const CHANGES_KEEP = 300

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  const pool = JSON.parse(await readFile(POOL_FILE, 'utf8')) as PoolEntry[]
  console.log(`基金池 ${pool.length} 只，开始抓取（并发 ${CONCURRENCY}）...`)

  const results = await mapLimit(pool, CONCURRENCY, fetchFundSnapshot)
  const funds = results.flatMap((r) => (r.value ? [r.value] : []))
  const failed = results.filter((r) => r.error)

  for (const f of failed) {
    console.warn(`[抓取失败] ${f.item.code} ${f.item.name}: ${f.error?.message}`)
  }

  const failureRatio = failed.length / pool.length
  console.log(`抓取完成：成功 ${funds.length}，失败 ${failed.length}`)

  // 数据源大面积失败时宁可什么都不做，也不能写入残缺快照——
  // 否则下一轮会把缺失的基金当成"新增"或"额度归零"疯狂误报
  if (failureRatio > MAX_FAILURE_RATIO) {
    throw new Error(
      `失败率 ${(failureRatio * 100).toFixed(1)}% 超过阈值，疑似数据源异常，本轮放弃写入`,
    )
  }

  const snapshot: Snapshot = {
    fetchedAt: new Date().toISOString(),
    okCount: funds.length,
    failed: failed.map((f) => f.item.code),
    funds,
  }

  const prev = await readJson<Snapshot>(LATEST_FILE)
  const changes = diffSnapshots(prev, snapshot)

  printSummary(snapshot, changes, prev === null)

  if (DRY_RUN) {
    console.log('\n[dry-run] 跳过写入与推送')
    return
  }

  await persist(snapshot, changes)

  if (changes.length === 0) {
    console.log('无变更，静默退出')
    return
  }

  const targets = enabledNotifiers()
  if (targets.length === 0) {
    console.log('未配置任何推送渠道，跳过推送（数据已落盘）')
    return
  }

  const result = await dispatch({
    title: buildTitle(changes),
    changes,
    snapshot,
    siteUrl: process.env.SITE_URL,
  })

  if (result.ok.length === 0) {
    throw new Error(`所有推送渠道均失败: ${result.failed.join(', ')}`)
  }
}

function buildTitle(changes: Change[]): string {
  const top = changes[0]
  const meta = CHANGE_META[top.kind]
  if (changes.length === 1) {
    return `${meta.label}｜${top.name} ${formatFundLimit({ state: top.toState, limit: top.toLimit })}`
  }
  return `${meta.label}等 ${changes.length} 项额度变更`
}

function printSummary(snapshot: Snapshot, changes: Change[], isFirstRun: boolean) {
  const cny = snapshot.funds.filter((f) => f.currency === 'CNY')
  // 只统计代销直接买得到的，direct_only 的额度接口给不出来
  const buyable = cny.filter((f) => f.state === 'open' || f.state === 'limited')
  const counts = new Map<string, number>()
  for (const f of cny) counts.set(f.state, (counts.get(f.state) ?? 0) + 1)

  console.log('\n--- 人民币份额状态分布 ---')
  for (const [state, n] of counts) {
    console.log(`  ${STATE_LABEL[state as keyof typeof STATE_LABEL]}: ${n}`)
  }

  const top = [...buyable].sort((a, b) => (b.limit ?? Infinity) - (a.limit ?? Infinity)).slice(0, 5)
  console.log('--- 代销额度最宽松 ---')
  for (const f of top) {
    console.log(`  ${formatFundLimit(f).padStart(6)}  ${f.code}  ${f.name}`)
  }

  if (isFirstRun) {
    console.log('\n首次运行，建立基线快照，不产生提醒')
    return
  }
  console.log(`\n--- 变更 ${changes.length} 项 ---`)
  for (const c of changes) console.log(describeChange(c))
}

async function persist(snapshot: Snapshot, changes: Change[]) {
  await mkdir(HISTORY_DIR, { recursive: true })
  await writeFile(LATEST_FILE, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')

  // 每天一份快照，当天多次运行则覆盖，避免仓库膨胀
  const day = shanghaiDate(snapshot.fetchedAt)
  await writeFile(
    path.join(HISTORY_DIR, `${day}.json`),
    JSON.stringify(snapshot, null, 2) + '\n',
    'utf8',
  )

  if (changes.length === 0) return

  const log = (await readJson<Array<{ at: string; changes: Change[] }>>(CHANGES_FILE)) ?? []
  log.unshift({ at: snapshot.fetchedAt, changes })
  await writeFile(
    CHANGES_FILE,
    JSON.stringify(log.slice(0, CHANGES_KEEP), null, 2) + '\n',
    'utf8',
  )
}

function shanghaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

main().catch((err) => {
  console.error(`\n任务失败: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
