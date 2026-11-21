import { getClient } from '@microsoft/power-apps/data'
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo'
import type { CoworkUsageDay, UsageDateRange } from '../models/types'
import { coworkDailyWindows, isUnreportedCoworkDay, normalizeCoworkQuantity } from './coworkUsage'

const client = getClient(dataSourcesInfo)
const tableName = 'zama_5fcopilotcostmanagement_5fb043a1f4407b1320'
const batchSize = 4

async function getDay(parameters: { startDate: string; endDate: string }): Promise<CoworkUsageDay> {
  const date = parameters.startDate
  try {
    const result = await client.executeAsync<typeof parameters, unknown>({
      connectorOperation: { tableName, operationName: 'GetCoworkDailyUsage', parameters },
    })
    if (result.success) return { date, status: 'reported', credits: normalizeCoworkQuantity(result.data) }
    const error = result.error
    const status = error && 'status' in error ? error.status : undefined
    if (isUnreportedCoworkDay(status, error?.message ?? '')) return { date, status: 'unreported' }
    console.error(`Cowork consumption lookup failed for ${date}.`, {
      status, requestId: error && 'requestId' in error ? error.requestId : undefined,
    })
    return { date, status: 'error', httpStatus: status }
  } catch (error) {
    console.error(`Cowork consumption lookup failed for ${date}.`, error)
    return { date, status: 'error' }
  }
}

export async function loadCoworkUsage(range: UsageDateRange, signal: AbortSignal): Promise<CoworkUsageDay[]> {
  const windows = coworkDailyWindows(range)
  const result: CoworkUsageDay[] = []
  for (let index = 0; index < windows.length; index += batchSize) {
    signal.throwIfAborted()
    const batch = await Promise.all(windows.slice(index, index + batchSize).map(getDay))
    result.push(...batch)
    const first = batch[0]
    if (first.status === 'error' && [401, 403, 429].includes(first.httpStatus ?? 0)
        && batch.every((day) => day.status === 'error' && day.httpStatus === first.httpStatus)) {
      return [
        ...result,
        ...windows.slice(index + batchSize).map(({ startDate }): CoworkUsageDay => ({
          date: startDate, status: 'notRequested',
        })),
      ]
    }
  }
  return result
}
