import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, KpiCard } from '../components/ui'
import { dataService } from '../data/dataService'
import { coworkDailyWindows, defaultCoworkRange, summarizeCoworkUsage } from '../data/coworkUsage'
import { formatCount, formatDate, formatUsageCredits } from '../data/formatters'
import type { CoworkUsageDay, UsageDateRange } from '../models/types'

const dayLabels: Record<CoworkUsageDay['status'], string> = {
  reported: 'Reported',
  unreported: 'Not reported by Graph',
  error: 'Could not retrieve',
  notRequested: 'Not queried',
}

export function CoworkTab({ reloadKey }: { reloadKey: number }) {
  const [range, setRange] = useState(defaultCoworkRange)
  const [draft, setDraft] = useState(range)
  const [days, setDays] = useState<CoworkUsageDay[]>([])
  const [loading, setLoading] = useState(!!dataService.getCoworkUsage)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dataService.getCoworkUsage) return
    const request = new AbortController()
    setLoading(true)
    setError(null)
    setDays([])
    dataService.getCoworkUsage(range, request.signal).then((result) => {
      if (!request.signal.aborted) setDays(result)
    }).catch((reason: unknown) => {
      if (!request.signal.aborted) {
        console.error('Could not load Cowork consumption.', reason)
        setError(reason instanceof Error ? reason.message : 'Could not load Cowork consumption.')
      }
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false)
    })
    return () => request.abort()
  }, [range, reloadKey])

  const applyRange = (next: UsageDateRange) => {
    try {
      coworkDailyWindows(next)
      setRange({ ...next })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid reporting period.')
    }
  }

  const totals = summarizeCoworkUsage(days)
  const skipped = days.filter((day) => day.status === 'notRequested').length
  const forbidden = days.some((day) => day.status === 'error' && (day.httpStatus === 401 || day.httpStatus === 403))
  const throttled = days.some((day) => day.status === 'error' && day.httpStatus === 429)
  const chart = days.map((day) => ({ date: day.date, credits: day.status === 'reported' ? day.credits : null }))

  return <div className="stack">
    <Card title="Cowork consumption" sub="Tenant-wide Copilot Credits from Microsoft Graph (beta). Agent and Power Platform environment filters do not apply.">
      <form onSubmit={(event) => { event.preventDefault(); applyRange(draft) }}>
        <fieldset className="usage-fields cowork-period" disabled={loading || !dataService.getCoworkUsage}>
          <legend>Reporting period (UTC)</legend>
          <div className="usage-fields-row period-fields">
            <label className="field">From<input type="date" required value={draft.fromDate} onChange={(event) => setDraft({ ...draft, fromDate: event.target.value })} /></label>
            <label className="field">To<input type="date" required max={defaultCoworkRange().toDate} value={draft.toDate} onChange={(event) => setDraft({ ...draft, toDate: event.target.value })} /></label>
            <button type="submit" className="btn usage-apply" disabled={loading || !dataService.getCoworkUsage}>Apply period</button>
          </div>
        </fieldset>
      </form>
      <p className="usage-meta"><span><strong>Applied period:</strong> {formatDate(range.fromDate)} – {formatDate(range.toDate)} UTC</span></p>
      {!dataService.getCoworkUsage && <p className="muted">Cowork consumption requires the authenticated Power Apps player. No sample values are provided.</p>}
      {loading && <p role="status">Reading daily credit records…</p>}
      {error && <p role="alert">{error}</p>}
    </Card>

    {days.length > 0 && <Card title="Copilot Credits" sub="Only reported days contribute to the total. Missing records are not zero consumption.">
      <div className="grid cols-2">
        <KpiCard label="Credits on reported days" value={formatUsageCredits(totals.credits)} tone="teal" />
        <KpiCard label="Days reported" value={`${formatCount(totals.reported)} / ${formatCount(days.length)}`} />
      </div>
      {totals.unreported > 0 && <p role="status" className="muted">Microsoft Graph returned no Cowork usage record for {formatCount(totals.unreported)} day(s).</p>}
      {totals.failed > 0 && <p role="alert">
        Could not retrieve {formatCount(totals.failed)} day(s){skipped > 0 && `; ${formatCount(skipped)} not queried`}.
        {forbidden ? ' Check the Copilot Cost Management connection permissions.' : throttled ? ' Microsoft Graph is throttling requests. Try again later.' : ' Try refreshing.'}
      </p>}
      {totals.reported > 0 && <div className="cowork-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={28} />
            <YAxis tickFormatter={formatUsageCredits} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <Tooltip labelFormatter={(label) => formatDate(String(label))} formatter={(value) => formatUsageCredits(typeof value === 'number' ? value : undefined)} />
            <Line type="linear" dataKey="credits" name="Copilot Credits" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>}
    </Card>}

    {days.length > 0 && <Card title="Daily consumption" sub="One Microsoft Graph record per completed UTC day. Amounts are credits, not an Azure invoice.">
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th scope="col">Date (UTC)</th><th scope="col" className="num">Copilot Credits</th><th scope="col">Availability</th></tr></thead>
          <tbody>{days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{formatDate(day.date)}</th>
              <td className="num">{formatUsageCredits(day.status === 'reported' ? day.credits : undefined)}</td>
              <td>{dayLabels[day.status]}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>}
  </div>
}
