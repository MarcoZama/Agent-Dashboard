import type { Agent, EnvironmentInfo, IDataService } from '../models/types'
import { mockAgents, mockEnvironments } from './mockData'

/** In-memory data service used for local development and UI design. */
export class MockDataService implements IDataService {
  readonly mode = 'mock' as const

  async getEnvironments(): Promise<EnvironmentInfo[]> {
    return structuredClone(mockEnvironments)
  }

  async getAgents(): Promise<Agent[]> {
    return structuredClone(mockAgents)
  }
}
