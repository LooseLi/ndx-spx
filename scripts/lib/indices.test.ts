import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chartUrl, lastCloseUrl, parseYahooChart, summarizeBars, summarizeLastClose, type DailyBar } from './indices'

const bars: DailyBar[] = [
  { date: '2024-01-02', high: 16800.5, close: 16700.1 },
  { date: '2026-06-02', high: 30670.11, close: 30600.0 },
  { date: '2026-06-03', high: 30100.0, close: 29900.25 },
  { date: '2026-09-05', high: 25800.0, close: 25600.12 },
]

test('ATH 取日线最高价峰值及其日期', () => {
  const q = summarizeBars('NDX', '^NDX', '纳斯达克100', bars)
  assert.equal(q.ath, 30670.11)
  assert.equal(q.athDate, '2026-06-02')
  assert.equal(q.close, 25600.12)
  assert.equal(q.closeDate, '2026-09-05')
})

test('回撤 = (最近收盘 - ATH) / ATH', () => {
  const q = summarizeBars('NDX', '^NDX', '纳斯达克100', bars)
  const expected = Math.round(((25600.12 - 30670.11) / 30670.11) * 10000) / 100
  assert.equal(q.drawdownPct, expected)
  assert.ok(q.drawdownPct < 0)
})

test('跳过 high/close 均为空的 K 线，收盘取最后一根有效 close', () => {
  const q = summarizeBars('SPX', '^GSPC', '标普500', [
    { date: '2020-01-01', high: 100, close: 99 },
    { date: '2020-01-02', high: null, close: null },
    { date: '2020-01-03', high: 110, close: 108 },
    { date: '2020-01-04', high: null, close: null },
  ])
  assert.equal(q.ath, 110)
  assert.equal(q.athDate, '2020-01-03')
  assert.equal(q.close, 108)
  assert.equal(q.closeDate, '2020-01-03')
  assert.equal(q.drawdownPct, Math.round(((108 - 110) / 110) * 10000) / 100)
})

test('解析 Yahoo chart JSON 为日线', () => {
  // 美东正午对应的 UTC，保证 America/New_York 落在同一交易日
  const t1 = Date.parse('2026-06-02T16:00:00Z') / 1000
  const t2 = Date.parse('2026-09-05T16:00:00Z') / 1000
  const json = JSON.stringify({
    chart: {
      result: [
        {
          timestamp: [t1, t2],
          indicators: {
            quote: [
              {
                high: [30670.11, 25800],
                close: [30600, 25600.12],
              },
            ],
          },
        },
      ],
      error: null,
    },
  })
  const parsed = parseYahooChart(json)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].date, '2026-06-02')
  assert.equal(parsed[0].high, 30670.11)
  assert.equal(parsed[1].date, '2026-09-05')
  assert.equal(parsed[1].close, 25600.12)
})

test('Yahoo 日线 URL 用 period1 拉全历史，不用 range=max', () => {
  const url = chartUrl('%5ENDX', 1_700_000_000)
  assert.match(url, /period1=315532800/)
  assert.match(url, /period2=1700000000/)
  assert.match(url, /^https:\/\/query1\.finance\.yahoo\.com\//)
  assert.doesNotMatch(url, /range=max/)
})

test('日线不足以计算时抛错', () => {
  assert.throws(() => summarizeBars('NDX', '^NDX', '纳斯达克100', []), /不足以计算回撤/)
  assert.throws(
    () => summarizeBars('NDX', '^NDX', '纳斯达克100', [{ date: '2026-01-01', high: null, close: null }]),
    /不足以计算回撤/,
  )
})

test('VIX 只取最后一根有效收盘，不算回撤', () => {
  const q = summarizeLastClose('^VIX', '恐慌指数', [
    { date: '2026-09-03', high: 16.2, close: 15.8 },
    { date: '2026-09-04', high: null, close: null },
    { date: '2026-09-05', high: 16.1, close: 15.74 },
  ])
  assert.equal(q.close, 15.74)
  assert.equal(q.closeDate, '2026-09-05')
  assert.equal(q.symbol, '^VIX')
  assert.equal(q.name, '恐慌指数')
})

test('VIX 最近收盘 URL 不拉 1980 起的全历史', () => {
  const url = lastCloseUrl('%5EVIX', 1_700_000_000)
  assert.match(url, /period1=1696544000/)
  assert.match(url, /period2=1700000000/)
  assert.doesNotMatch(url, /period1=315532800/)
})
