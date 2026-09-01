import type { Currency, FundSnapshot, IndexKey, PoolEntry, PurchaseState } from '@/lib/types'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 天天基金用 1000 亿作为"不限额"的哨兵值，而不是留空。
 * 任何 >= 该值的额度都应视为无限制。
 */
const UNLIMITED_SENTINEL = 1e11

const TIMEOUT_MS = 25_000
const RETRY = 3

async function request(url: string, referer = 'http://fund.eastmoney.com/'): Promise<string> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: referer },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastErr = err
      // 退避重试，避免被限流后连续打空
      if (attempt < RETRY) await sleep(500 * attempt)
    }
  }
  throw new Error(`请求失败 ${url}: ${lastErr instanceof Error ? lastErr.message : lastErr}`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 把接口的数字字段转成 number，'--'、''、null 统一为 null */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s === '--' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function normalizeState(sgzt: string): PurchaseState {
  const s = (sgzt || '').trim()
  if (s.includes('暂停') || s.includes('封闭') || s.includes('终止') || s.includes('停止')) {
    return 'suspended'
  }
  if (s.includes('限大额') || s.includes('限额')) return 'limited'
  if (s.includes('开放')) return 'open'
  return 'unknown'
}

/** 从基金名称推断计价币种 */
export function detectCurrency(name: string): Currency {
  if (name.includes('美元现钞') || name.includes('美钞')) return 'USD_CASH'
  if (name.includes('美元现汇') || name.includes('美汇') || name.includes('美元')) return 'USD_WIRE'
  return 'CNY'
}

/** 从基金名称推断份额类别，取名称末尾的单个大写字母 */
export function detectShareClass(name: string): string {
  const m = name.match(/\b([ACDEIH])(?:\s*[)）])?\s*$/)
  if (m) return m[1]
  const m2 = name.match(/(?:QDII[^)]*\))\s*([ACDEIH])/)
  return m2 ? m2[1] : ''
}

/** 从基金名称推断跟踪的指数 */
export function detectIndex(name: string): IndexKey | null {
  if (name.includes('纳斯达克100') || name.includes('纳指100')) return 'NDX'
  if (name.includes('标普500')) return 'SPX'
  return null
}

interface BasicInfoRaw {
  SHORTNAME?: string
  JJGS?: string
  SGZT?: string
  SGZTMARK?: string | null
  SHZT?: string
  MAXSG?: string
  MINSG?: string
  MINDT?: string
  DTZT?: string
  BUY?: boolean
  DWJZ?: string
  FSRQ?: string
  ENDNAV?: string
}

/**
 * 抓取单只基金的申购状态与额度。
 *
 * 这个接口是整个项目的核心数据源，三个必须小心的点：
 * 1. MAXSG 用 1e11 表示不限额，不是留空；
 * 2. 暂停申购时 MAXSG 会残留上一次的额度值，必须以状态为准覆盖成 0，
 *    否则会把买不进去的基金报成"可买 100 元"；
 * 3. 状态文案和 BUY 会打架。F、I 类份额常见 SGZT 写着"限大额"但 BUY=false
 *    且 MAXSG='--'，原因是这些份额只在基金公司自家 App 卖，代销渠道拿不到额度，
 *    并非基金暂停申购。这类归为 direct_only 而不是 suspended——场外额度紧张时
 *    直销往往比代销宽松，标成暂停会让人错过唯一买得进去的通道。
 */
export async function fetchFundSnapshot(entry: PoolEntry): Promise<FundSnapshot> {
  const url =
    `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBasicInformation?FCODE=${entry.code}` +
    `&deviceid=1&plat=Android&product=EFund&version=6.2.8`
  const text = await request(url)
  const parsed = JSON.parse(text) as { Datas?: BasicInfoRaw }
  const d = parsed.Datas
  if (!d || !d.SHORTNAME) throw new Error(`${entry.code} 返回数据为空`)

  const buyable = d.BUY === true
  const rawMax = num(d.MAXSG)
  let state = normalizeState(d.SGZT ?? '')
  let note = d.SGZTMARK?.trim() || null

  // 基金没暂停但代销渠道买不了，说明是直销专属份额
  if (!buyable && state !== 'suspended') {
    state = 'direct_only'
    note = `仅基金公司直销渠道（${d.JJGS ?? '基金公司'}自家 App）可申购，代销渠道无额度`
  }

  let limit: number | null
  if (state === 'suspended') {
    limit = 0
  } else if (state === 'direct_only') {
    // 代销接口给不出直销额度，留空并由 state 承载语义
    limit = null
  } else if (state === 'limited' && rawMax === null) {
    // 明确限大额却拿不到额度数值，是数据不完整而非不限额。
    // 降级为 unknown，让 diff 跳过它，避免误报成利好
    state = 'unknown'
    limit = null
  } else if (rawMax === null || rawMax >= UNLIMITED_SENTINEL) {
    limit = null
  } else {
    limit = rawMax
  }

  return {
    code: entry.code,
    name: d.SHORTNAME ?? entry.name,
    company: d.JJGS ?? '',
    index: entry.index,
    currency: entry.currency,
    shareClass: entry.shareClass,
    state,
    stateText: (d.SGZT ?? '').trim() || '未知',
    stateNote: note,
    limit,
    minPurchase: num(d.MINSG),
    aipOpen: String(d.DTZT ?? '') === '1',
    aipMin: num(d.MINDT),
    redeemStatus: (d.SHZT ?? '').trim(),
    nav: num(d.DWJZ),
    navDate: d.FSRQ?.trim() || null,
    scale: num(d.ENDNAV),
  }
}

/**
 * 天天基金排行接口。分类之间互斥，纳指/标普的场外基金主要落在
 * "指数型(zs)" 下，少数在 QDII 下，所以需要多分类合并。
 * 注意不要带 dx=1 参数，它会过滤掉一批基金。
 */
export async function fetchRankList(ft: string): Promise<Array<{ code: string; name: string }>> {
  const url =
    `http://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=${ft}` +
    `&rs=&gs=0&sc=zzf&st=desc&pi=1&pn=8000`
  const text = await request(url, 'http://fund.eastmoney.com/data/fundranking.html')
  const block = text.match(/datas:\[(.*?)\],allRecords/s)
  if (!block) return []
  const out: Array<{ code: string; name: string }> = []
  for (const m of block[1].matchAll(/"(.*?)"/g)) {
    const cols = m[1].split(',')
    if (cols.length >= 2 && cols[0] && cols[1]) out.push({ code: cols[0], name: cols[1] })
  }
  return out
}

/** 天天基金搜索接口，每页固定 10 条，用于补齐排行接口的遗漏 */
export async function fetchSearch(keyword: string, pageIndex: number) {
  const url =
    `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1` +
    `&key=${encodeURIComponent(keyword)}&pageindex=${pageIndex}&pagesize=50`
  const text = await request(url)
  const parsed = JSON.parse(text) as { Datas?: Array<{ CODE?: string; NAME?: string }> }
  return (parsed.Datas ?? [])
    .filter((x) => x.CODE && x.NAME)
    .map((x) => ({ code: x.CODE as string, name: x.NAME as string }))
}

/** 带并发上限的 map，避免把数据源打挂 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ item: T; value?: R; error?: Error }>> {
  const results: Array<{ item: T; value?: R; error?: Error }> = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      try {
        results[i] = { item: items[i], value: await fn(items[i]) }
      } catch (err) {
        results[i] = { item: items[i], error: err instanceof Error ? err : new Error(String(err)) }
      }
    }
  })
  await Promise.all(workers)
  return results
}
