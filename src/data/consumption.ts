import type { Agent, ConsumptionQuery, DashboardFilters, UsageReportRow } from '../models/types'
import type { ConsumptionRow, CreditCapacity, AgentLimit } from '../generated/models/CopilotStudioCreditConsumptionModel'
import type { SpendingPolicy } from '../generated/models/CopilotCostManagementModel'
import { classifyHarness, type HarnessKind } from './harness.ts'

const DAY_MS = 86_400_000

export const normalizeResourceId = (id: string): string =>
  id.replace(/[{}]/g, '').trim().toLowerCase()

export const usageAgentKey = (row: ConsumptionRow): string =>
  `${normalizeResourceId(row.environmentId ?? '')}:${normalizeResourceId(row.agentId ?? '')}`

export function defaultConsumptionQuery(now = new Date()): ConsumptionQuery {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS)
  const toDate = yesterday.toISOString().slice(0, 10)
  return { fromDate: `${toDate.slice(0, 7)}-01`, toDate, environmentIds: [] }
}

export function validateConsumptionQuery(query: ConsumptionQuery, now = new Date()): void {
  for (const value of [query.fromDate, query.toDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value) {
      throw new Error('Enter valid UTC dates in YYYY-MM-DD format.')
    }
  }
  if (query.fromDate > query.toDate) throw new Error('From date must not be after to date.')
  if (query.toDate > defaultConsumptionQuery(now).toDate) {
    throw new Error('Consumption is available only through yesterday (UTC).')
  }
  if ((Date.parse(query.toDate) - Date.parse(query.fromDate)) / DAY_MS >= 92) {
    throw new Error('Select a range of at most 92 days.')
  }
}

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}: unexpected API response shape.`)
  }
  return value as Record<string, unknown>
}

const optionalObject = (value: unknown, label: string): Record<string, unknown> =>
  value == null ? {} : object(value, label)

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const numeric = (value: unknown, label: string): number | undefined => {
  if (value == null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}: expected a finite number.`)
  }
  return value
}

export function responseRows(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value
  const record = object(value, label)
  if (!Array.isArray(record.value)) throw new Error(`${label}: response is missing its row collection.`)
  return record.value
}

export function continuation(value: unknown): string | undefined {
  if (Array.isArray(value)) return undefined
  const record = object(value, 'Pagination')
  const token = text(record.continuationToken) ?? text(record.continuationtoken)
  if (record.isComplete === false && !token) {
    throw new Error('Consumption response is incomplete and has no continuation token.')
  }
  if (record['@odata.nextLink'] && !token) {
    throw new Error('The connector returned another page without a supported continuation token; totals are not complete.')
  }
  return token
}

export function normalizeUsage(value: unknown, environmentId: string): ConsumptionRow {
  const row = object(value, 'Consumption')
  const metadata = optionalObject(row.metadata, 'Consumption metadata')
  const agentId = text(row.agentId) ?? text(row.resourceId)
  const billedCredits = numeric(row.billedCredits ?? row.consumed, 'Billed credits')
  const nonBilledCredits = numeric(row.nonBilledCredits ?? metadata.nonBillableConsumed, 'Non-billed credits')
  if (!agentId || billedCredits === undefined) {
    throw new Error('Consumption row is missing its agent ID or billed credits; totals cannot be calculated.')
  }
  return {
    agentId,
    environmentId: text(row.environmentId) ?? environmentId,
    agentName: text(row.agentName) ?? text(metadata.resourceName),
    environmentName: text(row.environmentName),
    billedCredits,
    nonBilledCredits,
    channel: text(row.channel) ?? text(metadata.ChannelId),
    feature: text(row.feature) ?? text(metadata.Feature),
    tool: text(row.tool) ?? text(metadata.ToolInvoked),
    llmModel: text(row.llmModel) ?? text(metadata.LlmModel),
    knowledgeSources: text(row.knowledgeSources) ?? text(metadata.KnowledgeSources),
    product: text(row.product) ?? text(metadata.ProductName),
    users: numeric(row.users ?? metadata.users, 'Users'),
    asOfDate: text(row.asOfDate) ?? text(metadata.asOfDate) ?? text(row.lastRefreshedDate),
    metadata,
  }
}

export function normalizeCapacity(value: unknown): CreditCapacity {
  const record = object(value, 'Credit capacity')
  if (record.entitledCredits !== undefined) {
    return {
      entitlementId: text(record.entitlementId),
      entitledCredits: numeric(record.entitledCredits, 'Entitled credits'),
      allocatedCredits: numeric(record.allocatedCredits, 'Allocated credits'),
      consumedCredits: numeric(record.consumedCredits, 'Consumed credits'),
      availableCredits: numeric(record.availableCredits, 'Available credits'),
      payGoConsumedCredits: numeric(record.payGoConsumedCredits, 'Pay-as-you-go credits'),
      capacityStatus: text(record.capacityStatus),
      dataUpdatedOn: text(record.dataUpdatedOn),
    }
  }
  const entitlement = object(record.entitlement, 'Credit entitlement')
  const capacity = object(entitlement.capacity, 'Credit capacity')
  const entitled = optionalObject(capacity.entitled, 'Entitled capacity')
  const consumed = optionalObject(capacity.consumed, 'Consumed capacity')
  const allocated = optionalObject(capacity.allocated, 'Allocated capacity')
  const payGo = optionalObject(entitlement.payGo, 'Pay-as-you-go')
  const payGoConsumed = optionalObject(payGo.consumed, 'Pay-as-you-go consumption')
  return {
    entitlementId: text(record.entitlementId),
    entitledCredits: numeric(entitled.value, 'Entitled credits'),
    allocatedCredits: numeric(allocated.value, 'Allocated credits'),
    consumedCredits: numeric(consumed.value, 'Consumed credits'),
    availableCredits: numeric(capacity.availableQuantity, 'Available credits'),
    payGoConsumedCredits: numeric(payGoConsumed.value, 'Pay-as-you-go credits'),
    capacityStatus: text(capacity.status),
    consumptionType: text(consumed.consumptionType),
    dataUpdatedOn: text(consumed.lastUpdatedOn) ?? text(payGoConsumed.lastUpdatedOn),
  }
}

