'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { PriceCheck } from '@/types'
import { formatCash, formatMiles } from '@/lib/utils'

interface Props {
  history: PriceCheck[]
}

export default function PriceHistoryChart({ history }: Props) {
  const data = history.map((c) => ({
    date: new Date(c.checked_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    cash: c.cash_price,
    miles: c.miles_price,
  }))

  const hasCash = data.some((d) => d.cash !== null)
  const hasMiles = data.some((d) => d.miles !== null)

  if (!hasCash && !hasMiles) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
        No price history yet — check back after the first cron run
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        {hasCash && (
          <YAxis
            yAxisId="cash"
            orientation="left"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
            width={44}
          />
        )}
        {hasMiles && (
          <YAxis
            yAxisId="miles"
            orientation="right"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            width={36}
          />
        )}
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(val: number, name: string) =>
            name === 'Cash' ? [formatCash(val), 'Cash'] : [formatMiles(val), 'Miles']
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {hasCash && (
          <Line
            yAxisId="cash"
            type="monotone"
            dataKey="cash"
            name="Cash"
            stroke="#0060ac"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        )}
        {hasMiles && (
          <Line
            yAxisId="miles"
            type="monotone"
            dataKey="miles"
            name="Miles"
            stroke="#00a551"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
