import { INDEX_LABEL } from '@/lib/format'
import type { IndexQuote, IndicesSnapshot, QuoteKey, VixQuote } from '@/lib/types'

const UA = 'Mozilla/5.0'
const HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
]

const TIMEOUT_MS = 20_000
const RETRY = 3
/** Yahoo 的 range=max 经常只返回约半年数据，必须显式拉从 1980 起的日线才能算 ATH */
const PERIOD1 = 315532800

const TRACKED: Array<{
  key: QuoteKey
  symbol: string
  yahoo: string
  name: string
  /** 失败则整份快照作废。SMH 失败只跳过，由落盘时沿用上次 */
  required: boolean
}> = [
  { key: 'NDX', symbol: '^NDX', yahoo: '%5ENDX', name: INDEX_LABEL.NDX, required: true },
  { key: 'SPX', symbol: '^GSPC', yahoo: '%5EGSPC', name: INDEX_LABEL.SPX, required: true },
  { key: 'SMH', symbol: 'SMH', yahoo: 'SMH', name: 'SMH 半导体', required: false },
]

export interface DailyBar {
  date: string
  high: number | null
  close: number | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function tradingDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  })
}

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: { quote?: Array<{ high?: Array<number | null>; close?: Array<number | null> }> }
    }>
    error?: { description?: string } | null
  }
}

export function chartUrl(
  yahooSymbol: string,
  nowSec = Math.floor(Date.now() / 1000),
  host = HOSTS[0],
): string {
  return `${host}/v8/finance/chart/${yahooSymbol}?interval=1d&period1=${PERIOD1}&period2=${nowSec}`
}

/** 只要最近收盘时不必拉全历史，缩短窗口降低 429 */
export function lastCloseUrl(
  yahooSymbol: string,
  nowSec = Math.floor(Date.now() / 1000),
  host = HOSTS[0],
): string {
  const period1 = nowSec - 40 * 24 * 3600
  return `${host}/v8/finance/chart/${yahooSymbol}?interval=1d&period1=${period1}&period2=${nowSec}`
}

async function requestYahoo(
  buildUrl: (host: string, nowSec: number) => string,
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  let lastErr: unknown
  for (let attempt = 1; attempt <= RETRY; attempt++) {
    const url = buildUrl(HOSTS[(attempt - 1) % HOSTS.length], nowSec)
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 429) throw new Error('HTTP 429')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastErr = err
      if (attempt < RETRY) {
        const msg = err instanceof Error ? err.message : ''
        await sleep(msg.includes('429') ? (attempt === 1 ? 5000 : 15000) : attempt === 1 ? 1000 : 3000)
      }
    }
  }
  throw new Error(`Yahoo 请求失败: ${lastErr instanceof Error ? lastErr.message : lastErr}`)
}

export function parseYahooChart(text: string): DailyBar[] {
  const json = JSON.parse(text) as YahooChart
  const err = json.chart?.error
  if (err?.description) throw new Error(err.description)
  const result = json.chart?.result?.[0]
  const ts = result?.timestamp
  const quote = result?.indicators?.quote?.[0]
  if (!ts?.length || !quote) throw new Error('Yahoo 日线为空')

  const highs = quote.high ?? []
  const closes = quote.close ?? []
  const bars: DailyBar[] = []
  for (let i = 0; i < ts.length; i++) {
    const high = Number.isFinite(highs[i] as number) ? (highs[i] as number) : null
    const close = Number.isFinite(closes[i] as number) ? (closes[i] as number) : null
    if (high === null && close === null) continue
    bars.push({ date: tradingDate(ts[i]), high, close })
  }
  if (bars.length === 0) throw new Error('Yahoo 日线无有效 K 线')
  return bars
}

export function summarizeBars(
  key: QuoteKey,
  symbol: string,
  name: string,
  bars: DailyBar[],
): IndexQuote {
  let ath = -Infinity
  let athDate = ''
  let close: number | null = null
  let closeDate = ''

  for (const bar of bars) {
    if (bar.high != null && bar.high > ath) {
      ath = bar.high
      athDate = bar.date
    }
    if (bar.close != null) {
      close = bar.close
      closeDate = bar.date
    }
  }

  if (!Number.isFinite(ath) || ath <= 0 || close == null || close <= 0) {
    throw new Error(`${symbol} 日线不足以计算回撤`)
  }

  return {
    key,
    symbol,
    name,
    close: round2(close),
    closeDate,
    ath: round2(ath),
    athDate,
    drawdownPct: round2(((close - ath) / ath) * 100),
  }
}

export function summarizeLastClose(symbol: string, name: string, bars: DailyBar[]): VixQuote {
  let close: number | null = null
  let closeDate = ''
  for (const bar of bars) {
    if (bar.close != null) {
      close = bar.close
      closeDate = bar.date
    }
  }
  if (close == null || close <= 0) {
    throw new Error(`${symbol} 日线无收盘`)
  }
  return { symbol, name, close: round2(close), closeDate }
}

async function fetchOne(item: (typeof TRACKED)[number]): Promise<IndexQuote> {
  const text = await requestYahoo((host, nowSec) => chartUrl(item.yahoo, nowSec, host))
  return summarizeBars(item.key, item.symbol, item.name, parseYahooChart(text))
}

/**
 * 可选行情本轮没抓到时沿用上次，已抓到的不用旧值覆盖。
 * VIX 同样：本轮为 null 时保留上一份。
 */
export function mergeCarriedQuotes(
  next: IndicesSnapshot,
  prev: IndicesSnapshot | null,
): IndicesSnapshot {
  const have = new Set(next.indices.map((q) => q.key))
  const carried: IndexQuote[] = []
  if (prev) {
    for (const item of TRACKED) {
      if (item.required || have.has(item.key)) continue
      const old = prev.indices.find((q) => q.key === item.key)
      if (old) carried.push(old)
    }
  }
  return {
    ...next,
    indices: [...next.indices, ...carried],
    vix: next.vix ?? prev?.vix ?? null,
  }
}

async function fetchVix(): Promise<VixQuote> {
  const text = await requestYahoo((host, nowSec) => lastCloseUrl('%5EVIX', nowSec, host))
  return summarizeLastClose('^VIX', '恐慌指数', parseYahooChart(text))
}

/** 纳指/标普都成功才返回快照。SMH、VIX 失败时对应字段留空，由落盘沿用旧值 */
export async function fetchIndicesSnapshot(): Promise<IndicesSnapshot | null> {
  try {
    // 串行，避免全历史日线并行把 Yahoo 打成 429
    const quotes: IndexQuote[] = []
    for (const item of TRACKED) {
      try {
        quotes.push(await fetchOne(item))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (item.required) throw err
        console.warn(`${item.name} 抓取失败，沿用上次: ${msg}`)
      }
    }
    let vix: VixQuote | null = null
    try {
      vix = await fetchVix()
    } catch (err) {
      console.warn(`VIX 抓取失败: ${err instanceof Error ? err.message : err}`)
    }
    return {
      fetchedAt: new Date().toISOString(),
      source: 'yahoo',
      indices: quotes,
      vix,
    }
  } catch (err) {
    console.warn(`指数抓取失败，沿用上次: ${err instanceof Error ? err.message : err}`)
    return null
  }
}
