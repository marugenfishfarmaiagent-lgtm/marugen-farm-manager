import { useMemo } from 'react'
import { format } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { samePondId } from '../lib/pondOps'

function buildParamHistory(logs, pondId, limit = 30) {
  return logs
    .filter((l) => {
      if (pondId && pondId !== 'all' && !samePondId(l.pondId, pondId)) return false
      return [l.pH, l.ammonia, l.nitrite].some((v) => v !== '' && v != null)
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(-limit)
    .map((l) => ({
      date: l.date ? format(new Date(`${l.date}T12:00:00`), 'dd MMM') : '—',
      ph: l.pH !== '' && l.pH != null ? Number(l.pH) : null,
      ammonia: l.ammonia !== '' && l.ammonia != null ? Number(l.ammonia) : null,
      nitrite: l.nitrite !== '' && l.nitrite != null ? Number(l.nitrite) : null,
    }))
}

export default function PondWaterChart({ logs, pondId = 'all', pondName }) {
  const data = useMemo(() => buildParamHistory(logs, pondId), [logs, pondId])

  if (data.length === 0) {
    return (
      <p className="text-slate-500 text-sm text-center py-6">
        No water parameter readings yet — log maintenance with pH / ammonia / nitrite to see trends.
      </p>
    )
  }

  return (
    <div>
      {pondName && pondId !== 'all' && (
        <p className="text-slate-400 text-xs mb-2">Last {data.length} readings — {pondName}</p>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={32} />
          <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="ph" name="pH" stroke="#22d3ee" dot={false} connectNulls />
          <Line type="monotone" dataKey="ammonia" name="NH3" stroke="#f87171" dot={false} connectNulls />
          <Line type="monotone" dataKey="nitrite" name="NO2" stroke="#f59e0b" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
