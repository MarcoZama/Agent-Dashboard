import type { IOperationResult } from '@microsoft/power-apps/data'
import type { ApiSection, ConsumptionSnapshot } from '../models/types'
import type { TenantCreditBalance } from '../generated/models/CopilotCostManagementModel'
import { CopilotStudioCreditConsumptionService as Credits } from '../generated/services/CopilotStudioCreditConsumptionService'
import { CopilotCostManagementService as Costs } from '../generated/services/CopilotCostManagementService'
import { normalizeCapacity, normalizeLimits, normalizePolicies } from './consumption'

const ENTITLEMENT = 'MCSMessages'
const API_VERSION = '2024-10-01'

async function unwrap<T>(operation: Promise<IOperationResult<T>>): Promise<T | undefined> {
  const result = await operation
  if (!result.success) {
    const error = result.error
    throw new Error(error?.message || 'Connector request failed. Check API permissions and the connector connection.')
  }
  return result.data
}

async function section<T>(label: string, operation: () => Promise<T | undefined>): Promise<ApiSection<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const data = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('API request timed out after 60 seconds. Try refreshing.'))
        }, 60_000)
      }),
    ])
    return data === undefined
      ? { status: 'empty', message: `${label}: the API returned no data.` }
      : { status: 'ready', data }
  } catch (error) {
    const message = `${label}: ${error instanceof Error ? error.message : String(error)}`
    console.error(message)
    return { status: 'error', error: message }
  } finally {
    clearTimeout(timer)
  }
}

export async function loadConsumption(): Promise<ConsumptionSnapshot> {
  const capacity = section('Copilot Studio capacity', async () => {
    const data = await unwrap(Credits.GetCreditCapacity(ENTITLEMENT, API_VERSION))
    return data === undefined ? undefined : normalizeCapacity(data)
  })
  const limits = section('Copilot Studio agent limits', async () => {
    const data = await unwrap(Credits.ListAgentCreditLimits(ENTITLEMENT, API_VERSION))
    return data === undefined ? undefined : normalizeLimits(data)
  })
  const m365Balance = section<TenantCreditBalance>('M365 tenant credit balance', async () => {
    const data = await unwrap(Costs.GetTenantCreditBalance())
    if (data === undefined) return undefined
    if (!Array.isArray(data.billingMethodBalances)) {
      throw new Error('The API response is missing billing-method balances.')
    }
    for (const balance of data.billingMethodBalances) {
      for (const value of [balance.purchasedQuantity, balance.consumedQuantity, balance.remainingQuantity]) {
        if (value != null && (typeof value !== 'number' || !Number.isFinite(value))) {
          throw new Error('The API returned an invalid balance quantity.')
        }
      }
    }
    return data
  })
  const policies = section('M365 spending policies', async () => {
    const data = await unwrap(Costs.ListSpendingPolicies())
    return data === undefined ? undefined : normalizePolicies(data)
  })
  const [capacityResult, limitsResult, balanceResult, policiesResult] = await Promise.all([
    capacity, limits, m365Balance, policies,
  ])
  return {
    capacity: capacityResult,
    limits: limitsResult,
    m365Balance: balanceResult,
    policies: policiesResult,
    loadedAt: new Date().toISOString(),
  }
}
