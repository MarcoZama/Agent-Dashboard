import { useEffect, useMemo, useState } from 'react'
import type { Agent, AgentUsageReport, ApiSection, ConsumptionSnapshot, DashboardFilters } from '../models/types'
import type { ConsumptionRow } from '../generated/models/CopilotStudioCreditConsumptionModel'
import { dataService } from '../data/dataService'
import {
  defaultConsumptionQuery,
  normalizeResourceId,
  selectHarnessUsage,
  summarizeUsage,
  usageAgentKey,
  validateConsumptionQuery,
} from '../data/consumption'
import { HARNESS_LABELS } from '../data/harness'
import {
  formatApiLabel, formatBillingMethods, formatBoolean, formatChannel, formatCount, formatCreditLimit,
  formatDate, formatDateTime, formatMoney, formatPercent, formatText, formatUsageCredits, NOT_REPORTED,
} from '../data/formatters'
import { Card, KpiCard, Badge } from '../components/ui'
import { DonutChart } from '../components/charts'

function SectionNotice<T>({ section }: { section: ApiSection<T> }) {
  if (section.status === 'ready') return null
  return <p role={section.status === 'error' ? 'alert' : 'status'} className="muted">
    {section.status === 'error' ? section.error : section.message}
  </p>
}

function breakdown(rows: ConsumptionRow[], key: (row: ConsumptionRow) => string) {
  const groups = new Map<string, number>()
  for (const row of rows) {
    const label = formatText(key(row))
    groups.set(label, (groups.get(label) ?? 0) + (row.billedCredits ?? 0))
  }
  const data = [...groups].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  return data.length <= 10 ? data : [
    ...data.slice(0, 9),
    { name: 'Remaining categories', value: data.slice(9).reduce((sum, item) => sum + item.value, 0) },
  ]
}

