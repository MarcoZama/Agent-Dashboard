import type { AgentUsageReport } from '../models/types'

function* csvRows(csv: string): Generator<string[], void> {
  let row: string[] = []
  let field = ''
  let quoted = false
  let closed = false
  for (let i = csv.charCodeAt(0) === 0xfeff ? 1 : 0; i < csv.length; i++) {
    const ch = csv[i]
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') { quoted = false; closed = true }
      else field += ch
    } else if (ch === ',') {
      row.push(field)
      field = ''
      closed = false
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csv[i + 1] === '\n') i++
      if (row.length || field.length || closed) yield [...row, field]
      row = []
      field = ''
      closed = false
    } else if (ch === '"' && !field && !closed) {
      quoted = true
    } else {
      if (closed || ch === '"') throw new Error('Usage report has invalid CSV quoting.')
      field += ch
    }
  }
  if (quoted) throw new Error('Usage report has an unterminated CSV field.')
  if (row.length || field.length || closed) yield [...row, field]
}

export function parseUsageReport(csv: string): AgentUsageReport {
  const records = csvRows(csv)
  const header = records.next().value
  if (!header || new Set(header).size !== header.length) throw new Error('Usage report has an invalid header.')
  const columns = new Map(header.map((name, i) => [name, i]))
  for (const name of ['ResourceID', 'EnvironmentID', 'BilledCredits', 'NonBilledCredits']) {
    if (!columns.has(name)) throw new Error(`Usage report is missing ${name}.`)
  }
  const rows: AgentUsageReport['rows'] = []
  let unattributed = 0
  for (const record of records) {
    if (record.length !== header.length) throw new Error('Usage report contains a row with the wrong number of columns.')
    const text = (name: string) => record[columns.get(name) ?? -1]?.trim() || undefined
    const credits = (name: string) => {
      const value = text(name)
      const amount = Number(value)
      if (!value || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(amount)) {
        throw new Error(`Usage report contains invalid ${name}.`)
      }
      return amount
    }
    const agentId = text('ResourceID')
    const environmentId = text('EnvironmentID')
    if (!agentId || !environmentId) {
      unattributed++
      continue
    }
    rows.push({
      agentId,
      environmentId,
      agentName: text('ResourceName'),
      environmentName: text('EnvironmentName'),
      billedCredits: credits('BilledCredits'),
      nonBilledCredits: credits('NonBilledCredits'),
      product: text('Product'),
      reportHarness: text('HarnessType'),
      channel: text('Channel'),
      feature: text('Feature'),
      tool: text('ToolUsed'),
      llmModel: text('LLMModel'),
      knowledgeSources: text('KnowledgeSources'),
    })
  }
  if (unattributed && !rows.length) throw new Error('No report rows have both an environment and an agent ID.')
  return { rows, unattributed }
}
