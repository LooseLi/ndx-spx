import { INDEX_LABEL } from '@/lib/format'
import type { IndexKey, IndexQuote, IndicesSnapshot } from '@/lib/types'

const UA = 'Mozilla/5.0'
const HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
]

const TIMEOUT_MS = 20_000
const RETRY = 3
/** Yahoo 的 range=max 经常只返回约半年数据，必须显式拉从 1980 起的日线才能算 ATH */
const PERIOD1 = 315532800

const TRACKED = [
  { key: 'NDX' as const, symbol: '^NDX', yahoo: '%5ENDX' },
  { key: 'SPX' as const, symbol: '^GSPC', yahoo: '%5EGSPC' },
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

async function requestChart(yahooSymbol: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000)
  let lastErr: unknown
  for (let attempt = 1; attempt <= RETRY; attempt++) {
    const url = chartUrl(yahooSymbol, nowSec, HOSTS[(attempt - 1) % HOSTS.length])
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
  throw new Error(
    `Yahoo 请求失败 ${yahooSymbol}: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  )
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
  key: IndexKey,
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

async function fetchOne(item: (typeof TRACKED)[number]): Promise<IndexQuote> {
  const text = await requestChart(item.yahoo)
  return summarizeBars(item.key, item.symbol, INDEX_LABEL[item.key], parseYahooChart(text))
}

/** 两只都成功才返回快照；任一失败返回 null，由调用方沿用旧文件 */
export async function fetchIndicesSnapshot(): Promise<IndicesSnapshot | null> {
  try {
    // 串行，避免两条全历史日线并行把 Yahoo 打成 429
    const quotes: IndexQuote[] = []
    for (const item of TRACKED) {
      quotes.push(await fetchOne(item))
    }
    return {
      fetchedAt: new Date().toISOString(),
      source: 'yahoo',
      indices: quotes,
    }
  } catch (err) {
    console.warn(`指数抓取失败，沿用上次: ${err instanceof Error ? err.message : err}`)
    return null
  }
}