export function ConsumptionTab({
  agents,
  inventory,
  filters,
  reloadKey,
}: {
  agents: Agent[]
  inventory: Agent[]
  filters: DashboardFilters
  reloadKey: number
}) {
  const initial = useMemo(() => defaultConsumptionQuery(), [])
  const [range, setRange] = useState(initial)
  const [draftFrom, setDraftFrom] = useState(initial.fromDate)
  const [draftTo, setDraftTo] = useState(initial.toDate)
  const [snapshot, setSnapshot] = useState<ConsumptionSnapshot | null>(null)
  const [usage, setUsage] = useState<ApiSection<AgentUsageReport> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [page, setPage] = useState(0)
  useEffect(() => {
    let cancelled = false
    setSnapshot(null)
    setSnapshotError(null)
    dataService.getConsumption?.().then((data) => {
      if (!cancelled) setSnapshot(data)
    }).catch((reason: unknown) => {
      if (!cancelled) setSnapshotError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { cancelled = true }
  }, [reloadKey])

  useEffect(() => {
    let cancelled = false
    setUsage(null)
    dataService.getAgentUsage?.(range).then((result) => {
      if (!cancelled) setUsage(result)
    }).catch((reason: unknown) => {
      if (!cancelled) setUsage({ status: 'error', error: reason instanceof Error ? reason.message : String(reason) })
    })
    return () => { cancelled = true }
  }, [range, reloadKey])

  const inventoryMap = useMemo(() => new Map(inventory.map((agent) => [usageAgentKey({
    agentId: agent.agentId ?? agent.id, environmentId: agent.environmentId,
  }), agent])), [inventory])
  const { rows, unmatchedIncluded, unmatchedExcluded } = useMemo(
    () => selectHarnessUsage(usage?.status === 'ready' ? usage.data.rows : [], agents, inventoryMap, filters),
    [usage, agents, inventoryMap, filters],
  )
  const totals = summarizeUsage(rows)
  const perAgent = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = usageAgentKey(row)
    const group = perAgent.get(key) ?? []
    group.push(row)
    perAgent.set(key, group)
  }
  const ranked = [...perAgent].map(([key, group]) => ({
    key,
    agent: inventoryMap.get(key),
    row: group[0],
    ...summarizeUsage(group),
  })).sort((a, b) => b.billed - a.billed || (b.nonBilled ?? 0) - (a.nonBilled ?? 0))
  const byHarness = (['standard', 'github', 'other', 'unknown'] as const)
    .map((kind) => ({ kind, ...summarizeUsage(rows.filter((row) => row.harnessKind === kind)) }))
    .filter(({ kind, activeAgents }) =>
      (filters.harnessScope === 'all' || filters.harnessScope === kind) &&
      (kind === 'standard' || kind === 'github' || activeAgents > 0),
    )
  const totalPages = Math.max(1, Math.ceil(ranked.length / 50))
  const safePage = Math.min(page, totalPages - 1)
  const priceValue = price.trim() === '' ? undefined : Number(price)
  const validPrice = priceValue !== undefined && Number.isFinite(priceValue) && priceValue >= 0
  const formatCost = (credits: number) => validPrice
    ? formatMoney(credits * priceValue, currency)
    : NOT_REPORTED

  const applyRange = () => {
    const next = { fromDate: draftFrom, toDate: draftTo, environmentIds: filters.environmentIds }
    try {
      validateConsumptionQuery(next)
      setError(null)
      setRange(next)
      setPage(0)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const capacity = snapshot?.capacity.status === 'ready' ? snapshot.capacity.data : undefined
  const usageReady = usage?.status === 'ready'
  const usageLoading = !!dataService.getAgentUsage && !usage
  const chartGroups = [
    { title: 'Billed credits by environment', key: (row: ConsumptionRow) => row.environmentName ?? row.environmentId ?? '' },
    { title: 'Billed credits by feature', key: (row: ConsumptionRow) => row.feature ?? '' },
    { title: 'Billed credits by channel', key: (row: ConsumptionRow) => formatChannel(row.channel) },
    { title: 'Billed credits by model', key: (row: ConsumptionRow) => row.llmModel ?? '' },
    { title: 'Billed credits by tool', key: (row: ConsumptionRow) => row.tool ?? '' },
    { title: 'Billed credits by knowledge source', key: (row: ConsumptionRow) => row.knowledgeSources ?? '' },
  ]

  return <div className="stack">
    <Card title="Consumption & cost" sub="Copilot Studio usage follows the inventory filters. Tenant balances and policies remain tenant-wide. Credits are not currency.">
      <div className="usage-form">
        <fieldset className="usage-fields">
          <legend>Reporting period (UTC)</legend>
          <div className="usage-fields-row period-fields">
            <label className="field">From<input type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} /></label>
            <label className="field">To<input type="date" value={draftTo} max={defaultConsumptionQuery().toDate} onChange={(event) => setDraftTo(event.target.value)} /></label>
            <button type="button" className="btn usage-apply" onClick={applyRange} disabled={usageLoading}>Apply period</button>
          </div>
        </fieldset>
        <fieldset className="usage-fields">
          <legend>Cost estimate</legend>
          <div className="usage-fields-row estimate-fields">
            <label className="field">Price per billed credit<input type="number" min="0" step="any" placeholder="Optional" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
            <label className="field">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {['EUR', 'USD', 'GBP'].map((code) => <option key={code}>{code}</option>)}
            </select></label>
          </div>
        </fieldset>
      </div>
      {price.trim() !== '' && !validPrice && <p role="alert">Enter a finite, non-negative contract price.</p>}
      {!dataService.getConsumption && <p className="muted">Consumption is not simulated in sample-data mode. Use the authenticated Power Apps player to load real APIs.</p>}
      {error && <p role="alert">{error}</p>}
      {snapshotError && <p role="alert">{snapshotError}</p>}
      <div className="usage-meta">
        <span><strong>Applied period:</strong> {formatDate(range.fromDate)} – {formatDate(range.toDate)} UTC</span>
        {snapshot && <span><strong>Capacity and policies loaded:</strong> {formatDateTime(snapshot.loadedAt)}</span>}
      </div>
    </Card>

    {dataService.getAgentUsage && <>
      <Card title="Copilot Studio usage" sub="Period totals from the Microsoft licensing report (preview), filtered by the current selection.">
        {usageLoading && <p role="status">Preparing the usage report. The first check is typically after five minutes; you can view capacity and policies while you wait.</p>}
        {usage && <SectionNotice section={usage} />}
        {usage?.status === 'ready' && <>
          {usage.data.unattributed > 0 && <p role="alert">
            Partial totals: {formatCount(usage.data.unattributed)} report rows have no agent or environment ID and could not be attributed.
          </p>}
          {unmatchedIncluded + unmatchedExcluded > 0 && <p role="status" className="muted">
            Usage rows without an inventory match: {formatCount(unmatchedIncluded)} included using report data, {formatCount(unmatchedExcluded)} excluded by the current filters.
          </p>}
          {rows.length > 0 ? <div className="grid cols-5">
            <KpiCard label="Billed credits" value={formatUsageCredits(totals.billed)} tone="teal" />
            <KpiCard label="Non-billed credits" value={formatUsageCredits(totals.nonBilled)} />
            <KpiCard label="Total credits" value={formatUsageCredits(totals.total)} tone="violet" />
            <KpiCard label="Active agents" value={formatCount(totals.activeAgents)} sub={`${formatCount(totals.environments)} environments`} tone="green" />
            <KpiCard label="Estimated billed cost" value={formatCost(totals.billed)} sub={validPrice ? 'Contract price × billed credits; not an invoice' : 'Enter your contract price to calculate an estimate'} tone="amber" />
          </div> : <p className="empty">No consumption rows for the current selection and period.</p>}
        </>}
      </Card>

      {usageReady && rows.length > 0 && <>
        <Card title="Consumption by harness" sub="Harness from inventory, or the usage report when inventory cannot identify it.">
          <div className="table-wrap"><table className="data">
            <thead><tr><th scope="col">Agent harness</th><th scope="col" className="num">Active agents</th><th scope="col" className="num">Billed credits</th><th scope="col" className="num">Non-billed credits</th><th scope="col" className="num">Total credits</th></tr></thead>
            <tbody>{byHarness.map((item) => (
              <tr key={item.kind}>
                <th scope="row">{HARNESS_LABELS[item.kind]}</th>
                <td className="num">{formatCount(item.activeAgents)}</td>
                <td className="num">{formatUsageCredits(item.billed)}</td>
                <td className="num">{formatUsageCredits(item.nonBilled)}</td>
                <td className="num">{formatUsageCredits(item.total)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
        <div className="grid cols-2">
          {chartGroups.map((group) => <Card key={group.title} title={group.title} sub="Top categories; remaining categories combined">
            <DonutChart data={breakdown(rows, group.key)} valueFormatter={(value) => `${formatUsageCredits(value)} credits`} />
          </Card>)}
        </div>
        <Card title={`Agent consumption (${formatCount(ranked.length)})`} sub="Sorted by billed credits, then by non-billed credits.">
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Agent</th><th>Environment</th><th>Agent harness</th><th className="num">Billed credits</th><th className="num">Non-billed credits</th><th className="num">Estimated cost</th></tr></thead>
            <tbody>{ranked.slice(safePage * 50, (safePage + 1) * 50).map((item) => <tr key={item.key}>
              <td title={item.row.agentId}>{formatText(item.agent?.name ?? item.row.agentName ?? item.row.agentId)}</td>
              <td>{formatText(item.agent?.environmentName ?? item.row.environmentName ?? item.row.environmentId)}</td>
              <td><Badge color={item.row.harnessKind === 'github' ? 'violet' : 'neutral'}>{HARNESS_LABELS[item.row.harnessKind]}</Badge></td>
              <td className="num">{formatUsageCredits(item.billed)}</td>
              <td className="num">{formatUsageCredits(item.nonBilled)}</td>
              <td className="num">{formatCost(item.billed)}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="page-nav usage-pagination">
            <button className="btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <span>Page {formatCount(safePage + 1)} / {formatCount(totalPages)}</span>
            <button className="btn" disabled={safePage + 1 === totalPages} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </Card>
      </>}

    </>}
    {dataService.getConsumption && !snapshot && !snapshotError && <p role="status">Loading credit capacity and policies…</p>}
    {snapshot && <>
      <Card title="Copilot Studio tenant capacity" sub={`Current-month capacity snapshot, not the filtered usage period. Source updated: ${formatDateTime(capacity?.dataUpdatedOn)}`}>
        <SectionNotice section={snapshot.capacity} />
        {capacity && <>
          <div className="grid cols-5">
            <KpiCard label="Entitled credits" value={formatUsageCredits(capacity.entitledCredits)} />
            <KpiCard label="Allocated credits" value={formatUsageCredits(capacity.allocatedCredits)} />
            <KpiCard label="Consumed capacity" value={formatUsageCredits(capacity.consumedCredits)} tone="teal" />
            <KpiCard label="Available credits" value={formatUsageCredits(capacity.availableCredits)} tone="green" />
            <KpiCard label="Pay-as-you-go credits" value={formatUsageCredits(capacity.payGoConsumedCredits)} tone="amber" />
          </div>
          <p><Badge color={capacity.capacityStatus === 'WithinCapacity' ? 'green' : capacity.capacityStatus ? 'amber' : 'neutral'}>{formatApiLabel(capacity.capacityStatus)}</Badge></p>
        </>}
      </Card>

      <Card title="Copilot Studio agent credit limits" sub="Tenant-wide, current month. Read-only: no limits or agent states are changed.">
        <SectionNotice section={snapshot.limits} />
        {snapshot.limits.status === 'ready' && (snapshot.limits.data.length === 0
          ? <p className="empty">No configured agent credit limits.</p>
          : <div className="table-wrap"><table className="data">
            <thead><tr><th>Agent / resource</th><th>Environment</th><th className="num">Monthly limit</th><th className="num">Consumed</th><th>Notification threshold</th><th>Stop over limit</th><th>Stopped</th></tr></thead>
            <tbody>{snapshot.limits.data.map((limit, index) => {
              const agent = inventoryMap.get(`${normalizeResourceId(limit.environmentId ?? '')}:${normalizeResourceId(limit.resourceId ?? '')}`)
              return <tr key={`${limit.environmentId}:${limit.resourceId}:${index}`}>
                <td>{formatText(agent?.name ?? limit.resourceId)}</td>
                <td>{formatText(agent?.environmentName ?? limit.environmentId)}</td>
                <td className="num">{formatUsageCredits(limit.limit)}</td>
                <td className="num">{formatUsageCredits(limit.resourceConsumption)}</td>
                <td className="num">{formatPercent(limit.notificationThreshold == null ? undefined : limit.notificationThreshold / 100)}</td>
                <td>{formatBoolean(limit.stopIfOverCapacity)}</td>
                <td>{formatBoolean(limit.stopResource)}</td>
              </tr>
            })}</tbody>
          </table></div>)}
      </Card>

      <Card title="M365 tenant credit balance" sub="Microsoft Graph beta snapshot by billing method. Not added to Copilot Studio capacity or filtered by inventory.">
        <SectionNotice section={snapshot.m365Balance} />
        {snapshot.m365Balance.status === 'ready' && (snapshot.m365Balance.data.billingMethodBalances?.length
          ? <div className="table-wrap"><table className="data">
            <thead><tr><th>Billing method</th><th className="num">Purchased</th><th className="num">Consumed</th><th className="num">Remaining</th><th>Unit</th><th>Updated</th></tr></thead>
            <tbody>{snapshot.m365Balance.data.billingMethodBalances.map((balance, index) => <tr key={`${balance.billingMethod}:${index}`}>
              <td>{formatApiLabel(balance.billingMethod)}</td>
              <td className="num">{formatUsageCredits(balance.purchasedQuantity)}</td>
              <td className="num">{formatUsageCredits(balance.consumedQuantity)}</td>
              <td className="num">{formatUsageCredits(balance.remainingQuantity)}</td>
              <td>{formatApiLabel(balance.unit)}</td>
              <td>{formatDateTime(balance.dataStatus?.lastModifiedDateTime)}</td>
            </tr>)}</tbody>
          </table></div>
          : <p className="empty">No billing-method balances returned.</p>)}
      </Card>

      <Card title="M365 spending policies" sub="Microsoft Graph beta. Tenant-wide monthly and per-user limits; read-only.">
        <SectionNotice section={snapshot.policies} />
        {snapshot.policies.status === 'ready' && (snapshot.policies.data.length === 0
          ? <p className="empty">No spending policies configured.</p>
          : <div className="table-wrap"><table className="data">
            <thead><tr><th>Policy</th><th>Audience</th><th>Status</th><th>Monthly limit</th><th>Per-user limit</th><th>Billing methods</th></tr></thead>
            <tbody>{snapshot.policies.data.map((policy, index) => <tr key={policy.id ?? index}>
              <td>{formatText(policy.displayName ?? policy.id)}</td>
              <td>{formatApiLabel(policy.policyType)}</td>
              <td><Badge color={policy.status === 'enabled' ? 'green' : 'neutral'}>{formatApiLabel(policy.status)}</Badge></td>
              <td>{formatCreditLimit(policy.periodLimit)}</td>
              <td>{formatCreditLimit(policy.perUserLimit)}</td>
              <td>{formatBillingMethods(policy.billingMethods)}</td>
            </tr>)}</tbody>
          </table></div>)}
      </Card>
    </>}
  </div>
}
