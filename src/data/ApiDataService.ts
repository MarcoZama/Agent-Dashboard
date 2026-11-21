import type {
  Agent,
  AuthMode,
  ConsumptionQuery,
  ConsumptionSnapshot,
  EnvironmentInfo,
  EnvironmentType,
  IDataService,
} from '../models/types'
import type {
  Clause,
  EnvironmentResponse,
  ResourceItem,
  ResourceQueryRequest,
} from '../generated/models/PowerPlatformforAdminsV2Model'
import type { GraphUser_V1 } from '../generated/models/Office365UsersModel'
import { PowerPlatformforAdminsV2Service } from '../generated/services/PowerPlatformforAdminsV2Service'
import { Office365UsersService } from '../generated/services/Office365UsersService'
import { deriveLegalEntity } from './selectors'
import { loadConsumption } from './ConsumptionDataService'
import { loadCoworkUsage } from './CoworkUsageService'
import { UsageReportService } from './UsageReportService'

const API_VERSION = '2024-10-01'
const PAGE_SIZE = 1000
const OWNER_BATCH_SIZE = 10

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const asBoolean = (value: unknown): boolean => value === true

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const asStringArray = (value: unknown): string[] =>
  asArray(value).flatMap((item) => {
    const text = asString(item)
    return text ? [text] : []
  })

const normalizeId = (value?: string): string =>
  (value ?? '').replace(/[{}]/g, '').trim().toLowerCase()

const mapAuth = (value?: string): AuthMode => {
  switch ((value ?? '').toLowerCase()) {
    case 'microsoft entra':
      return 'Integrated'
    case 'generic oauth 2.0':
      return 'Manual'
    case 'service principal':
      return 'ServicePrincipal'
    case 'none':
    case 'no authentication':
      return 'None'
    default:
      return 'Unknown'
  }
}

const mapEnvironmentType = (value?: string): EnvironmentType => {
  const match = ['Production', 'Sandbox', 'Developer', 'Default', 'Trial'].find(
    (candidate) => candidate.toLowerCase() === (value ?? '').toLowerCase(),
  )
  return (match as EnvironmentType | undefined) ?? 'Unknown'
}

const count = (record: Record<string, unknown>, key: string): number =>
  asNumber(record[key])

const computeHealth = (
  published: boolean,
  auth: AuthMode,
  hasOwner: boolean,
  quarantined: boolean,
): number => {
  let score = 100
  if (!published) score -= 25
  if (auth === 'None') score -= 25
  if (!hasOwner) score -= 15
  if (quarantined) score -= 40
  return Math.max(0, score)
}

interface ApiSnapshot {
  agents: Agent[]
  environments: EnvironmentInfo[]
}

async function queryAllAgents(): Promise<ResourceItem[]> {
  const rows: ResourceItem[] = []
  let skipToken: string | undefined

  do {
    const where = {
      $type: 'where',
      FieldName: 'type',
      Operator: '==',
      Values: ["'microsoft.copilotstudio/agents'"],
    } as Clause
    const body: ResourceQueryRequest = {
      TableName: 'PowerPlatformResources',
      Clauses: [where],
      Options: skipToken
        ? { Top: PAGE_SIZE, SkipToken: skipToken }
        : { Top: PAGE_SIZE, Skip: 0 },
    }
    const result = await PowerPlatformforAdminsV2Service.QueryResources(API_VERSION, body)
    if (!result.success) throw result.error ?? new Error('Power Platform inventory query failed')
    rows.push(...(result.data?.data ?? []))
    skipToken = result.data?.skipToken || undefined
  } while (skipToken)

  return rows
}

