'use client'

import { useMemo, useState } from 'react'
import {
  CURRENCY_LABEL,
  INDEX_LABEL,
  formatFundLimit,
  formatFundLimitHint,
  formatScale,
  formatYield,
  indexTag,
} from '@/lib/format'
import type { FundSnapshot, IndexKey, PurchaseState } from '@/lib/types'

const STATE_STYLE: Record<PurchaseState, { label: string; cls: string }> = {
  open: { label: '开放申购', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  limited: { label: '限大额', cls: 'bg-amber-100 text-amber-800 ring-amber-200' },
  direct_only: { label: '仅直销', cls: 'bg-sky-100 text-sky-800 ring-sky-200' },
  suspended: { label: '暂停申购', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  unknown: { label: '额度未知', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

type IndexFilter = 'ALL' | IndexKey
type SortKey = 'yield1y' | 'scale'
type SortDir = 'asc' | 'desc'

/** 缺失值始终沉底，避免 — 排在中间 */
function cmpNullable(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return dir === 'asc' ? a - b : b - a
}

function buyRank(f: FundSnapshot): number {
  if (f.state === 'open' || f.state === 'limited') return 0
  if (f.state === 'direct_only') return 1
  return 2
}

export function FundTable({ funds }: { funds: FundSnapshot[] }) {
  const [indexFilter, setIndexFilter] = useState<IndexFilter>('ALL')
  const [cnyOnly, setCnyOnly] = useState(true)
  const [buyableOnly, setBuyableOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc') // 首次点列名：收益/规模默认从高到低
    }
  }

  const rows = useMemo(() => {
    const filtered = funds
      .filter((f) => (indexFilter === 'ALL' ? true : f.index === indexFilter))
      .filter((f) => (cnyOnly ? f.currency === 'CNY' : true))
      .filter((f) => (buyableOnly ? buyRank(f) < 2 : true))

    return [...filtered].sort((a, b) => {
      if (sortKey === 'yield1y') {
        const c = cmpNullable(a.yield1y, b.yield1y, sortDir)
        if (c !== 0) return c
      } else if (sortKey === 'scale') {
        const c = cmpNullable(a.scale, b.scale, sortDir)
        if (c !== 0) return c
      } else {
        const ra = buyRank(a)
        const rb = buyRank(b)
        if (ra !== rb) return ra - rb
        const lc = cmpNullable(a.limit, b.limit, 'desc')
        if (lc !== 0) return lc
      }
      return a.code.localeCompare(b.code)
    })
  }, [funds, indexFilter, cnyOnly, buyableOnly, sortKey, sortDir])

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-200/70 p-0.5">
          {(['ALL', 'NDX', 'SPX'] as IndexFilter[]).map((key) => (
            <button
              key={key}
              onClick={() => setIndexFilter(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                indexFilter === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {key === 'ALL' ? '全部' : INDEX_LABEL[key]}
            </button>
          ))}
        </div>

        <Toggle checked={cnyOnly} onChange={setCnyOnly} label="仅人民币份额" />
        <Toggle checked={buyableOnly} onChange={setBuyableOnly} label="仅可买" />

        <span className="ml-auto text-sm text-slate-500">共 {rows.length} 只</span>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <colgroup>
            <col className="w-[100px]" />
            <col />
            <col className="w-[150px]" />
            <col className="w-[120px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">基金</th>
              <th className="px-4 py-3 text-right font-medium">
                <span title="来自第三方代销渠道；基金公司 App 直销额度可能不同，且部分份额仅直销可买">
                  代销额度
                </span>
              </th>
              <th className="px-4 py-3 text-right font-medium">
                <div className="flex justify-end">
                  <SortHeader
                    label="近一年"
                    active={sortKey === 'yield1y'}
                    dir={sortDir}
                    onClick={() => toggleSort('yield1y')}
                  />
                </div>
              </th>
              <th className="px-4 py-3 text-right font-medium">
                <div className="flex justify-end">
                  <SortHeader
                    label="规模"
                    active={sortKey === 'scale'}
                    dir={sortDir}
                    onClick={() => toggleSort('scale')}
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
                const style = STATE_STYLE[f.state]
                const dimmed = f.state === 'suspended' || f.state === 'unknown'
                const directOnly = f.state === 'direct_only'
                const tag = indexTag(f.indexCode)
                const limitHint = formatFundLimitHint(f)
              return (
                <tr
                  key={f.code}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/80 ${
                    dimmed ? 'text-slate-400' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.cls}`}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start gap-1">
                        <a
                          href={`https://fund.eastmoney.com/${f.code}.html`}
                          target="_blank"
                          rel="noreferrer"
                          title={f.name}
                          className={`min-w-0 truncate font-medium hover:text-blue-600 hover:underline ${
                            dimmed ? '' : 'text-slate-900'
                          }`}
                        >
                          {f.name}
                        </a>
                        {tag && (
                          <span
                            className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700"
                            title={f.indexName ?? undefined}
                          >
                            {tag}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-400">
                        <span className="font-mono">{f.code}</span>
                        {f.currency !== 'CNY' && (
                          <>
                            <span className="mx-1.5">·</span>
                            <span className="text-orange-500">{CURRENCY_LABEL[f.currency]}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td
                    className={`px-4 py-3 text-right align-top ${
                      dimmed ? '' : directOnly ? 'text-sky-700' : 'text-slate-900'
                    }`}
                  >
                    <div
                      className={`font-mono whitespace-nowrap ${!dimmed && !directOnly ? 'font-semibold' : ''}`}
                    >
                      {formatFundLimit(f)}
                    </div>
                    {limitHint && (
                      <div
                        className={`mt-0.5 truncate text-xs ${
                          directOnly ? 'text-sky-600' : 'text-slate-400'
                        }`}
                        title={limitHint}
                      >
                        {limitHint}
                      </div>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-mono ${
                      dimmed
                        ? ''
                        : f.yield1y === null
                          ? 'text-slate-400'
                          : f.yield1y >= 0
                            ? 'text-rose-600'
                            : 'text-emerald-600'
                    }`}
                  >
                    {formatYield(f.yield1y)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-slate-500">
                    {formatScale(f.scale)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-400">没有符合条件的基金</p>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">
        额度数据来自第三方代销接口。「代销额度」指在天天基金、银行、券商等平台可买到的上限；同一只基金在
        基金公司 App 直销时额度可能更高（如华安纳指 C 代销 10 元、直销 100 元）。标为「仅直销」的
        F/I 类份额接口不披露额度，请直接打开对应基金公司 App 查看。
      </p>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${
        checked
          ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : 'bg-white text-slate-500 ring-slate-200 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  )
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex w-fit flex-none items-center gap-1 rounded-md px-2 py-1 transition ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
      title={active ? (dir === 'desc' ? '点击切换为升序' : '点击切换为降序') : '点击排序'}
    >
      <SortIcon active={active} dir={dir} />
      {label}
    </button>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  const activeCls = 'h-4 w-4 text-blue-600'
  const idleCls = 'h-4 w-4 text-slate-400'

  if (active) {
    return dir === 'desc' ? (
      <svg className={activeCls} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 12.5 3 6.5h10L8 12.5z" />
      </svg>
    ) : (
      <svg className={activeCls} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 3.5 13 9.5H3L8 3.5z" />
      </svg>
    )
  }

  return (
    <svg className={idleCls} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 3.5 10.5 6H5.5L8 3.5zM8 12.5 5.5 10h5L8 12.5z" />
    </svg>
  )
}
