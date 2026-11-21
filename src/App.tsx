import { useEffect, useMemo, useState } from 'react'
import type {
  Agent,
  DashboardFilters,
  EnvironmentInfo,
  ProductKind,
} from './models/types'
import { dataService } from './data/dataService'
import { filterAgents } from './data/selectors'
import { ProductSwitcher, type DashboardView } from './components/ProductSwitcher'
import { FiltersBar } from './components/FiltersBar'
import { OverviewTab } from './tabs/OverviewTab'
import { BreakdownTab } from './tabs/BreakdownTab'
import { GovernanceTab } from './tabs/GovernanceTab'
import { AdoptionTab } from './tabs/AdoptionTab'
import { ConsumptionTab } from './tabs/ConsumptionTab'
import { CoworkTab } from './tabs/CoworkTab'

type TabKey = 'overview' | 'consumption' | 'inventory' | 'governance' | 'adoption'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'consumption', label: 'Consumption & cost' },
  { key: 'overview', label: 'Overview' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'governance', label: 'Governance & risk' },
  { key: 'adoption', label: 'Capabilities' },
]

const defaultFilters = (product: ProductKind): DashboardFilters => ({
  product,
  harnessScope: 'all',
  environmentIds: [],
  agentIds: [],
  ownerIds: [],
  legalEntities: [],
  authScope: 'all',
})

export default function App() {
  const [tab, setTab] = useState<TabKey>('consumption')
  const [showCowork, setShowCowork] = useState(false)
  const [filters, setFilters] = useState<DashboardFilters>(defaultFilters('powerPlatform'))
  const [agents, setAgents] = useState<Agent[]>([])
  const [environments, setEnvironments] = useState<EnvironmentInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [a, e] = await Promise.all([
          dataService.getAgents(),
          dataService.getEnvironments(),
        ])
        if (!cancelled) {
          setAgents(a)
          setEnvironments(e)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = () => {
    setError(null)
    setLoading(true)
    dataService.invalidate?.()
    setReloadKey((k) => k + 1)
  }

  // Agents available for the current product (drives filter option lists).
  const productAgents = useMemo(
    () => agents.filter((a) => a.product === filters.product),
    [agents, filters.product],
  )

  // Fully filtered set used by every tab.
  const visibleAgents = useMemo(() => filterAgents(agents, filters), [agents, filters])
  const usageAgents = useMemo(
    () => filterAgents(agents, { ...filters, harnessScope: 'all' }),
    [agents, filters],
  )

  const patchFilters = (patch: Partial<DashboardFilters>) =>
    setFilters((f) => ({ ...f, ...patch }))

  const selectView = (view: DashboardView) => {
    setShowCowork(view === 'cowork')
    if (view !== 'cowork') {
      setFilters((current) => current.product === view ? current : defaultFilters(view))
    }
  }

  if (loading && reloadKey === 0) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <span>Loading agents…</span>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="topbar">
        <ProductSwitcher value={showCowork ? 'cowork' : filters.product} onChange={selectView} />
        <div className="subscript">
          {dataService.mode !== 'mock' && <button className="btn" onClick={reload} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>}
          <span className={`mode-pill ${dataService.mode === 'mock' ? 'mock' : ''}`}>
            {dataService.mode === 'mock' ? 'Sample data' : 'Power Platform APIs'}
          </span>
        </div>
      </div>

      {showCowork ? <CoworkTab reloadKey={reloadKey} /> : (
        <>
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? 'active' : ''}
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="card" style={{ borderColor: 'var(--red)', marginBottom: 16 }}>
              <div className="card-title" style={{ color: 'var(--red)' }}>
                Could not load data
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                {error}
              </p>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <FiltersBar
              filters={filters}
              environments={environments}
              agents={productAgents}
              onChange={patchFilters}
              onReset={() => setFilters(defaultFilters(filters.product))}
            />
          </div>
        </>
      )}

      <div hidden={showCowork || tab !== 'consumption'}>
        <ConsumptionTab agents={usageAgents} inventory={agents} filters={filters} reloadKey={reloadKey} />
      </div>
      {!showCowork && !error && tab === 'overview' && <OverviewTab agents={visibleAgents} />}
      {!showCowork && !error && tab === 'inventory' && <BreakdownTab agents={visibleAgents} />}
      {!showCowork && !error && tab === 'governance' && <GovernanceTab agents={visibleAgents} />}
      {!showCowork && !error && tab === 'adoption' && <AdoptionTab agents={visibleAgents} />}
    </div>
  )
}
