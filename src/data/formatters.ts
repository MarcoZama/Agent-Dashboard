export const NOT_REPORTED = 'Not reported'

const locale = 'en-US'
const count = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const credits = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 })
const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' })
const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

function formatNumber(value: number | undefined | null, formatter: Intl.NumberFormat): string {
  return typeof value === 'number' && Number.isFinite(value) ? formatter.format(value) : NOT_REPORTED
}

export const formatCount = (value?: number | null) => formatNumber(value, count)
export const formatDecimal = (value?: number | null) => formatNumber(value, decimal)
export const formatUsageCredits = (value?: number | null) => formatNumber(value, credits)
export const formatPercent = (value?: number | null) => formatNumber(value, percent)

function formatDateValue(value: string | undefined | null, withTime: boolean): string {
  if (!value) return NOT_REPORTED
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return NOT_REPORTED
  const showTime = withTime && value.includes('T')
  return (showTime ? dateTime : date).format(parsed) + (showTime ? ' UTC' : '')
}

export const formatDate = (value?: string | null) => formatDateValue(value, false)
export const formatDateTime = (value?: string | null) => formatDateValue(value, true)
export const formatBoolean = (value?: boolean | null) => value == null ? NOT_REPORTED : value ? 'Yes' : 'No'
export const formatText = (value?: string | null) => value?.trim() || NOT_REPORTED

export const formatMoney = (value: number, currency: string) =>
  formatNumber(value, new Intl.NumberFormat(locale, { style: 'currency', currency }))

const apiLabels: Readonly<Record<string, string>> = {
  prepaidcredits: 'Prepaid credits',
  payasyougo: 'Pay-as-you-go',
  copilotcredit: 'Copilot credits',
  copilotcredits: 'Copilot credits',
  withincapacity: 'Within capacity',
  coveredoverage: 'Covered overage',
  overage: 'Overage',
  notspecified: NOT_REPORTED,
  unknownfuturevalue: NOT_REPORTED,
  allusers: 'All users',
  selectedgroups: 'Selected groups',
  provisionfailed: 'Provisioning failed',
  provisioningfailed: 'Provisioning failed',
  provisioning: 'Provisioning',
  enabled: 'Enabled',
  disabled: 'Disabled',
}

export function formatApiLabel(value?: string | null): string {
  const label = value?.trim()
  if (!label) return NOT_REPORTED
  return Object.hasOwn(apiLabels, label.toLowerCase()) ? apiLabels[label.toLowerCase()] : label
}

export function formatChannel(value?: string | null): string {
  const label = value?.trim()
  switch (label?.toLowerCase()) {
    case 'pva-studio': return 'Copilot Studio'
    case 'msteams':
    case 'teams': return 'Microsoft Teams'
    case 'm365 copilot': return 'Microsoft 365 Copilot'
    default: return formatText(label)
  }
}

export function formatBillingMethods(value?: string | null): string {
  return value?.split(',').map((label) => label.trim()).filter(Boolean).map(formatApiLabel).join(' · ') || NOT_REPORTED
}

export function formatCreditLimit(value?: { value?: number; unit?: string; isUnlimited?: boolean }): string {
  if (value?.isUnlimited) return 'Unlimited'
  if (value?.value == null || !Number.isFinite(value.value)) return NOT_REPORTED
  const unit = value.unit && formatApiLabel(value.unit)
  return `${formatUsageCredits(value.value)}${unit && unit !== NOT_REPORTED ? ` ${unit}` : ''}`
}
