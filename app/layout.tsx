import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '纳指100 / 标普500 场外基金额度监控',
  description:
    '跟踪纳斯达克100与标普500场外基金（QDII）的申购状态与单日限额，额度放开时第一时间提醒。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  )
}
