import type { ReactNode } from 'react'
import { formatCount, formatPercent } from '../data/formatters'

type Tone = 'accent' | 'green' | 'amber' | 'teal' | 'violet'

export function KpiCard({
  label,
  value,
  sub,
  tone = 'accent',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
}) {
  return (
    <div className={`kpi tone-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{typeof value === 'number' ? formatCount(value) : value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function Card({
  title,
  sub,
  right,
  children,
}: {
  title?: string
  sub?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card">
      {(title || right) && (
        <div className="card-head">
          <div>
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub" style={{ marginBottom: 0 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function HealthPill({ score }: { score: number }) {
  const cls = score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low'
  return <span className={`health ${cls}`} aria-label={`Health score ${formatCount(score)} out of 100`}>{formatCount(score)}</span>
}

export function Badge({
  children,
  color = 'neutral',
}: {
  children: ReactNode
  color?: 'green' | 'red' | 'amber' | 'neutral' | 'violet'
}) {
  return <span className={`badge ${color}`}>{children}</span>
}

export interface BarItem {
  label: string
  share: number
  value: string
}

export function BarList({ items }: { items: BarItem[] }) {
  if (items.length === 0) return <p className="empty">No data for the current selection</p>
  return (
    <>
      <div className="bar-list">
        {items.map((it, i) => (
          <div className="bar-row" key={`${it.label}-${i}`}>
            <div className="bar-label">{it.label}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max(it.share * 100, 0)}%` }} />
            </div>
            <div className="bar-value">{it.value}</div>
          </div>
        ))}
      </div>
      <div className="axis">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span key={t}>{formatPercent(t)}</span>
        ))}
      </div>
    </>
  )
}
