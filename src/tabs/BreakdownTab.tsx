import type { Agent } from '../models/types'
import { AgentsTable } from '../components/AgentsTable'

export function BreakdownTab({ agents }: { agents: Agent[] }) {
  return (
    <div className="stack">
      <AgentsTable agents={agents} />
    </div>
  )
}
