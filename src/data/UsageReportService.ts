import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import type { AgentUsageReport, ApiSection, ConsumptionQuery } from '../models/types'
import { validateConsumptionQuery } from './consumption'
import { parseUsageReport } from './usageReportCsv'

const tableName = 'zama_5fcopilotstudiocreditconsumption_5fb043a1f4407b1320'
const client = getClient(dataSourcesInfo)
const apiVersion = '2024-10-01'
const fallbackInterval = 300_000
const maxWait = 25 * 60_000
const idPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i

interface ReportOperation {
  status?: string
  operationId?: string
  retryAfterSeconds?: number
  fileName?: string
}

interface ReportJob {
  operationId?: string
  pollAt?: number
  fileName?: string
  promise?: Promise<ApiSection<AgentUsageReport>>
}

function retryAt(seconds?: number) {
  return Date.now() + (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? Math.max(1_000, seconds * 1_000)
    : fallbackInterval)
}

async function execute<T>(
  operationName: 'StartAgentUsageReport' | 'CheckAgentUsageReport' | 'DownloadAgentUsageReport',
  arguments_: Record<string, unknown>,
): Promise<T> {
  const result = await client.executeAsync<Record<string, unknown>, T>({
    connectorOperation: {
      tableName,
      operationName,
      parameters: { ...arguments_, 'api-version': apiVersion },
    },
  })
  if (!result.success) throw new Error(result.error?.message ?? `${operationName} failed.`)
  if (result.data == null) throw new Error(`${operationName} returned an empty response.`)
  return result.data
}

export class UsageReportService {
  private jobs = new Map<string, ReportJob>()
  private nextSubmissionAt = 0

  getReport(query: ConsumptionQuery): Promise<ApiSection<AgentUsageReport>> {
    validateConsumptionQuery(query)
    const key = `${query.fromDate}:${query.toDate}`
    let job = this.jobs.get(key)
    if (!job) {
      job = {}
      this.jobs.set(key, job)
    }
    const current = job
    if (!current.promise) {
      current.promise = this.load(query, current).catch((error: unknown) => {
        current.promise = undefined
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Copilot Studio usage report: ${message}`)
        return { status: 'error', error: message }
      })
    }
    return current.promise
  }

  private async load(query: ConsumptionQuery, job: ReportJob): Promise<ApiSection<AgentUsageReport>> {
    const deadline = Date.now() + maxWait
    if (!job.operationId) {
      if (Date.now() < this.nextSubmissionAt) {
        throw new Error('Report submissions are paused. Wait at least five minutes after a throttled request, then refresh.')
      }
      let submitted: ReportOperation
      try {
        submitted = await execute('StartAgentUsageReport', {
          body: { startDate: query.fromDate, endDate: query.toDate, granularity: 'Summary' },
        })
      } catch (error) {
        if (error instanceof Error && /\b429\b|throttl/i.test(error.message)) {
          this.nextSubmissionAt = retryAt()
        }
        throw error
      }
      if (submitted.status !== 'Running' || !submitted.operationId || !idPattern.test(submitted.operationId)) {
        throw new Error('Power Platform did not return a valid usage report operation ID.')
      }
      job.operationId = submitted.operationId
      job.pollAt = retryAt(submitted.retryAfterSeconds)
    }

    while (!job.fileName) {
      const wait = Math.max(0, (job.pollAt ?? 0) - Date.now())
      if (Date.now() + wait >= deadline) {
        throw new Error('The report is still being generated. Refresh to resume checking the same report.')
      }
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
      job.pollAt = retryAt()
      const result = await execute<ReportOperation>('CheckAgentUsageReport', { operationId: job.operationId })
      if (result.status === 'Running') {
        job.pollAt = retryAt(result.retryAfterSeconds)
      } else if (result.status === 'Succeeded' && result.fileName && /^[\w.-]+\.csv\.gz$/i.test(result.fileName)) {
        job.fileName = result.fileName
      } else if (result.status === 'Failed') {
        job.operationId = undefined
        throw new Error('Power Platform could not generate the usage report. Refresh to request it again.')
      } else {
        throw new Error('Power Platform returned an unexpected usage report status or file name.')
      }
    }

    const { csv } = await execute<{ csv?: unknown }>('DownloadAgentUsageReport', { fileName: job.fileName })
    if (typeof csv !== 'string') throw new Error('Usage report download did not return CSV text.')
    return { status: 'ready', data: parseUsageReport(csv) }
  }
}
