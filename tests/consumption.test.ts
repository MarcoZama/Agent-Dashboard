import assert from 'node:assert/strict'
import test from 'node:test'
import type { Agent, DashboardFilters } from '../src/models/types'
import {
  continuation,
  defaultConsumptionQuery,
  normalizeCapacity,
  normalizeLimits,
  normalizePolicies,
  normalizeUsage,
  responseRows,
  selectHarnessUsage,
  summarizeUsage,
  validateConsumptionQuery,
} from '../src/data/consumption.ts'
import { parseUsageReport } from '../src/data/usageReportCsv.ts'
import { coworkDailyWindows, defaultCoworkRange, isUnreportedCoworkDay, normalizeCoworkQuantity, summarizeCoworkUsage } from '../src/data/coworkUsage.ts'
import { formatBoolean, formatCreditLimit, formatDateTime, formatPercent, formatUsageCredits } from '../src/data/formatters.ts'
import { classifyHarness } from '../src/data/harness.ts'
import { filterAgents } from '../src/data/selectors.ts'

test('uses the last complete UTC month on the first day of a month', () => {
  assert.deepEqual(defaultConsumptionQuery(new Date('2026-12-01T00:30:00Z')), {
    fromDate: '2026-11-01', toDate: '2026-11-30', environmentIds: [],
  })
})

test('enforces actual calendar dates, complete UTC days and the inclusive 92-day maximum', () => {
  const now = new Date('2026-11-21T12:00:00Z')
  const query = (fromDate: string, toDate: string) => ({ fromDate, toDate, environmentIds: [] })
  assert.doesNotThrow(() => validateConsumptionQuery(query('2026-08-21', '2026-11-20'), now))
  assert.throws(() => validateConsumptionQuery(query('2026-08-20', '2026-11-20'), now), /92 days/)
  assert.throws(() => validateConsumptionQuery(query('2026-02-30', '2026-03-01'), now), /valid UTC dates/)
  assert.throws(() => validateConsumptionQuery(query('2026-11-20', '2026-11-21'), now), /yesterday/)
  assert.throws(() => validateConsumptionQuery(query('2026-11-20', '2026-11-19'), now), /must not be after/)
})

test('normalizes the raw capacity response verified against the connector', () => {
  const result = normalizeCapacity({
    entitlementId: 'MCSMessages',
    entitlement: {
      capacity: {
        entitled: { value: 57000 },
        allocated: { value: 0 },
        consumed: { value: 0, lastUpdatedOn: '2026-11-11T00:00:00Z' },
        availableQuantity: 57000,
        status: 'WithinCapacity',
      },
      payGo: { consumed: { value: 1703.41 } },
    },
  })
  assert.equal(result.entitledCredits, 57000)
  assert.equal(result.allocatedCredits, 0)
  assert.equal(result.consumedCredits, 0)
  assert.equal(result.payGoConsumedCredits, 1703.41)
  assert.equal(result.dataUpdatedOn, '2026-11-11T00:00:00Z')
  assert.throws(() => normalizeCapacity({}), /Credit entitlement/)
})

test('normalizes raw consumption without inventing zero credits when values are missing', () => {
  const row = normalizeUsage({
    resourceId: 'agent', consumed: 10.25,
    metadata: { nonBillableConsumed: 2.5, Feature: 'Generative answers' },
  }, 'environment')
  assert.equal(row.billedCredits, 10.25)
  assert.equal(row.nonBilledCredits, 2.5)
  assert.equal(row.feature, 'Generative answers')
  assert.equal(row.environmentId, 'environment')
  assert.throws(() => normalizeUsage({ resourceId: 'agent' }, 'environment'), /billed credits/)
  assert.throws(() => normalizeUsage({ resourceId: 'agent', consumed: '10' }, 'environment'), /finite number/)
})

