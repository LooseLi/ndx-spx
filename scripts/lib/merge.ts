import type { FundSnapshot, Snapshot } from '@/lib/types'

/** 没有上一份快照可补时，失败率超过这个比例就整轮放弃 */
export const MAX_FAILURE_RATIO = 0.3
/** 合并后可用基金仍少于池子的这个比例，也整轮放弃 */
export const MIN_COVERAGE_RATIO = 0.5

export interface AssembledSnapshot {
  funds: FundSnapshot[]
  /** 本轮抓取成功的代码 */
  fetchedCodes: string[]
  /** 失败后从上一份快照补上的代码 */
  reusedCodes: string[]
  /** 失败且上一份里也没有、本轮只好丢掉的代码 */
  droppedCodes: string[]
}

/**
 * 用本轮成功结果拼快照；失败的基金沿用上一份，避免残缺列表被 diff 成新增或归零。
 */
export function assembleFunds(
  fetched: FundSnapshot[],
  failedCodes: string[],
  prev: Snapshot | null,
): AssembledSnapshot {
  const fetchedMap = new Map(fetched.map((f) => [f.code, f]))
  const prevMap = new Map((prev?.funds ?? []).map((f) => [f.code, f]))
  const funds: FundSnapshot[] = [...fetched]
  const reusedCodes: string[] = []
  const droppedCodes: string[] = []

  for (const code of failedCodes) {
    const old = prevMap.get(code)
    if (old && !fetchedMap.has(code)) {
      funds.push(old)
      reusedCodes.push(code)
    } else if (!fetchedMap.has(code)) {
      droppedCodes.push(code)
    }
  }

  return {
    funds,
    fetchedCodes: fetched.map((f) => f.code),
    reusedCodes,
    droppedCodes,
  }
}

/** 返回放弃原因；可以继续则返回 null */
export function abortReason(
  poolSize: number,
  failedCount: number,
  prev: Snapshot | null,
  assembledCount: number,
): string | null {
  if (poolSize <= 0) return '基金池为空'
  const coverage = assembledCount / poolSize
  if (coverage < MIN_COVERAGE_RATIO) {
    return `合并后仅覆盖 ${(coverage * 100).toFixed(1)}% 的基金池，低于 ${MIN_COVERAGE_RATIO * 100}% 阈值`
  }
  if (!prev && failedCount / poolSize > MAX_FAILURE_RATIO) {
    return `失败率 ${((failedCount / poolSize) * 100).toFixed(1)}% 超过阈值，且没有上一份快照可补`
  }
  return null
}
