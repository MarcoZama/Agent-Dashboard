import { useId } from 'react'
import type {
  Agent,
  DashboardFilters,
  EnvironmentInfo,
} from '../models/types'
import { legalEntityList } from '../data/selectors'
import { classifyHarness, HARNESS_LABELS } from '../data/harness'
import { formatCount } from '../data/formatters'
import { MultiSelect } from './MultiSelect'

interface FiltersBarProps {
  filters: DashboardFilters
  environments: EnvironmentInfo[]
  agents: Agent[]
  onChange: (patch: Partial<DashboardFilters>) => void
  onReset: () => void
}

export function FiltersBar({
  filters,
  environments,
  agents,
  onChange,
  onReset,
}: FiltersBarProps) {
  const harnessId = useId()
  const authId = useId()
  // Agents constrained to the currently selected environments so the Agent and
  // Owner pickers only offer choices that exist in that scope.
  const scopedAgents = agents.filter((a) =>
    (!filters.environmentIds.length || filters.environmentIds.includes(a.environmentId)) &&
    (filters.harnessScope === 'all' || filters.harnessScope === classifyHarness(a.harness)),
  )

  const owners = [...new Set(scopedAgents.map((a) => a.owner).filter(Boolean))].sort()
  const entities = legalEntityList(agents)

  // Switching environments: drop agent/owner selections that fell out of scope.
  const changeEnvironments = (environmentIds: string[]) => {
    const patch: Partial<DashboardFilters> = { environmentIds }
    if (environmentIds.length > 0) {
      const inScope = agents.filter((a) => environmentIds.includes(a.environmentId))
      patch.agentIds = filters.agentIds.filter((id) => inScope.some((a) => a.id === id))
      patch.ownerIds = filters.ownerIds.filter((o) => inScope.some((a) => a.owner === o))
    }
    onChange(patch)
  }

  const toggleEntity = (domain: string) => {
    const set = new Set(filters.legalEntities)
    if (set.has(domain)) set.delete(domain)
    else set.add(domain)
    onChange({ legalEntities: [...set] })
  }

  const changeHarness = (harnessScope: DashboardFilters['harnessScope']) => {
    const inScope = agents.filter((a) =>
      (!filters.environmentIds.length || filters.environmentIds.includes(a.environmentId)) &&
      (harnessScope === 'all' || classifyHarness(a.harness) === harnessScope),
    )
    onChange({
      harnessScope,
      agentIds: filters.agentIds.filter((id) => inScope.some((a) => a.id === id)),
      ownerIds: filters.ownerIds.filter((owner) => inScope.some((a) => a.owner === owner)),
    })
  }

  return (
    <div className="card filters">
      <div className="card-head">
        <div className="card-title">Filters</div>
        <button className="btn ghost" onClick={onReset}>
          Reset all
        </button>
      </div>

      <div className="filter-row">
        <MultiSelect
          label="Environment"
          allLabel="All environments"
          options={environments.map((env) => ({ value: env.id, label: env.name }))}
          selected={filters.environmentIds}
          onChange={changeEnvironments}
        />
        <MultiSelect
          label="Agent"
          allLabel="All agents"
          options={scopedAgents.map((a) => ({ value: a.id, label: a.name }))}
          selected={filters.agentIds}
          onChange={(agentIds) => onChange({ agentIds })}
        />
        <MultiSelect
          label="Owner"
          allLabel="All owners"
          options={owners.map((o) => ({ value: o, label: o }))}
          selected={filters.ownerIds}
          onChange={(ownerIds) => onChange({ ownerIds })}
        />
      </div>

      {entities.length > 0 && (
        <div className="field" style={{ marginTop: 16 }}>
          <label>
            Legal entity
            {filters.legalEntities.length > 0 && (
              <button
                className="link-btn"
                onClick={() => onChange({ legalEntities: [] })}
                style={{ marginLeft: 8 }}
              >
                clear
              </button>
            )}
          </label>
          <div className="chips">
            {entities.map((e) => {
              const active = filters.legalEntities.includes(e.domain)
              return (
                <button
                  key={e.domain}
                  className={`chip ${active ? 'active' : ''}`}
                  onClick={() => toggleEntity(e.domain)}
                  title={e.domain}
                >
                  {e.label}
                  <span className="chip-count">{formatCount(e.agents)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="filters-foot">
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor={harnessId}>Agent harness</label>
          <select id={harnessId} value={filters.harnessScope} onChange={(event) => {
            const value = event.target.value
            if (value === 'all' || value === 'standard' || value === 'github' || value === 'other' || value === 'unknown') {
              changeHarness(value)
            }
          }}>
            <option value="all">All harnesses</option>
            <option value="standard">{HARNESS_LABELS.standard}</option>
            <option value="github">{HARNESS_LABELS.github}</option>
            <option value="other">{HARNESS_LABELS.other}</option>
            <option value="unknown">{HARNESS_LABELS.unknown}</option>
          </select>
        </div>
        <div className="field" style={{ minWidth: 180 }}>
          <label htmlFor={authId}>End-user authentication</label>
          <select
            id={authId}
            value={filters.authScope}
            onChange={(e) =>
              onChange({ authScope: e.target.value as DashboardFilters['authScope'] })
            }
          >
            <option value="all">All</option>
            <option value="authenticated">Authenticated</option>
            <option value="none">No authentication</option>
          </select>
        </div>
      </div>
    </div>
  )
}