async function listEnvironments(): Promise<EnvironmentInfo[]> {
  const result = await PowerPlatformforAdminsV2Service.ListEnvironmentsForUser(
    API_VERSION,
    undefined,
    undefined,
    undefined,
    PAGE_SIZE,
    0,
    'displayName asc',
  )
  if (!result.success) throw result.error ?? new Error('Power Platform environment query failed')

  return (result.data?.value ?? [])
    .map((environment: EnvironmentResponse) => ({
      id: environment.id ?? '',
      name: environment.displayName ?? environment.id ?? '(unnamed environment)',
      region: environment.geo ?? environment.azureRegion ?? '',
      type: mapEnvironmentType(environment.type),
      url: environment.url,
    }))
    .filter((environment) => !!environment.id)
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function resolveOwners(ownerIds: string[]): Promise<Map<string, GraphUser_V1>> {
  const owners = new Map<string, GraphUser_V1>()
  for (let index = 0; index < ownerIds.length; index += OWNER_BATCH_SIZE) {
    const batch = ownerIds.slice(index, index + OWNER_BATCH_SIZE)
    const profiles = await Promise.all(
      batch.map(async (id) => {
        try {
          const result = await Office365UsersService.UserProfile_V2(
            id,
            'id,displayName,mail,userPrincipalName',
          )
          return result.success && result.data ? ([id, result.data] as const) : undefined
        } catch {
          return undefined
        }
      }),
    )
    for (const profile of profiles) {
      if (profile) owners.set(profile[0], profile[1])
    }
  }
  return owners
}

function mapAgent(
  row: ResourceItem,
  environments: Map<string, EnvironmentInfo>,
  owners: Map<string, GraphUser_V1>,
): Agent {
  const properties = asRecord(row.properties)
  const environmentId = normalizeId(asString(properties.environmentId))
  const environment = environments.get(environmentId)
  const ownerId = normalizeId(asString(properties.ownerId))
  const owner = owners.get(ownerId)
  const ownerEmail = owner?.mail || owner?.userPrincipalName
  const legalEntity = deriveLegalEntity(ownerEmail)
  const components = asRecord(properties.componentsCounts)
  const connectorCounts = asRecord(properties.capabilitiesCounts)
  const orchestration = asString(properties.orchestration) ?? ''
  const model = asString(properties.model) ?? ''
  const published = !!asString(properties.lastPublishedAt)
  const quarantined = asBoolean(properties.isQuarantined)
  const createdIn = asString(properties.createdIn) ?? ''
  const isM365 = createdIn.toLowerCase().includes('agent builder')
  const connectedAgents = count(components, 'connectedAgents')
  const toolsCount = count(components, 'tools')
  const knowledgeSourcesCount = count(components, 'knowledge')
  const topicsCount = count(components, 'topics')
  const connectorCount = count(connectorCounts, 'distinctPowerPlatformConnectors')
  const connectorOperationCount = count(
    connectorCounts,
    'distinctPowerPlatformConnectorsOperations',
  )
  const viewers = asRecord(properties.sharedWithViewers)
  const editors = asRecord(properties.sharedWithEditors)
  const triggersCount = asArray(properties.triggers).length
  const agentId = normalizeId(row.name)
  const auth = mapAuth(asString(properties.authentication))

  return {
    id: environmentId && agentId ? `${environmentId}:${agentId}` : agentId || row.id || '',
    agentId,
    name: asString(properties.displayName) ?? '(unnamed)',
    product: isM365 ? 'm365' : 'powerPlatform',
    environmentId,
    environmentName: environment?.name ?? environmentId,
    environmentType: environment?.type ?? 'Unknown',
    environmentUrl: environment?.url,
    type: isM365 ? 'Standard' : 'Custom',
    owner: owner?.displayName ?? '',
    ownerEmail,
    legalEntity: legalEntity.domain,
    legalEntityLabel: legalEntity.label,
    auth,
    published,
    createdIn,
    schemaName: asString(properties.schemaName),
    harness: asString(properties.harness),
    orchestration,
    isQuarantined: typeof properties.isQuarantined === 'boolean' ? quarantined : undefined,
    isManaged:
      typeof properties.isManaged === 'boolean' ? properties.isManaged : undefined,
    sharedWithEntireTenant: asBoolean(viewers.entireTenant),
    viewerUserCount: count(viewers, 'userCount'),
    viewerGroupCount: count(viewers, 'groupCount'),
    editorUserCount: count(editors, 'userCount'),
    editorGroupCount: count(editors, 'groupCount'),
    toolsCount,
    knowledgeSourcesCount,
    connectedAgentsCount: connectedAgents,
    topicsCount,
    connectorCount,
    connectorOperationCount,
    triggersCount,
    webSearchEnabled: asBoolean(properties.isWebSearchEnabledForKnowledge),
    createdOn: asString(properties.createdAt) ?? '',
    healthScore: computeHealth(published, auth, !!owner, quarantined),
    llmModel: model,
    channels: asStringArray(properties.channels),
    capabilities: {
      generativeAI: orchestration.toLowerCase() === 'generative',
      toolsActions:
        toolsCount > 0 ||
        count(connectorCounts, 'distinctPowerPlatformConnectorsOperations') > 0,
      knowledgeSources: knowledgeSourcesCount > 0,
      connectedAgents: connectedAgents > 0,
      webSearch: asBoolean(properties.isWebSearchEnabledForKnowledge),
      connectors: connectorCount > 0,
      deepReasoning: model.toLowerCase().includes('reasoning'),
    },
    autonomous: triggersCount > 0,
  }
}

export class ApiDataService implements IDataService {
  readonly mode = 'api' as const
  readonly getCoworkUsage = loadCoworkUsage
  private snapshot: Promise<ApiSnapshot> | null = null
  private consumptionCache: Promise<ConsumptionSnapshot> | null = null
  private usageReports = new UsageReportService()

  private load(): Promise<ApiSnapshot> {
    if (!this.snapshot) {
      this.snapshot = (async () => {
        const [rows, environments] = await Promise.all([queryAllAgents(), listEnvironments()])
        const environmentMap = new Map(
          environments.map((environment) => [normalizeId(environment.id), environment]),
        )
        const ownerIds = [
          ...new Set(
            rows
              .map((row) => normalizeId(asString(asRecord(row.properties).ownerId)))
              .filter(Boolean),
          ),
        ]
        const owners = await resolveOwners(ownerIds)
        return {
          environments,
          agents: rows.map((row) => mapAgent(row, environmentMap, owners)),
        }
      })()
    }
    return this.snapshot
  }

  async getAgents(): Promise<Agent[]> {
    return (await this.load()).agents
  }

  async getEnvironments(): Promise<EnvironmentInfo[]> {
    return (await this.load()).environments
  }

  getConsumption(): Promise<ConsumptionSnapshot> {
    return this.consumptionCache ??= loadConsumption()
  }

  getAgentUsage(query: ConsumptionQuery) {
    return this.usageReports.getReport(query)
  }

  invalidate(): void {
    this.snapshot = null
    this.consumptionCache = null
  }
}