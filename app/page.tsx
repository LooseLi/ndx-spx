import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FundTable } from '@/components/FundTable'
import { CHANGE_META, INDEX_LABEL, formatFundLimit, formatLimit } from '@/lib/format'
import type { Change, Snapshot } from '@/lib/types'

interface ChangeLogEntry {
  at: string
  changes: Change[]
}

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), 'data', name), 'utf8')) as T
  } catch {
    return null
  }
}

function formatTime(iso: string, withTime = true): string {
  return new Date(iso).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    hour12: false,
  })
}

export default async function Page() {
  const snapshot = await readJson<Snapshot>('latest.json')
  const changeLog = (await readJson<ChangeLogEntry[]>('changes.json')) ?? []

  if (!snapshot) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">尚无数据</h1>
        <p className="mt-2 text-sm text-slate-500">
          先执行 <code className="rounded bg-slate-200 px-1.5 py-0.5 font-mono">npm run track</code>{' '}
          抓取一次基金额度。
        </p>
      </main>
    )
  }

  const cny = snapshot.funds.filter((f) => f.currency === 'CNY')
  const buyable = cny.filter((f) => f.state === 'open' || f.state === 'limited')
  const directOnly = cny.filter((f) => f.state === 'direct_only')
  // 只要有一只不限额，"最高额度"就是不限额
  const maxLimitText =
    buyable.length === 0
      ? '—'
      : buyable.some((f) => f.limit === null)
        ? '不限额'
        : formatLimit(Math.max(...buyable.map((f) => f.limit ?? 0)))

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          纳指100 / 标普500 场外基金额度
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          数据更新于 {formatTime(snapshot.fetchedAt)}
          <span className="mx-2">·</span>
          跟踪 {snapshot.funds.length} 只场外基金
          {snapshot.failed.length > 0 && (
            <span className="ml-2 text-amber-600">（{snapshot.failed.length} 只抓取失败）</span>
          )}
        </p>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="代销可申购"
          value={String(buyable.length)}
          unit={`/ ${cny.length} 只`}
          accent
        />
        <Stat label="仅直销可买" value={String(directOnly.length)} unit="只" />
        <Stat label="最高代销额度" value={maxLimitText} unit="" />
        <Stat
          label="暂停申购"
          value={String(cny.filter((f) => f.state === 'suspended').length)}
          unit="只"
        />
      </div>

      {changeLog.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">最近代销额度变动</h2>
          <div className="space-y-3">
            {changeLog.slice(0, 5).map((entry) => (
              <div
                key={entry.at}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 text-xs text-slate-400">{formatTime(entry.at)}</div>
                <ul className="space-y-1.5">
                  {entry.changes.slice(0, 8).map((c) => (
                    <li key={`${c.kind}-${c.code}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="shrink-0">{CHANGE_META[c.kind].emoji}</span>
                      <span className="font-medium text-slate-700">
                        {CHANGE_META[c.kind].label}
                      </span>
                      <span className="text-slate-600">{c.name}</span>
                      <span className="font-mono text-xs text-slate-400">{c.code}</span>
                      <span className="ml-auto font-mono text-xs text-slate-500">
                        {c.fromState !== undefined &&
                          `${formatFundLimit({ state: c.fromState, limit: c.fromLimit ?? null, company: c.company })} → `}
                        <span className="font-semibold text-slate-800">
                          {formatFundLimit({
                            state: c.toState,
                            limit: c.toLimit,
                            company: c.company,
                          })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {entry.changes.length > 8 && (
                  <p className="mt-2 text-xs text-slate-400">
                    还有 {entry.changes.length - 8} 项变动
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <FundTable funds={snapshot.funds} />

      <footer className="mt-10 space-y-1 border-t border-slate-200 pt-6 text-xs text-slate-400">
        <p>
          额度数据来自第三方代销接口，仅反映各销售平台可买到的额度，可能存在延迟。
          同一只基金在基金公司 App 直销时额度可能更高；F/I 等仅直销份额不在接口披露范围内。
          <strong className="font-medium text-slate-500">
            实际能否申购及具体额度请以基金公司公告和各销售平台为准。
          </strong>
        </p>
        <p>
          本页面仅做信息聚合，不构成任何投资建议。
          {Object.values(INDEX_LABEL).join(' / ')} 场外基金均为 QDII，受外汇额度管理影响。
        </p>
      </footer>
    </main>
  )
}

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`text-2xl font-semibold tracking-tight ${
            accent ? 'text-emerald-600' : 'text-slate-900'
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-slate-400">{unit}</span>}
      </div>
    </div>
  )
}
