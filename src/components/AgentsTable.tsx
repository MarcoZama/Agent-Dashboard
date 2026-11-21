import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Agent } from '../models/types'
import { Badge, HealthPill } from './ui'
import { formatBoolean, formatChannel, formatCount, formatDate, formatText, NOT_REPORTED } from '../data/formatters'
import { classifyHarness, HARNESS_LABELS } from '../data/harness'

const PAGE_SIZES = [25, 50, 100, 250]

const authLabel: Record<Agent['auth'], string> = {
  Integrated: 'Microsoft Entra',
  Manual: 'Generic OAuth 2.0',
  ServicePrincipal: 'Service principal',
  None: 'No authentication',
  Unknown: NOT_REPORTED,
}

function HarnessBadge({ value }: { value?: string }) {
  const kind = classifyHarness(value)
  return <span title={kind === 'other' ? value : undefined}>
    <Badge color={kind === 'github' ? 'violet' : 'neutral'}>{HARNESS_LABELS[kind]}</Badge>
  </span>
}

const environmentLabel = (agent: Agent) =>
  agent.environmentType === 'Unknown'
    ? formatText(agent.environmentName)
    : `${formatText(agent.environmentName)} · ${agent.environmentType}`

function Detail({ agent }: { agent: Agent }) {
  const caps = [
    agent.capabilities.generativeAI && 'Generative orchestration',
    agent.capabilities.toolsActions && 'Tools / actions',
    agent.capabilities.knowledgeSources && 'Knowledge sources',
    agent.connectedAgentsCount && 'Connected agents',
    agent.webSearchEnabled && 'Web search',
    agent.connectorCount && 'Power Platform connectors',
    agent.capabilities.deepReasoning && 'Reasoning model',
  ].filter((label): label is string => !!label)
  const inventoryCounts = [
    { label: 'Topics', value: agent.topicsCount ?? 0 },
    { label: 'Tools', value: agent.toolsCount ?? 0 },
    { label: 'Knowledge sources', value: agent.knowledgeSourcesCount ?? 0 },
    { label: 'Connected agents', value: agent.connectedAgentsCount ?? 0 },
    { label: 'Connectors', value: agent.connectorCount ?? 0 },
    { label: 'Connector operations', value: agent.connectorOperationCount ?? 0 },
    { label: 'Triggers', value: agent.triggersCount ?? 0 },
  ].filter((item) => item.value > 0)
  const maxCount = Math.max(1, ...inventoryCounts.map((item) => item.value))
  const viewers = (agent.viewerUserCount ?? 0) + (agent.viewerGroupCount ?? 0)
  const editors = (agent.editorUserCount ?? 0) + (agent.editorGroupCount ?? 0)

  const pairs: { label: string; value: ReactNode }[] = [
    { label: 'Product', value: agent.product === 'm365' ? 'M365 Copilot' : 'Power Platform' },
    { label: 'Agent type', value: agent.type },
    { label: 'Agent ID', value: formatText(agent.agentId || agent.id) },
    { label: 'Schema name', value: formatText(agent.schemaName) },
    { label: 'Created in', value: formatText(agent.createdIn) },
    { label: 'Agent harness', value: <HarnessBadge value={agent.harness} /> },
    { label: 'Environment', value: environmentLabel(agent) },
    { label: 'Environment URL', value: formatText(agent.environmentUrl) },
    { label: 'Owner', value: formatText(agent.owner) },
    { label: 'Owner email', value: formatText(agent.ownerEmail) },
    { label: 'Legal entity', value: agent.legalEntity === '(unassigned)' ? agent.legalEntityLabel : `${agent.legalEntityLabel} (${agent.legalEntity})` },
    { label: 'Auth mode', value: authLabel[agent.auth] },
    { label: 'Published', value: formatBoolean(agent.published) },
    { label: 'Quarantined', value: formatBoolean(agent.isQuarantined) },
    { label: 'Managed solution', value: formatBoolean(agent.isManaged) },
    { label: 'Orchestration', value: formatText(agent.orchestration) },
    { label: 'Trigger based', value: formatBoolean(agent.autonomous) },
    { label: 'Created on (UTC)', value: formatDate(agent.createdOn) },
    { label: 'Health score', value: `${formatCount(agent.healthScore)} / 100` },
    { label: 'LLM model', value: formatText(agent.llmModel) },
    { label: 'Channels', value: formatText([...new Set(agent.channels.map(formatChannel))].join(', ')) },
    {
      label: 'Shared with',
      value: agent.sharedWithEntireTenant
        ? 'Entire tenant'
        : [agent.viewerUserCount, agent.viewerGroupCount, agent.editorUserCount, agent.editorGroupCount].every((count) => count == null)
          ? NOT_REPORTED
          : `${formatCount(viewers)} viewer assignments · ${formatCount(editors)} editor assignments`,
    },
  ]

  return (
    <div className="agent-detail">
      <div className="detail-grid">
        {pairs.map((p) => (
          <div className="detail-pair" key={p.label}>
            <span className="detail-label">{p.label}</span>
            <span className="detail-value">{p.value}</span>
          </div>
        ))}
      </div>

      <div className="detail-cols">
        <div>
          <div className="detail-subtitle">Capabilities</div>
          <div className="chips">
            {caps.length === 0 && <span className="muted">None</span>}
            {caps.map((label) => (
              <span className="chip static" key={label}>
                {label}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="detail-subtitle">Configured components</div>
          {inventoryCounts.length === 0 && <span className="muted">No components reported</span>}
          <div className="meter-list">
            {inventoryCounts.map((item) => (
              <div className="meter-row" key={item.label}>
                <span className="meter-label">{item.label}</span>
                <span className="meter-bar">
                  <span style={{ width: `${(item.value / maxCount) * 100}%` }} />
                </span>
                <span className="meter-val">{formatCount(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgentsTable({
  agents,
  showToolbar = true,
}: {
  agents: Agent[]
  showToolbar?: boolean
}) {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<string>('all')
  const [genAi, setGenAi] = useState<string>('any')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])

  const rows = useMemo(() => {
    return agents.filter((a) => {
      if (type !== 'all' && a.type !== type) return false
      if (genAi === 'yes' && !a.capabilities.generativeAI) return false
      if (genAi === 'no' && a.capabilities.generativeAI) return false
      if (search) {
        const q = search.trim().toLowerCase()
        const hay = `${a.name} ${a.owner} ${a.environmentName} ${a.legalEntityLabel} ${HARNESS_LABELS[classifyHarness(a.harness)]}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [agents, search, type, genAi])

  // Reset to the first page whenever the filtered result set changes.
  useEffect(() => {
    setPage(0)
  }, [search, type, genAi, pageSize, agents])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * pageSize
  const pageRows = rows.slice(start, start + pageSize)

  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id))

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Agents ({formatCount(rows.length)})</div>
        {showToolbar && (
          <div className="table-toolbar">
            <select aria-label="Agent type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All agent types</option>
              <option value="Custom">Custom</option>
              <option value="Standard">Standard</option>
              <option value="Template">Template</option>
            </select>
            <select aria-label="Generative AI" value={genAi} onChange={(e) => setGenAi(e.target.value)}>
              <option value="any">Gen AI: any</option>
              <option value="yes">Gen AI: yes</option>
              <option value="no">Gen AI: no</option>
            </select>
            <input
              type="search"
              aria-label="Search agents"
              placeholder="Search by agent, environment, owner or harness"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="chevron-col" />
              <th>Agent</th>
              <th>Legal entity</th>
              <th>Environment</th>
              <th>Agent harness</th>
              <th>Owner</th>
              <th>Auth</th>
              <th>Published</th>
              <th>Quarantined</th>
              <th>Model</th>
              <th className="num">Health</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a) => {
              const open = expanded === a.id
              return (
                <Fragment key={a.id}>
                  <tr
                    className={`expandable ${open ? 'open' : ''}`}
                    onClick={() => toggle(a.id)}
                  >
                    <td className="chevron-col">
                      <span className={`chevron ${open ? 'open' : ''}`}>›</span>
                    </td>
                    <td className="agent-name">{a.name}</td>
                    <td>
                      {a.legalEntity === '(unassigned)' ? (
                        <span className="muted">{a.legalEntityLabel}</span>
                      ) : (
                        <Badge color="neutral">{a.legalEntityLabel}</Badge>
                      )}
                    </td>
                    <td>{formatText(a.environmentName)}</td>
                    <td><HarnessBadge value={a.harness} /></td>
                    <td>{formatText(a.owner)}</td>
                    <td>
                      <Badge color={a.auth === 'None' ? 'red' : 'neutral'}>{authLabel[a.auth]}</Badge>
                    </td>
                    <td>
                      {a.published ? (
                        <Badge color="green">Yes</Badge>
                      ) : (
                        <Badge color="amber">No</Badge>
                      )}
                    </td>
                    <td>
                      <Badge color={a.isQuarantined == null ? 'neutral' : a.isQuarantined ? 'red' : 'green'}>{formatBoolean(a.isQuarantined)}</Badge>
                    </td>
                    <td>{formatText(a.llmModel)}</td>
                    <td className="num">
                      <HealthPill score={a.healthScore} />
                    </td>
                  </tr>
                  {open && (
                    <tr className="detail-row">
                      <td colSpan={11}>
                        <Detail agent={a} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="empty">
                  No agents match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {formatCount(start + 1)}–{formatCount(Math.min(start + pageSize, rows.length))} of{' '}
            {formatCount(rows.length)}
          </div>
          <div className="pagination-ctrls">
            <label className="page-size">
              Rows
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="page-nav">
              <button
                className="btn ghost"
                disabled={safePage === 0}
                onClick={() => setPage(0)}
                title="First page"
              >
                «
              </button>
              <button
                className="btn ghost"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ‹ Prev
              </button>
              <span className="page-current">
                Page {formatCount(safePage + 1)} / {formatCount(totalPages)}
              </span>
              <button
                className="btn ghost"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next ›
              </button>
              <button
                className="btn ghost"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
