import type { IDataService } from '../models/types'
import { MockDataService } from './MockDataService'
import { ApiDataService } from './ApiDataService'

// Real API data is the default. Mock data must be requested explicitly for
// standalone UI development with VITE_DATA_SOURCE=mock.
const source = import.meta.env.VITE_DATA_SOURCE

export const dataService: IDataService =
  source === 'mock' ? new MockDataService() : new ApiDataService()