export function normalizeLimits(value: unknown): AgentLimit[] {
  return responseRows(value, 'Agent credit limits').map((value) => {
    const row = object(value, 'Agent credit limit')
    return {
      resourceId: text(row.resourceId),
      environmentId: text(row.environmentId),
      limit: numeric(row.limit, 'Credit limit'),
      resourceConsumption: numeric(row.resourceConsumption, 'Limit consumption'),
      notificationThreshold: numeric(row.notificationThreshold, 'Notification threshold'),
      notifyIfOverCapacity: typeof row.notifyIfOverCapacity === 'boolean' ? row.notifyIfOverCapacity : undefined,
      stopIfOverCapacity: typeof row.stopIfOverCapacity === 'boolean' ? row.stopIfOverCapacity : undefined,
      stopResource: typeof row.stopResource === 'boolean' ? row.stopResource : undefined,
    }
  })
}

export function normalizePolicies(value: unknown): SpendingPolicy[] {
  const rows = responseRows(value, 'M365 spending policies')
  if (!Array.isArray(value) && object(value, 'Spending policies')['@odata.nextLink']) {
    throw new Error('M365 policy results are paginated; this connector cannot retrieve the remaining policies.')
  }
  return rows.map((value) => {
    const row = object(value, 'Spending policy')
    const quantity = (value: unknown) => {
      if (value == null) return undefined
      const q = object(value, 'Policy limit')
      return {
        '@odata.type': text(q['@odata.type']),
        isUnlimited: q.isUnlimited === true || q['@odata.type'] === '#microsoft.graph.unlimitedCostManagementQuantity',
        value: numeric(q.value, 'Policy limit'),
        unit: text(q.unit),
      }
    }
    return {
      id: text(row.id),
      displayName: text(row.displayName),
      status: text(row.status),
      policyType: text(row.policyType) ?? (
        text(row['@odata.type'])?.includes('allUsers') ? 'allUsers' :
          text(row['@odata.type'])?.includes('selectedGroups') ? 'selectedGroups' : undefined
      ),
      billingMethods: text(row.billingMethods),
      periodLimit: quantity(row.periodLimit),
      perUserLimit: quantity(row.perUserLimit),
    }
  })
}

export function selectHarnessUsage(
  reportRows: UsageReportRow[],
  scopedAgents: Agent[],
  inventory: Map<string, Agent>,
  filters: DashboardFilters,
) {
  const environments = new Set(filters.environmentIds.map(normalizeResourceId))
  const rows = reportRows.filter((row) => !environments.size || environments.has(normalizeResourceId(row.environmentId ?? '')))
  const scopedKeys = new Set(scopedAgents.map((agent) => usageAgentKey({
    agentId: agent.agentId ?? agent.id,
    environmentId: agent.environmentId,
  })))
  const canUseUnmatched = filters.product === 'powerPlatform' && filters.agentIds.length === 0 &&
    filters.ownerIds.length === 0 && filters.legalEntities.length === 0 && filters.authScope === 'all'
  const reported = new Map<string, Set<HarnessKind>>()
  for (const row of rows) {
    const kind = classifyHarness(row.reportHarness)
    if (kind === 'unknown') continue
    const key = usageAgentKey(row)
    const values = reported.get(key) ?? new Set<HarnessKind>()
    values.add(kind)
    reported.set(key, values)
  }
  const harnessFor = (key: string) => {
    const fromInventory = classifyHarness(inventory.get(key)?.harness)
    const fromReport = reported.get(key)
    return fromInventory !== 'unknown' ? fromInventory
      : fromReport?.size === 1 ? [...fromReport][0] : 'unknown'
  }
  let unmatchedIncluded = 0
  let unmatchedExcluded = 0
  const visible = rows.flatMap((row) => {
    const key = usageAgentKey(row)
    const harnessKind = harnessFor(key)
    const matchesHarness = filters.harnessScope === 'all' || filters.harnessScope === harnessKind
    if (inventory.has(key)) {
      return scopedKeys.has(key) && matchesHarness ? [{ ...row, harnessKind }] : []
    }
    if (canUseUnmatched && matchesHarness) {
      unmatchedIncluded++
      return [{ ...row, harnessKind }]
    }
    unmatchedExcluded++
    return []
  })
  return { rows: visible, unmatchedIncluded, unmatchedExcluded }
}

export function summarizeUsage(rows: ConsumptionRow[]) {
  const billed = rows.reduce((total, row) => total + (row.billedCredits ?? 0), 0)
  const nonBilled = rows.every((row) => row.nonBilledCredits !== undefined)
    ? rows.reduce((total, row) => total + (row.nonBilledCredits ?? 0), 0)
    : undefined
  return {
    billed,
    nonBilled,
    total: nonBilled === undefined ? undefined : billed + nonBilled,
    activeAgents: new Set(rows.map(usageAgentKey)).size,
    environments: new Set(rows.map((row) => normalizeResourceId(row.environmentId ?? ''))).size,
  }
}

