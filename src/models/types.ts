import type { AgentLimit, ConsumptionRow, CreditCapacity } from '../generated/models/CopilotStudioCreditConsumptionModel'
import type { SpendingPolicy, TenantCreditBalance } from '../generated/models/CopilotCostManagementModel'
import type { HarnessKind } from '../data/harness'

// Domain model for the Power Platform API-backed agent inventory dashboard.

export type ProductKind = 'm365' | 'powerPlatform'

export type AgentType = 'Custom' | 'Standard' | 'Template'

export type AuthMode = 'Integrated' | 'None' | 'Manual' | 'ServicePrincipal' | 'Unknown'

export type EnvironmentType =
  | 'Production'
  | 'Sandbox'
  | 'Developer'
  | 'Default'
  | 'Trial'
  | 'Unknown'

export type AgentChannel = string

/** The Gen AI capabilities tracked per agent (drives the adoption chart). */
export interface AgentCapabilities {
  generativeAI: boolean
  toolsActions: boolean
  knowledgeSources: boolean
  connectedAgents: boolean
  webSearch: boolean
  connectors: boolean
  deepReasoning: boolean
}

/**
 * A legal entity is a grouping of users that share the same email domain on
 * their UPN (e.g. everyone @contoso.com). Derived from the agent owner email.
 */
export interface LegalEntity {
  /** The email domain, e.g. "contoso.com". Acts as the stable id. */
  domain: string
  /** Friendly label, e.g. "Contoso". */
  label: string
}

export interface EnvironmentInfo {
  id: string
  name: string
  region: string
  type: EnvironmentType
  /** Organization URL reported by the environment API, when available. */
  url?: string
}

export interface Agent {
  id: string
  /** Agent identifier in its Power Platform environment. */
  agentId?: string
  name: string
  product: ProductKind
  environmentId: string
  environmentName: string
  /** Environment type (Production / Sandbox / Developer …). */
  environmentType: EnvironmentType
  /** Organization URL of the hosting environment. */
  environmentUrl?: string
  type: AgentType
  owner: string
  ownerEmail?: string
  /** Email domain of the owner UPN — the legal entity id. */
  legalEntity: string
  /** Friendly legal entity label. */
  legalEntityLabel: string
  auth: AuthMode
  published: boolean
  /** Authoring surface reported by Power Platform inventory. */
  createdIn?: string
  schemaName?: string
  harness?: string
  orchestration?: string
  isQuarantined?: boolean
  isManaged?: boolean
  sharedWithEntireTenant?: boolean
  viewerUserCount?: number
  viewerGroupCount?: number
  editorUserCount?: number
  editorGroupCount?: number
  toolsCount?: number
  knowledgeSourcesCount?: number
  connectedAgentsCount?: number
  topicsCount?: number
  connectorCount?: number
  connectorOperationCount?: number
  triggersCount?: number
  webSearchEnabled?: boolean
  /** ISO date string */
  createdOn: string
  /** 0–100 composite health/governance score */
  healthScore: number
  llmModel: string
  channels: AgentChannel[]
  capabilities: AgentCapabilities
  /** Runs without an interactive user (autonomous / trigger based) */
  autonomous: boolean
}

export type AuthScope = 'all' | 'authenticated' | 'none'

export interface DashboardFilters {
  product: ProductKind
  harnessScope: 'all' | HarnessKind
  /** Selected environment ids — empty means all. */
  environmentIds: string[]
  /** Selected agent ids — empty means all. */
  agentIds: string[]
  /** Selected owner display names — empty means all. */
  ownerIds: string[]
  /** Selected legal entity domains — empty means all. */
  legalEntities: string[]
  authScope: AuthScope
}

/** A data service implementation backed by APIs or local sample data. */
export interface IDataService {
  readonly mode: 'mock' | 'api'
  getEnvironments(): Promise<EnvironmentInfo[]>
  getAgents(): Promise<Agent[]>
  getConsumption?(): Promise<ConsumptionSnapshot>
  getAgentUsage?(query: ConsumptionQuery): Promise<ApiSection<AgentUsageReport>>
  getCoworkUsage?(range: UsageDateRange, signal: AbortSignal): Promise<CoworkUsageDay[]>
  /** Drop any cached data so the next read hits the source again. */
  invalidate?(): void
}

export interface UsageDateRange {
  fromDate: string
  toDate: string
}

export interface ConsumptionQuery extends UsageDateRange {
  environmentIds: string[]
}

export type CoworkUsageDay = { date: string } & (
  | { status: 'reported'; credits: number }
  | { status: 'unreported' | 'notRequested' }
  | { status: 'error'; httpStatus?: number }
)

export type ApiSection<T> =
  | { status: 'ready'; data: T }
  | { status: 'empty'; message: string }
  | { status: 'error'; error: string }

export interface ConsumptionSnapshot {
  capacity: ApiSection<CreditCapacity>
  limits: ApiSection<AgentLimit[]>
  m365Balance: ApiSection<TenantCreditBalance>
  policies: ApiSection<SpendingPolicy[]>
  loadedAt: string
}

export interface AgentUsageReport {
  rows: UsageReportRow[]
  unattributed: number
}

export interface UsageReportRow extends ConsumptionRow {
  reportHarness?: string
}
