'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import type { PriceCheck } from '@/types'
import { formatCash, formatMiles } from '@/lib/utils'

interface Props {
  history: PriceCheck[]
  type: 'cash' | 'miles'
  color?: string
}

export default function PriceSparkline({ history, type, color }: Props) {
  const data = history.map((c) => ({
    date: new Date(c.checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: type === 'cash' ? c.cash_price : c.miles_price,
  })).filter((d) => d.value !== null)

  if (data.length < 2) {
    return <div className="h-10 flex items-center text-xs text-slate-400">Not enough data yet</div>
  }

  const lineColor = color ?? (type === 'cash' ? '#0060ac' : '#00a551')

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6 }}
          formatter={(val: unknown) => {
            const n = typeof val === 'number' ? val : 0
            return type === 'cash' ? formatCash(n) : formatMiles(n)
          }}
          labelStyle={{ fontSize: 11, color: '#64748b' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
