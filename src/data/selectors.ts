import type {
  Agent,
  AgentCapabilities,
  DashboardFilters,
  LegalEntity,
} from '../models/types'
import { classifyHarness } from './harness.ts'

/** Friendly labels for known email domains. */
const LEGAL_ENTITY_LABELS: Record<string, string> = {
  'contoso.com': 'Contoso',
  'fabrikam.com': 'Fabrikam',
  'northwind.com': 'Northwind',
}

export const UNASSIGNED_LEGAL_ENTITY = '(unassigned)'

/** Derive the legal entity (email domain) from an owner UPN/email. */
export function deriveLegalEntity(email?: string): LegalEntity {
  const domain = email && email.includes('@')
    ? email.split('@')[1].toLowerCase().trim()
    : UNASSIGNED_LEGAL_ENTITY
  if (domain === UNASSIGNED_LEGAL_ENTITY) {
    return { domain, label: 'Unassigned' }
  }
  const label =
    LEGAL_ENTITY_LABELS[domain] ??
    domain.replace(/\.[a-z]+$/i, '').replace(/^./, (c) => c.toUpperCase())
  return { domain, label }
}

/** Apply the active dashboard filters to the agent collection. */
export function filterAgents(agents: Agent[], f: DashboardFilters): Agent[] {
  return agents.filter((a) => {
    if (f.product !== a.product) return false
    if (f.harnessScope !== 'all' && classifyHarness(a.harness) !== f.harnessScope) return false
    if (f.environmentIds.length > 0 && !f.environmentIds.includes(a.environmentId)) return false
    if (f.agentIds.length > 0 && !f.agentIds.includes(a.id)) return false
    if (f.ownerIds.length > 0 && !f.ownerIds.includes(a.owner)) return false
    if (f.legalEntities.length > 0 && !f.legalEntities.includes(a.legalEntity)) return false

    if (f.authScope === 'authenticated' && (a.auth === 'None' || a.auth === 'Unknown')) return false
    if (f.authScope === 'none' && a.auth !== 'None') return false
    return true
  })
}

export interface DashboardKpis {
  agentsInScope: number
  publishedShare: number
  genAiAdoption: number
  genAiAgents: number
  avgCapabilities: number
  trackedCapabilities: number
  distinctOwners: number
  avgAgentsPerOwner: number
  topOwnerShare: number
  legalEntities: number
}

const CAPABILITY_KEYS: (keyof AgentCapabilities)[] = [
  'generativeAI',
  'toolsActions',
  'knowledgeSources',
  'connectedAgents',
  'webSearch',
  'connectors',
  'deepReasoning',
]

const countCapabilities = (c: AgentCapabilities): number =>
  CAPABILITY_KEYS.reduce((n, k) => n + (c[k] ? 1 : 0), 0)

export function computeKpis(agents: Agent[]): DashboardKpis {
  const total = agents.length || 1
  const genAiAgents = agents.filter((a) => a.capabilities.generativeAI).length
  const published = agents.filter((a) => a.published).length
  const owners = new Map<string, number>()
  for (const a of agents) owners.set(a.owner, (owners.get(a.owner) ?? 0) + 1)
  const ownerCounts = [...owners.values()].sort((x, y) => y - x)
  const top5 = ownerCounts.slice(0, 5).reduce((s, n) => s + n, 0)

  const totalCaps = agents.reduce((s, a) => s + countCapabilities(a.capabilities), 0)
  const legalEntities = new Set(agents.map((a) => a.legalEntity))

  return {
    agentsInScope: agents.length,
    publishedShare: published / total,
    genAiAdoption: genAiAgents / total,
    genAiAgents,
    avgCapabilities: agents.length ? totalCaps / agents.length : 0,
    trackedCapabilities: CAPABILITY_KEYS.length,
    distinctOwners: owners.size,
    avgAgentsPerOwner: owners.size ? agents.length / owners.size : 0,
    topOwnerShare: agents.length ? top5 / agents.length : 0,
    legalEntities: legalEntities.size,
  }
}

export interface CapabilityAdoption {
  key: keyof AgentCapabilities
  label: string
  share: number
  count: number
}

const CAPABILITY_LABELS: Record<keyof AgentCapabilities, string> = {
  generativeAI: 'Generative AI',
  toolsActions: 'Tools / actions',
  knowledgeSources: 'Knowledge sources',
  connectedAgents: 'Connected agents',
  webSearch: 'Web search',
  connectors: 'Power Platform connectors',
  deepReasoning: 'Deep reasoning',
}

export function capabilityAdoption(agents: Agent[]): CapabilityAdoption[] {
  const total = agents.length || 1
  return CAPABILITY_KEYS.map((key) => {
    const count = agents.filter((a) => a.capabilities[key]).length
    return { key, label: CAPABILITY_LABELS[key], share: count / total, count }
  }).sort((a, b) => b.share - a.share)
}

/** Distinct legal entities present in the inventory with agent counts. */
export function legalEntityList(agents: Agent[]): (LegalEntity & { agents: number })[] {
  const map = new Map<string, LegalEntity & { agents: number }>()
  for (const a of agents) {
    const cur = map.get(a.legalEntity) ?? {
      domain: a.legalEntity,
      label: a.legalEntityLabel,
      agents: 0,
    }
    cur.agents += 1
    map.set(a.legalEntity, cur)
  }
  return [...map.values()].sort((x, y) => y.agents - x.agents)
}

export type ActionItemKey =
  | 'noAuth'
  | 'unpublished'
  | 'quarantined'
  | 'noOwner'
  | 'autonomous'

export interface ActionItem {
  key: ActionItemKey
  count: number
  title: string
  subtitle: string
  tone: 'danger' | 'warning' | 'neutral' | 'info'
}

export function actionItems(agents: Agent[]): ActionItem[] {
  const noAuth = agents.filter((a) => a.auth === 'None').length
  const unpublished = agents.filter((a) => !a.published).length
  const quarantined = agents.filter((a) => a.isQuarantined).length
  const noOwner = agents.filter((a) => !a.owner || a.owner === 'Env Maker').length
  const autonomous = agents.filter((a) => a.autonomous).length

  return [
    { key: 'noAuth', count: noAuth, title: 'No end-user auth', subtitle: 'Potential public exposure', tone: 'danger' },
    { key: 'unpublished', count: unpublished, title: 'Unpublished', subtitle: 'Draft / not live', tone: 'warning' },
    { key: 'quarantined', count: quarantined, title: 'Quarantined', subtitle: 'Blocked by governance', tone: 'danger' },
    { key: 'noOwner', count: noOwner, title: 'No owner', subtitle: 'Ownership missing', tone: 'neutral' },
    { key: 'autonomous', count: autonomous, title: 'Autonomous', subtitle: 'Runs without a user', tone: 'info' },
  ]
}

export function matchesActionItem(a: Agent, key: ActionItemKey): boolean {
  switch (key) {
    case 'noAuth':
      return a.auth === 'None'
    case 'unpublished':
      return !a.published
    case 'quarantined':
      return !!a.isQuarantined
    case 'noOwner':
      return !a.owner || a.owner === 'Env Maker'
    case 'autonomous':
      return a.autonomous
  }
}