test('filters inventory and usage by harness, joining on both normalized IDs', () => {
  const rows = [
    { environmentId: 'env-a', agentId: 'agent', billedCredits: 1, reportHarness: 'Standard Harness' },
    { environmentId: 'env-b', agentId: 'agent', billedCredits: 2 },
    { environmentId: 'env-b', agentId: 'retired', billedCredits: 3, reportHarness: 'GitHub' },
  ]
  const agents: Agent[] = [{
    id: 'env-a:agent', agentId: '{AGENT}', environmentId: '{ENV-A}',
    name: 'Example', product: 'powerPlatform', environmentName: 'A',
    environmentType: 'Production', type: 'Custom', owner: 'Owner',
    legalEntity: 'example.com', legalEntityLabel: 'Example',
    auth: 'Integrated', published: true, createdOn: '', healthScore: 100,
    llmModel: 'Unknown', channels: [], autonomous: false, harness: 'GitHub Copilot',
    capabilities: { generativeAI: false, toolsActions: false, knowledgeSources: false,
      connectedAgents: false, webSearch: false, connectors: false, deepReasoning: false },
  }]
  const inventory = new Map([['env-a:agent', agents[0]]])
  const filters: DashboardFilters = {
    product: 'powerPlatform', harnessScope: 'github', environmentIds: [], agentIds: [],
    ownerIds: [], legalEntities: [], authScope: 'all',
  }
  assert.deepEqual(filterAgents(agents, filters), agents)
  assert.deepEqual(filterAgents(agents, { ...filters, harnessScope: 'standard' }), [])
  const selected = selectHarnessUsage(rows, agents, inventory, filters)
  assert.deepEqual(selected.rows.map((row) => row.billedCredits), [1, 3])
  assert.equal(selected.unmatchedExcluded, 1)
  assert.equal(selected.unmatchedIncluded, 1)
  const ownerScoped = selectHarnessUsage(rows, agents, inventory, { ...filters, ownerIds: ['Owner'] })
  assert.deepEqual(ownerScoped.rows.map((row) => row.billedCredits), [1])
})

test('keeps a missing harness separate from Standard and reads a report harness when inventory is blank', () => {
  assert.equal(classifyHarness(' GitHub Copilot '), 'github')
  assert.equal(classifyHarness('Standard'), 'standard')
  assert.equal(classifyHarness(''), 'unknown')
  assert.equal(classifyHarness('future-runtime'), 'other')
  const csv = 'EnvironmentID,ResourceID,HarnessType,BilledCredits,NonBilledCredits\n' +
    'env,agent,Standard,2,0\nenv,unknown,,3,0\n'
  const { rows } = parseUsageReport(csv)
  const filters: DashboardFilters = {
    product: 'powerPlatform', harnessScope: 'standard', environmentIds: [],
    agentIds: [], ownerIds: [], legalEntities: [], authScope: 'all',
  }
  assert.equal(selectHarnessUsage(rows, [], new Map(), filters).rows[0].agentId, 'agent')
  assert.equal(selectHarnessUsage(rows, [], new Map(), { ...filters, harnessScope: 'unknown' }).rows[0].agentId, 'unknown')
})

test('formats real zeros, decimal credits, UTC timestamps and unlimited policy limits without inventing values', () => {
  assert.equal(formatUsageCredits(1703.41), '1,703.41')
  assert.equal(formatUsageCredits(0), '0')
  assert.equal(formatUsageCredits(null), 'Not reported')
  assert.equal(formatBoolean(undefined), 'Not reported')
  assert.equal(formatPercent(0.825), '82.5%')
  assert.match(formatDateTime('2026-11-21T00:15:00+01:00'), /Nov 20, 2026.*11:15 PM UTC/)
  assert.equal(formatDateTime('not a date'), 'Not reported')
  assert.equal(formatCreditLimit({ isUnlimited: true, unit: 'copilotCredit' }), 'Unlimited')
  assert.equal(formatCreditLimit({ value: 0, unit: 'copilotCredit' }), '0 Copilot credits')
})

test('preserves decimal totals and distinct composite agent identities', () => {
  const rows = [
    { agentId: 'agent', environmentId: 'a', billedCredits: 10.25, nonBilledCredits: 2.5, users: 3 },
    { agentId: 'agent', environmentId: 'a', billedCredits: 1.5, nonBilledCredits: 0, users: 3 },
    { agentId: 'agent', environmentId: 'b', billedCredits: 2, nonBilledCredits: 0 },
  ]
  assert.deepEqual(summarizeUsage(rows), {
    billed: 13.75, nonBilled: 2.5, total: 16.25, activeAgents: 2, environments: 2,
  })
  assert.equal(summarizeUsage([...rows, { billedCredits: 1 }]).nonBilled, undefined)
  assert.equal(summarizeUsage([...rows, { billedCredits: 1 }]).total, undefined)
})

test('supports raw empty limits, but rejects malformed and unsupported incomplete collections', () => {
  assert.deepEqual(normalizeLimits([]), [])
  assert.deepEqual(responseRows({ value: [] }, 'Usage'), [])
  assert.throws(() => responseRows({}, 'Usage'), /missing its row collection/)
  assert.equal(continuation({ value: [], continuationtoken: 'next' }), 'next')
  assert.throws(() => continuation({ value: [], isComplete: false }), /incomplete/)
  assert.throws(() => continuation({ value: [], '@odata.nextLink': 'next' }), /not complete/)
})

