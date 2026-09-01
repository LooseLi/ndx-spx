'use client'

import { useMemo, useState } from 'react'
import {
  CURRENCY_LABEL,
  INDEX_LABEL,
  formatFundLimit,
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

export function FundTable({ funds }: { funds: FundSnapshot[] }) {
  const [indexFilter, setIndexFilter] = useState<IndexFilter>('ALL')
  const [cnyOnly, setCnyOnly] = useState(true)
  const [buyableOnly, setBuyableOnly] = useState(false)

  const rows = useMemo(() => {
    // 代销可买的排最前，其次是需要去直销买的，完全买不了的沉底
    const rank = (f: FundSnapshot) =>
      f.state === 'open' || f.state === 'limited' ? 0 : f.state === 'direct_only' ? 1 : 2

    return funds
      .filter((f) => (indexFilter === 'ALL' ? true : f.index === indexFilter))
      .filter((f) => (cnyOnly ? f.currency === 'CNY' : true))
      .filter((f) => (buyableOnly ? rank(f) < 2 : true))
      .sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b)
        return (b.limit ?? Infinity) - (a.limit ?? Infinity)
      })
  }, [funds, indexFilter, cnyOnly, buyableOnly])

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
        <Toggle checked={buyableOnly} onChange={setBuyableOnly} label="仅可申购" />

        <span className="ml-auto text-sm text-slate-500">共 {rows.length} 只</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">基金</th>
              <th className="px-4 py-3 text-right font-medium">单日额度</th>
              <th className="px-4 py-3 text-right font-medium">近一年</th>
              <th className="px-4 py-3 text-right font-medium">规模</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
                const style = STATE_STYLE[f.state]
                const dimmed = f.state === 'suspended' || f.state === 'unknown'
                const directOnly = f.state === 'direct_only'
                const tag = indexTag(f.indexCode)
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
                    <a
                      href={`https://fund.eastmoney.com/${f.code}.html`}
                      target="_blank"
                      rel="noreferrer"
                      className={`font-medium hover:text-blue-600 hover:underline ${
                        dimmed ? '' : 'text-slate-900'
                      }`}
                    >
                      {f.name}
                    </a>
                    {tag && (
                      <span
                        className="ml-1.5 inline-flex rounded bg-violet-100 px-1.5 py-0.5 align-middle text-xs font-medium text-violet-700"
                        title={f.indexName ?? undefined}
                      >
                        {tag}
                      </span>
                    )}
                    <div className="mt-0.5 text-xs text-slate-400">
                      <span className="font-mono">{f.code}</span>
                      <span className="mx-1.5">·</span>
                      {f.company}
                      {f.currency !== 'CNY' && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span className="text-orange-500">{CURRENCY_LABEL[f.currency]}</span>
                        </>
                      )}
                      {directOnly && (
                        <>
                          <span className="mx-1.5">·</span>
                          <span className="text-sky-600">{`需在${f.company} App 申购`}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-mono ${
                      dimmed ? '' : directOnly ? 'text-sky-700' : 'font-semibold text-slate-900'
                    }`}
                  >
                    {formatFundLimit(f)}
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
