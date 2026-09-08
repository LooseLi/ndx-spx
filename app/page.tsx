import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FundTable } from '@/components/FundTable'
import { INDEX_LABEL, formatDrawdown, formatIndexPoint } from '@/lib/format'
import type { IndexQuote, IndicesSnapshot, Snapshot } from '@/lib/types'

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
  const indices = await readJson<IndicesSnapshot>('indices.json')

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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          纳斯达克100 / 标普500 场外基金额度
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          数据更新于 {formatTime(snapshot.fetchedAt)}
        </p>
      </header>

      {indices && indices.indices.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {indices.indices.map((quote) => (
            <IndexCard key={quote.key} quote={quote} />
          ))}
        </div>
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
          指数为价格指数（非全收益），历史最高取日线最高价，回撤相对最近一根已收盘 K
          线，数据来自 Yahoo，随额度任务更新，非盘中实时。
        </p>
        <p>
          本页面仅做信息聚合，不构成任何投资建议。
          {Object.values(INDEX_LABEL).join(' / ')} 场外基金均为 QDII，受外汇额度管理影响。
        </p>
      </footer>
    </main>
  )
}

function IndexCard({ quote }: { quote: IndexQuote }) {
  const atHigh = quote.drawdownPct >= -0.05
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{quote.name}</div>
      <div
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          atHigh ? 'text-emerald-600' : 'text-amber-600'
        }`}
      >
        {formatDrawdown(quote.drawdownPct)}
      </div>
      <div className="mt-0.5 text-xs text-slate-400">距高点回撤</div>
      <div className="mt-3 text-sm text-slate-600">
        历史最高 {formatIndexPoint(quote.ath)}
        <span className="text-slate-400">（{quote.athDate}）</span>
      </div>
    </div>
  )
}
