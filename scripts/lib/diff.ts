import type { Change, FundSnapshot, PurchaseState, Snapshot } from '@/lib/types'
import { CHANGE_KINDS } from '@/lib/types'

/** 代销渠道能否直接买到。direct_only 需要去基金公司 App，不算 */
function isBuyable(state: PurchaseState): boolean {
  return state === 'open' || state === 'limited'
}

/**
 * 对比两次快照，产出变更事件。
 *
 * 两条防误报原则：
 * 1. 任一侧状态为 unknown 时跳过该基金——接口偶发异常不应该变成推送；
 * 2. 优先判断"能不能买"的状态跃迁，再比较额度数值。因为暂停时额度被归一化为 0、
 *    direct_only 时额度为空，直接比数值会把"暂停->开放"错报成"额度解除限制"。
 */
export function diffSnapshots(prev: Snapshot | null, curr: Snapshot): Change[] {
  if (!prev) return [] // 首次运行只建立基线，不推送

  const prevMap = new Map(prev.funds.map((f) => [f.code, f]))
  const changes: Change[] = []

  for (const now of curr.funds) {
    if (now.state === 'unknown') continue
    const before = prevMap.get(now.code)

    if (!before) {
      changes.push(makeChange('new_fund', now, { toLimit: now.limit, toState: now.state }))
      continue
    }
    if (before.state === 'unknown') continue

    const was = isBuyable(before.state)
    const is = isBuyable(now.state)
    const transition = {
      fromLimit: before.limit,
      toLimit: now.limit,
      fromState: before.state,
      toState: now.state,
    }

    if (!was && is) {
      changes.push(makeChange('reopened', now, transition))
    } else if (was && !is) {
      changes.push(makeChange('suspended', now, transition))
    } else if (was && is) {
      const kind = compareLimit(before.limit, now.limit)
      if (kind) changes.push(makeChange(kind, now, transition))
    } else if (before.state === 'suspended' && now.state === 'direct_only') {
      // 代销依然买不到，但基金本身已开放，值得提示去直销渠道试试
      changes.push(makeChange('direct_only', now, transition))
    }
  }

  const priority = new Map(CHANGE_KINDS.map((k, i) => [k, i]))
  return changes.sort((a, b) => {
    const pa = priority.get(a.kind) ?? 99
    const pb = priority.get(b.kind) ?? 99
    if (pa !== pb) return pa - pb
    // 同类型内额度大的排前面，更值得关注
    return (b.toLimit ?? Infinity) - (a.toLimit ?? Infinity)
  })
}

/** null 代表不限额，视作正无穷 */
function compareLimit(
  from: number | null,
  to: number | null,
): 'limit_up' | 'limit_down' | 'limit_removed' | null {
  if (from === to) return null
  if (to === null) return 'limit_removed'
  if (from === null) return 'limit_down' // 从不限额变成有上限
  if (to > from) return 'limit_up'
  return 'limit_down'
}

function makeChange(
  kind: Change['kind'],
  fund: FundSnapshot,
  rest: Omit<Change, 'kind' | 'code' | 'name' | 'company' | 'index' | 'currency'>,
): Change {
  return {
    kind,
    code: fund.code,
    name: fund.name,
    company: fund.company,
    index: fund.index,
    currency: fund.currency,
    ...rest,
  }
}
