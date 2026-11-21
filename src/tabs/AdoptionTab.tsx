import type { Agent } from '../models/types'
import { KpiCard, Card, BarList } from '../components/ui'
import { DonutChart } from '../components/charts'
import { formatChannel, formatCount, formatDecimal, formatPercent, formatText } from '../data/formatters'

const countBy = (agents: Agent[], values: (agent: Agent) => string[]) => {
  const counts = new Map<string, number>()
  for (const agent of agents) {
    for (const name of values(agent)) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

export function AdoptionTab({ agents }: { agents: Agent[] }) {
  const total = agents.length || 1
  const caps = [
    { label: 'Generative orchestration', count: agents.filter((a) => a.capabilities.generativeAI).length },
    { label: 'Tools / actions', count: agents.filter((a) => (a.toolsCount ?? 0) > 0).length },
    { label: 'Knowledge sources', count: agents.filter((a) => (a.knowledgeSourcesCount ?? 0) > 0).length },
    { label: 'Connected agents', count: agents.filter((a) => (a.connectedAgentsCount ?? 0) > 0).length },
    { label: 'Web search', count: agents.filter((a) => a.webSearchEnabled).length },
    { label: 'Power Platform connectors', count: agents.filter((a) => (a.connectorCount ?? 0) > 0).length },
    { label: 'Reasoning models', count: agents.filter((a) => a.capabilities.deepReasoning).length },
  ].map((item) => ({ ...item, share: item.count / total })).sort((a, b) => b.share - a.share)
  const models = countBy(agents, (agent) => [formatText(agent.llmModel)])
  const channels = countBy(agents, (agent) => [...new Set(agent.channels.map(formatChannel))])
  const genAi = caps.find((item) => item.label === 'Generative orchestration')
  const avgCapabilities = agents.length
    ? caps.reduce((sum, capability) => sum + capability.count, 0) / agents.length
    : 0

  return (
    <div className="stack">
      <div className="grid cols-5">
        <KpiCard label="Agents in scope" value={agents.length} sub="across all environments" />
        <KpiCard
          label="Gen AI adoption"
          value={formatPercent(genAi?.share)}
          sub={`${formatCount(genAi?.count)} agents`}
          tone="teal"
        />
        <KpiCard
          label="Avg capabilities / agent"
          value={formatDecimal(avgCapabilities)}
          sub="of 7 tracked"
          tone="green"
        />
        <KpiCard label="With tools" value={agents.filter((a) => (a.toolsCount ?? 0) > 0).length} sub="configured tool components" />
        <KpiCard
          label="With knowledge"
          value={agents.filter((a) => (a.knowledgeSourcesCount ?? 0) > 0).length}
          sub="configured knowledge sources"
          tone="amber"
        />
      </div>

      <Card
        title="Gen AI capability adoption — % of agents"
        sub="Share of agents in scope that have each capability enabled. Sorted from most to least adopted."
      >
        <BarList
          items={caps.map((c) => ({
            label: c.label,
            share: c.share,
            value: `${formatPercent(c.share)} · ${formatCount(c.count)}`,
          }))}
        />
      </Card>

      <div className="grid cols-2">
        <Card title="Distribution by LLM model" sub="Agents using each model">
          <DonutChart
            data={models}
            valueFormatter={(value) => `${formatCount(value)} agents`}
          />
        </Card>
        <Card title="Distribution by channel" sub="Published channel configuration">
          <DonutChart
            data={channels}
            valueFormatter={(value) => `${formatCount(value)} agents`}
          />
        </Card>
      </div>
    </div>
  )
}