test('recognizes raw Graph unlimited quantities instead of showing a zero spending limit', () => {
  const [policy] = normalizePolicies({ value: [{
    '@odata.type': '#microsoft.graph.allUsersSpendingPolicy',
    periodLimit: { '@odata.type': '#microsoft.graph.unlimitedCostManagementQuantity', unit: 'copilotCredit' },
    perUserLimit: { '@odata.type': '#microsoft.graph.limitedCostManagementQuantity', value: 0, unit: 'copilotCredit' },
  }] })
  assert.equal(policy.policyType, 'allUsers')
  assert.equal(policy.periodLimit?.isUnlimited, true)
  assert.equal(policy.perUserLimit?.isUnlimited, false)
  assert.equal(policy.perUserLimit?.value, 0)
  assert.throws(() => normalizePolicies({ value: [], '@odata.nextLink': 'next' }), /paginated/)
})

test('parses the Microsoft report header, escaped CSV labels and precise credit totals', () => {
  const csv = '\ufeff"EnvironmentID","ResourceID","ResourceName","BilledCredits","NonBilledCredits","ToolUsed","LLMModel"\r\n' +
    '"env","agent","Support, ""IT""","1.25","2.50","Search\r\nKnowledge","model"\r\n' +
    '"env","agent","Support, ""IT""","0.75","0","","model"\r\n'
  const { rows, unattributed } = parseUsageReport(csv)
  assert.equal(unattributed, 0)
  assert.equal(rows[0].agentName, 'Support, "IT"')
  assert.equal(rows[0].tool, 'Search\r\nKnowledge')
  assert.equal(rows[0].llmModel, 'model')
  assert.deepEqual(summarizeUsage(rows), {
    billed: 2, nonBilled: 2.5, total: 4.5, activeAgents: 1, environments: 1,
  })
})

test('builds one completed UTC request window per Cowork day, including across month-end', () => {
  const now = new Date('2026-12-02T00:15:00Z')
  assert.deepEqual(defaultCoworkRange(now), { fromDate: '2026-11-25', toDate: '2026-12-01' })
  assert.deepEqual(coworkDailyWindows({ fromDate: '2026-11-30', toDate: '2026-12-01' }, now), [
    { startDate: '2026-11-30', endDate: '2026-12-01' },
    { startDate: '2026-12-01', endDate: '2026-12-02' },
  ])
  assert.throws(() => coworkDailyWindows({ fromDate: '2026-11-01', toDate: '2026-12-02' }, now), /completed UTC days/)
  assert.throws(() => coworkDailyWindows({ fromDate: '2026-10-31', toDate: '2026-12-01' }, now), /at most 31/)
})

test('keeps Cowork credit quantities, missing usage and request failures distinct', () => {
  assert.equal(normalizeCoworkQuantity({ serviceId: 'cowork', unit: 'copilotCredit', consumedQuantity: 0 }), 0)
  assert.throws(() => normalizeCoworkQuantity({ serviceId: 'cowork', unit: 'usd', consumedQuantity: 50 }), /valid Cowork/)
  assert.equal(isUnreportedCoworkDay(404, '{"error":{"code":"usageDataUnavailable"}}'), true)
  assert.equal(isUnreportedCoworkDay(404, 'The source returned no represented usage.'), true)
  assert.equal(isUnreportedCoworkDay(404, 'API route not found.'), false)
  assert.equal(isUnreportedCoworkDay(503, 'sourceUnavailable'), false)

  const absent = { date: '2026-11-18', status: 'unreported' } as const
  const failed = { date: '2026-11-19', status: 'error', httpStatus: 503 } as const
  const zero = { date: '2026-11-20', status: 'reported', credits: 0 } as const
  assert.deepEqual(summarizeCoworkUsage([absent, failed]), { credits: undefined, reported: 0, unreported: 1, failed: 1 })
  assert.deepEqual(summarizeCoworkUsage([absent, failed, zero]), { credits: 0, reported: 1, unreported: 1, failed: 1 })
})

test('distinguishes empty, partial and invalid usage report responses', () => {
  const header = 'EnvironmentID,ResourceID,BilledCredits,NonBilledCredits\n'
  assert.deepEqual(parseUsageReport(header), { rows: [], unattributed: 0 })
  const partial = parseUsageReport(header + 'env,agent,0,2\nenv,,9,1\n')
  assert.equal(partial.unattributed, 1)
  assert.equal(partial.rows[0].billedCredits, 0)
  assert.throws(() => parseUsageReport(header + 'env,,9,1'), /No report rows/)
  assert.throws(() => parseUsageReport(header + 'env,agent,,0'), /invalid BilledCredits/)
  assert.throws(() => parseUsageReport(header + 'env,"unfinished,3,0'), /unterminated/)
  assert.throws(() => parseUsageReport('EnvironmentID,ResourceID,BilledCredits\n'), /missing NonBilledCredits/)
})
