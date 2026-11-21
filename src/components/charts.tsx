import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCount, formatPercent } from '../data/formatters'

const CHART_COLORS = [
  '#7c8cff',
  '#c06bff',
  '#22d3ee',
  '#34d399',
  '#fcd34d',
  '#f472b6',
  '#38bdf8',
  '#fb7185',
]

export interface DonutDatum {
  name: string
  value: number
}

export function DonutChart({
  data,
  valueFormatter = formatCount,
}: {
  data: DonutDatum[]
  valueFormatter?: (v: number) => string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (data.length === 0) return <div className="empty">No data for the current selection</div>
  if (total <= 0 || data.some((item) => item.value < 0)) {
    return <div className="legend">
      {data.map((item) => <div className="legend-item" key={item.name}>
        <span>{item.name}</span><span className="legend-val">{valueFormatter(item.value)}</span>
      </div>)}
    </div>
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ width: 200, height: 200, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={56}
              outerRadius={92}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => valueFormatter(Number(value))}
              contentStyle={{
                background: '#1a2240',
                border: '1px solid #3c4a82',
                borderRadius: 10,
                color: '#eef1fc',
                fontSize: 12,
                boxShadow: '0 6px 18px rgba(5, 8, 22, 0.55)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="legend" style={{ flex: 1, minWidth: 160 }}>
        {data.map((d, i) => (
          <div className="legend-item" key={d.name}>
            <span
              className="legend-dot"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span>{d.name}</span>
            <span className="legend-val">
              {valueFormatter(d.value)} · {formatPercent(d.value / total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
