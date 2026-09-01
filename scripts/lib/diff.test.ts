import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffSnapshots } from './diff'
import type { FundSnapshot, PurchaseState, Snapshot } from '@/lib/types'

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
    minPurchase: 10,
    aipOpen: true,
    aipMin: 10,
    redeemStatus: '开放赎回',
    nav: 1,
    navDate: '2026-09-01',
    scale: 1e8,
    ...over,
  }
}

function snap(funds: FundSnapshot[]): Snapshot {
  return { fetchedAt: '2026-09-01T00:00:00.000Z', okCount: funds.length, failed: [], funds }
}

/** 构造单只基金前后两态，返回产生的事件类型 */
function kinds(before: Partial<FundSnapshot>, after: Partial<FundSnapshot>): string[] {
  const prev = snap([fund({ code: '000001', ...before })])
  const curr = snap([fund({ code: '000001', ...after })])
  return diffSnapshots(prev, curr).map((c) => c.kind)
}

const suspended = { state: 'suspended' as PurchaseState, limit: 0 }
const open = { state: 'open' as PurchaseState, limit: null }
/** 基金开放但只有基金公司自家 App 能买，代销拿不到额度 */
const directOnly = { state: 'direct_only' as PurchaseState, limit: null }

test('首次运行只建基线，不产生任何事件', () => {
  const curr = snap([fund({ code: '000001' })])
  assert.deepEqual(diffSnapshots(null, curr), [])
})

test('状态与额度都没变时不产生事件', () => {
  assert.deepEqual(kinds({ limit: 10 }, { limit: 10 }), [])
})

test('暂停转为可买报恢复申购，而不是额度提升', () => {
  assert.deepEqual(kinds(suspended, { state: 'limited', limit: 100 }), ['reopened'])
})

test('暂停转为完全开放也只报恢复申购，不叠加取消限额', () => {
  assert.deepEqual(kinds(suspended, open), ['reopened'])
})

test('额度变大报额度提升', () => {
  assert.deepEqual(kinds({ limit: 10 }, { limit: 100 }), ['limit_up'])
})

test('额度变小报额度下调', () => {
  assert.deepEqual(kinds({ limit: 100 }, { limit: 10 }), ['limit_down'])
})

test('限额取消报取消限额', () => {
  assert.deepEqual(kinds({ limit: 100 }, open), ['limit_removed'])
})

test('从不限额变成有上限算额度下调', () => {
  assert.deepEqual(kinds(open, { state: 'limited', limit: 1000 }), ['limit_down'])
})

test('可买转为暂停报暂停申购', () => {
  assert.deepEqual(kinds({ limit: 10 }, suspended), ['suspended'])
})

test('定投重新开放单独报一条', () => {
  assert.deepEqual(kinds({ aipOpen: false }, { aipOpen: true }), ['aip_reopened'])
})

test('恢复申购时若定投同时开放，两条事件都报', () => {
  const k = kinds({ ...suspended, aipOpen: false }, { state: 'limited', limit: 50, aipOpen: true })
  assert.deepEqual(k, ['reopened', 'aip_reopened'])
})

test('全面暂停转为仅直销可买，提示去基金公司渠道', () => {
  assert.deepEqual(kinds(suspended, directOnly), ['direct_only'])
})

test('仅直销的空额度不能被当成不限额而报成取消限额', () => {
  assert.deepEqual(kinds({ limit: 10 }, directOnly), ['suspended'])
})

test('直销专属转为代销可买算恢复申购', () => {
  assert.deepEqual(kinds(directOnly, { state: 'limited', limit: 100 }), ['reopened'])
})

test('仅直销状态维持不变时不产生事件', () => {
  assert.deepEqual(kinds(directOnly, directOnly), [])
})

test('任一侧状态未知时跳过，避免接口异常引发误报', () => {
  assert.deepEqual(kinds({ state: 'unknown', limit: null }, { limit: 10 }), [])
  assert.deepEqual(kinds({ limit: 10 }, { state: 'unknown', limit: null }), [])
})

test('新入池基金报新增', () => {
  const prev = snap([])
  const curr = snap([fund({ code: '000002' })])
  const changes = diffSnapshots(prev, curr)
  assert.deepEqual(changes.map((c) => c.kind), ['new_fund'])
  assert.equal(changes[0].fromLimit, undefined)
})

test('基金从池子消失不报事件', () => {
  const prev = snap([fund({ code: '000001' }), fund({ code: '000002' })])
  const curr = snap([fund({ code: '000001' })])
  assert.deepEqual(diffSnapshots(prev, curr), [])
})

test('利好事件排在利空之前', () => {
  const prev = snap([
    fund({ code: '000001', limit: 100 }),
    fund({ code: '000002', ...suspended }),
    fund({ code: '000003', limit: 10 }),
  ])
  const curr = snap([
    fund({ code: '000001', ...suspended }),
    fund({ code: '000002', state: 'limited', limit: 50 }),
    fund({ code: '000003', limit: 1000 }),
  ])
  assert.deepEqual(
    diffSnapshots(prev, curr).map((c) => `${c.kind}:${c.code}`),
    ['reopened:000002', 'limit_up:000003', 'suspended:000001'],
  )
})

test('同类事件内额度大的排前面', () => {
  const prev = snap([fund({ code: '000001', limit: 10 }), fund({ code: '000002', limit: 10 })])
  const curr = snap([fund({ code: '000001', limit: 500 }), fund({ code: '000002', limit: 5000 })])
  assert.deepEqual(
    diffSnapshots(prev, curr).map((c) => c.code),
    ['000002', '000001'],
  )
})
