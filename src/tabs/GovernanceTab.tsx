import type { Agent } from '../models/types'
import { KpiCard, Card } from '../components/ui'
import { DonutChart } from '../components/charts'
import { AgentsTable } from '../components/AgentsTable'
import { actionItems, matchesActionItem } from '../data/selectors'
import { formatCount, formatPercent } from '../data/formatters'

export function GovernanceTab({ agents }: { agents: Agent[] }) {
  const items = actionItems(agents)
  const byKey = Object.fromEntries(items.map((i) => [i.key, i.count]))

  const good = agents.filter((a) => a.healthScore >= 75).length
  const mid = agents.filter((a) => a.healthScore >= 50 && a.healthScore < 75).length
  const low = agents.filter((a) => a.healthScore < 50).length

  const riskyAgents = agents.filter(
    (a) =>
      matchesActionItem(a, 'noAuth') ||
      matchesActionItem(a, 'unpublished') ||
      matchesActionItem(a, 'quarantined') ||
      matchesActionItem(a, 'noOwner'),
  )

  const atRiskShare = agents.length ? riskyAgents.length / agents.length : 0

  return (
    <div className="stack">
      <div className="grid cols-4">
        <KpiCard
          label="No end-user auth"
          value={byKey.noAuth ?? 0}
          sub="Potential public exposure"
          tone="amber"
        />
        <KpiCard label="Unpublished" value={byKey.unpublished ?? 0} sub="Draft / not live" tone="amber" />
        <KpiCard label="Quarantined" value={byKey.quarantined ?? 0} sub="Blocked by governance" />
        <KpiCard label="No owner" value={byKey.noOwner ?? 0} sub="Ownership missing" />
      </div>

      <div className="grid cols-2">
        <Card title="Health distribution" sub="Composite governance score across agents">
          <DonutChart
            data={[
              { name: 'Healthy (75+)', value: good },
              { name: 'Needs attention (50–74)', value: mid },
              { name: 'At risk (<50)', value: low },
            ]}
            valueFormatter={(v) => `${formatCount(v)} agents`}
          />
        </Card>
        <Card title="Risk summary" sub="Agents that need governance review">
          <div className="grid" style={{ gap: 12 }}>
            <KpiCard
              label="Agents at risk"
              value={riskyAgents.length}
              sub={`${formatPercent(atRiskShare)} of agents in scope`}
              tone="amber"
            />
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              An agent is flagged when it has no end-user authentication, is unpublished,
              quarantined, or has no assigned owner. These signals come directly from the
              Power Platform inventory APIs.
            </p>
          </div>
        </Card>
      </div>

      <AgentsTable agents={riskyAgents} showToolbar={false} />
    </div>
  )
}
