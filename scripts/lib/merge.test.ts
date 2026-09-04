import assert from 'node:assert/strict'
import { test } from 'node:test'
import { abortReason, assembleFunds, MAX_FAILURE_RATIO, MIN_COVERAGE_RATIO } from './merge'
import type { FundSnapshot, Snapshot } from '@/lib/types'

function fund(over: Partial<FundSnapshot> & { code: string }): FundSnapshot {
  return {
    name: `基金${over.code}`,
    company: '某基金',
    index: 'NDX',
    currency: 'CNY',
    shareClass: 'A',
    state: 'limited',
    stateText: '限大额',
    stateNote: null,
    limit: 10,
    redeemStatus: '开放赎回',
    indexCode: 'NDX100',
    indexName: '纳斯达克100指数',
    yield1y: 17.03,
    scale: 1e8,
    ...over,
  }
}

function snap(funds: FundSnapshot[]): Snapshot {
  return { fetchedAt: '2026-09-01T00:00:00.000Z', okCount: funds.length, failed: [], funds }
}

test('失败的基金沿用上一份额度，成功的用新数据', () => {
  const prev = snap([fund({ code: '1', limit: 10 }), fund({ code: '2', limit: 100 })])
  const fetched = [fund({ code: '1', limit: 10_000 })]
  const assembled = assembleFunds(fetched, ['2'], prev)

  assert.deepEqual(
    assembled.funds.map((f) => [f.code, f.limit]),
    [
      ['1', 10_000],
      ['2', 100],
    ],
  )
  assert.deepEqual(assembled.reusedCodes, ['2'])
  assert.deepEqual(assembled.droppedCodes, [])
})

test('上一份没有的失败基金不会凭空补上', () => {
  const prev = snap([fund({ code: '1', limit: 10 })])
  const assembled = assembleFunds([fund({ code: '1' })], ['9'], prev)
  assert.deepEqual(assembled.droppedCodes, ['9'])
  assert.equal(assembled.funds.length, 1)
})

test('有上一份快照时，失败率刚过 30% 不放弃', () => {
  assert.equal(abortReason(82, 26, snap([fund({ code: '1' })]), 82), null)
})

test('没有上一份快照且失败率超过阈值则放弃', () => {
  const msg = abortReason(82, 26, null, 56)
  assert.ok(msg && msg.includes('没有上一份快照'))
  assert.ok(26 / 82 > MAX_FAILURE_RATIO)
})

test('合并后覆盖率过低则放弃', () => {
  const msg = abortReason(100, 10, snap([fund({ code: '1' })]), 40)
  assert.ok(msg && msg.includes('覆盖'))
  assert.ok(40 / 100 < MIN_COVERAGE_RATIO)
})
