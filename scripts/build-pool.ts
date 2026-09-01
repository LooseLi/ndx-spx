/**
 * 构建基金池：找出所有跟踪纳斯达克100 / 标普500 的场外基金。
 *
 * 用排行接口(多分类) + 搜索接口双源合并。单靠任何一个都会漏：
 * 排行接口的分类互斥，搜索接口每页只给 10 条。
 * 生成结果写入 data/pool.json，可以手工校订后提交。
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  detectCurrency,
  detectIndex,
  detectShareClass,
  fetchRankList,
  fetchSearch,
} from './lib/eastmoney'
import type { PoolEntry } from '@/lib/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const POOL_FILE = path.join(DATA_DIR, 'pool.json')

/** 排行接口的基金分类，纳指/标普主要在 zs 和 QDII 下 */
const RANK_CATEGORIES = ['zs', 'QDII', 'LOF', 'fof', 'gp', 'hh']

const SEARCH_KEYWORDS = ['纳斯达克100', '纳指100', '标普500']

/**
 * 纯场内 ETF 不能在场外申购（需要券商账户），不属于本项目关注范围。
 * 注意 16xxxx 是 LOF，场外可以申购，必须保留。
 */
function isExchangeOnly(code: string): boolean {
  return /^15\d{4}$/.test(code) || /^5\d{5}$/.test(code)
}

async function main() {
  const found = new Map<string, string>()

  for (const ft of RANK_CATEGORIES) {
    try {
      const list = await fetchRankList(ft)
      let hits = 0
      for (const { code, name } of list) {
        if (detectIndex(name)) {
          found.set(code, name)
          hits++
        }
      }
      console.log(`[排行] ft=${ft} 全量 ${list.length} 命中 ${hits}`)
    } catch (err) {
      console.warn(`[排行] ft=${ft} 失败: ${(err as Error).message}`)
    }
  }

  for (const kw of SEARCH_KEYWORDS) {
    for (let pi = 1; pi <= 8; pi++) {
      try {
        const list = await fetchSearch(kw, pi)
        if (list.length === 0) break
        for (const { code, name } of list) {
          if (/^\d{6}$/.test(code) && detectIndex(name)) found.set(code, name)
        }
        if (list.length < 10) break
      } catch (err) {
        console.warn(`[搜索] ${kw} p${pi} 失败: ${(err as Error).message}`)
        break
      }
    }
  }

  const entries: PoolEntry[] = []
  let skipped = 0
  for (const [code, name] of found) {
    if (isExchangeOnly(code)) {
      skipped++
      continue
    }
    const index = detectIndex(name)
    if (!index) continue
    entries.push({
      code,
      name,
      index,
      currency: detectCurrency(name),
      shareClass: detectShareClass(name),
    })
  }
  entries.sort((a, b) => (a.index === b.index ? a.code.localeCompare(b.code) : a.index < b.index ? -1 : 1))

  // 保留人工新增的条目：如果已有 pool.json 里有本次没搜到的基金，不要丢掉
  let preserved = 0
  try {
    const prev = JSON.parse(await readFile(POOL_FILE, 'utf8')) as PoolEntry[]
    const codes = new Set(entries.map((e) => e.code))
    for (const p of prev) {
      if (!codes.has(p.code) && !isExchangeOnly(p.code)) {
        entries.push(p)
        preserved++
      }
    }
  } catch {
    // 首次运行，没有历史文件
  }

  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(POOL_FILE, JSON.stringify(entries, null, 2) + '\n', 'utf8')

  const ndx = entries.filter((e) => e.index === 'NDX').length
  const cny = entries.filter((e) => e.currency === 'CNY').length
  console.log(
    `\n基金池已写入 ${POOL_FILE}\n` +
      `合计 ${entries.length} 只（纳指100 ${ndx} / 标普500 ${entries.length - ndx}），` +
      `其中人民币份额 ${cny} 只\n` +
      `剔除纯场内 ETF ${skipped} 只，保留历史条目 ${preserved} 只`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
