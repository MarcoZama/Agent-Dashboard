import type { Agent } from '../models/types'
import { KpiCard, Card, BarList } from '../components/ui'
import { DonutChart } from '../components/charts'
import { AgentsTable } from '../components/AgentsTable'
import { computeKpis } from '../data/selectors'
import { formatCount, formatDecimal, formatPercent, formatText } from '../data/formatters'
import { classifyHarness, HARNESS_LABELS } from '../data/harness'

const countBy = (agents: Agent[], key: (agent: Agent) => string) => {
  const counts = new Map<string, number>()
  for (const agent of agents) {
    const name = formatText(key(agent))
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function OverviewTab({ agents }: { agents: Agent[] }) {
  const k = computeKpis(agents)
  const envData = countBy(agents, (agent) => agent.environmentName)
  const modelData = countBy(agents, (agent) => agent.llmModel)
  const entityData = countBy(agents, (agent) => agent.legalEntityLabel)
  const harnessData = countBy(agents, (agent) => HARNESS_LABELS[classifyHarness(agent.harness)])

  return (
    <div className="stack">
      <div className="grid cols-5">
        <KpiCard label="Agents in scope" value={k.agentsInScope} sub="across environments" />
        <KpiCard
          label="Published"
          value={formatPercent(k.publishedShare)}
          sub={`${formatCount(agents.filter((agent) => agent.published).length)} live agents`}
          tone="green"
        />
        <KpiCard
          label="Environments"
          value={new Set(agents.map((agent) => agent.environmentId)).size}
          sub="hosting agents"
          tone="teal"
        />
        <KpiCard
          label="Distinct owners"
          value={k.distinctOwners}
          sub={`${formatDecimal(k.avgAgentsPerOwner)} agents each on average`}
          tone="amber"
        />
        <KpiCard
          label="Quarantined"
          value={agents.filter((agent) => agent.isQuarantined).length}
          sub="blocked by governance"
          tone="violet"
        />
      </div>

      <div className="grid cols-2">
        <Card title="Agents by environment" sub="Tenant-wide Power Platform inventory">
          <BarList
            items={envData.map((item) => ({
              label: item.name,
              share: item.value / agents.length,
              value: `${formatCount(item.value)} · ${formatPercent(item.value / agents.length)}`,
            }))}
          />
        </Card>
        <Card title="Agents by model" sub="Models reported by inventory">
          <DonutChart
            data={modelData}
            valueFormatter={(value) => `${formatCount(value)} agents`}
          />
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Agents by legal entity" sub="Grouped by owner email domain">
          <BarList
            items={entityData.map((item) => ({
              label: item.name,
              share: item.value / agents.length,
              value: `${formatCount(item.value)} · ${formatPercent(item.value / agents.length)}`,
            }))}
          />
        </Card>
        <Card title="Agents by harness" sub="Runtime harness distribution">
          <DonutChart
            data={harnessData}
            valueFormatter={(value) => `${formatCount(value)} agents`}
          />
        </Card>
      </div>

      <AgentsTable agents={agents} />
    </div>
  )
}
