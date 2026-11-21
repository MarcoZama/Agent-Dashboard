import type { ProductKind } from '../models/types'

export type DashboardView = ProductKind | 'cowork'

const PRODUCTS: {
  key: DashboardView
  title: string
  sub: string
  glyph: string
  cls: string
}[] = [
  { key: 'm365', title: 'Agent Builder', sub: 'Microsoft 365 Copilot', glyph: 'A', cls: 'm365' },
  { key: 'cowork', title: 'Cowork', sub: 'Microsoft 365 Copilot', glyph: 'C', cls: 'cowork' },
  { key: 'powerPlatform', title: 'Copilot Studio', sub: 'Power Platform', glyph: 'P', cls: 'pp' },
]

export function ProductSwitcher({
  value,
  onChange,
}: {
  value: DashboardView
  onChange: (view: DashboardView) => void
}) {
  return (
    <div className="product-switcher" role="group" aria-label="Product">
      {PRODUCTS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={value === p.key ? 'active' : ''}
          aria-label={p.title}
          aria-pressed={value === p.key}
          onClick={() => onChange(p.key)}
        >
          <span className={`product-glyph ${p.cls}`} aria-hidden="true">{p.glyph}</span>
          <span className="ps-text">
            <span className="ps-title">{p.title}</span>
            <span className="ps-sub">{p.sub}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
