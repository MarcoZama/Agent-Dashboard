import type { CoworkUsageDay, UsageDateRange } from '../models/types'

const dayMs = 86_400_000
export const MAX_COWORK_DAYS = 31

const dateString = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10)

export function defaultCoworkRange(now = new Date()): UsageDateRange {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return { fromDate: dateString(today - 7 * dayMs), toDate: dateString(today - dayMs) }
}

function parseDay(value: string): number {
  const timestamp = Date.parse(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(timestamp) || dateString(timestamp) !== value) {
    throw new Error('Enter valid UTC dates.')
  }
  return timestamp
}

export function coworkDailyWindows(range: UsageDateRange, now = new Date()) {
  const start = parseDay(range.fromDate)
  const last = parseDay(range.toDate)
  if (last < start) throw new Error('The end date must be on or after the start date.')
  if (range.toDate > defaultCoworkRange(now).toDate) throw new Error('Select completed UTC days only, through yesterday.')
  const length = (last - start) / dayMs + 1
  if (length > MAX_COWORK_DAYS) throw new Error(`Select at most ${MAX_COWORK_DAYS} days.`)
  return Array.from({ length }, (_, index) => ({
    startDate: dateString(start + index * dayMs),
    endDate: dateString(start + (index + 1) * dayMs),
  }))
}

export function normalizeCoworkQuantity(value: unknown): number {
  const record = value && typeof value === 'object' ? value : {}
  if (!('serviceId' in record) || record.serviceId !== 'cowork'
      || !('unit' in record) || record.unit !== 'copilotCredit'
      || !('consumedQuantity' in record) || typeof record.consumedQuantity !== 'number'
      || !Number.isFinite(record.consumedQuantity)) {
    throw new Error('Graph did not return a valid Cowork Copilot Credits record.')
  }
  return record.consumedQuantity
}

export function isUnreportedCoworkDay(status: number | undefined, message: string): boolean {
  return (status === 404 || status === undefined) &&
    /usageDataUnavailable|no represented usage/i.test(message)
}

export function summarizeCoworkUsage(days: CoworkUsageDay[]) {
  const reported = days.filter((day) => day.status === 'reported')
  return {
    credits: reported.length ? reported.reduce((sum, day) => sum + day.credits, 0) : undefined,
    reported: reported.length,
    unreported: days.filter((day) => day.status === 'unreported').length,
    failed: days.filter((day) => day.status === 'error').length,
  }
}
