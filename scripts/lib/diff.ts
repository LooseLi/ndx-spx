import type { Change, FundSnapshot, Snapshot } from '@/lib/types'
import { CHANGE_KINDS } from '@/lib/types'

/**
 * 对比两次快照，产出变更事件。
 *
 * 两条防误报原则：
 * 1. 任一侧状态为 unknown 时跳过该基金——接口偶发异常不应该变成推送；
 * 2. 优先判断"能不能买"的状态跃迁，再比较额度数值。因为暂停时额度被归一化为 0，
 *    直接比数值会把"暂停->开放"错报成"额度解除限制"。
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

    const wasBuyable = before.state !== 'suspended'
    const isBuyable = now.state !== 'suspended'

    if (!wasBuyable && isBuyable) {
      changes.push(
        makeChange('reopened', now, {
          fromLimit: before.limit,
          toLimit: now.limit,
          fromState: before.state,
          toState: now.state,
        }),
      )
    } else if (wasBuyable && !isBuyable) {
      changes.push(
        makeChange('suspended', now, {
          fromLimit: before.limit,
          toLimit: now.limit,
          fromState: before.state,
          toState: now.state,
        }),
      )
    } else if (wasBuyable && isBuyable) {
      const kind = compareLimit(before.limit, now.limit)
      if (kind) {
        changes.push(
          makeChange(kind, now, {
            fromLimit: before.limit,
            toLimit: now.limit,
            fromState: before.state,
            toState: now.state,
          }),
        )
      }
    }

    // 定投重新开放单独报一条，它是限大额期间实际能买进去的通道
    if (!before.aipOpen && now.aipOpen) {
      changes.push(
        makeChange('aip_reopened', now, {
          fromLimit: before.limit,
          toLimit: now.limit,
          fromState: before.state,
          toState: now.state,
        }),
      )
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
