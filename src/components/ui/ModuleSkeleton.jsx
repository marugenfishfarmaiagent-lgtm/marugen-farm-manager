import SkeletonRow from './SkeletonRow'
import { Card } from '../ui'

function SkeletonCard() {
  return (
    <Card className="p-4">
      <div className="h-4 w-24 bg-slate-700 rounded animate-pulse mb-3" />
      <div className="h-6 w-40 bg-slate-700 rounded animate-pulse mb-2" />
      <div className="h-3 w-full bg-slate-700/80 rounded animate-pulse" />
    </Card>
  )
}

function CardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array(count).fill(0).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

function TableSkeleton({ cols = 5, rows = 6 }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-slate-700/30">
              {Array(cols).fill(0).map((_, i) => (
                <th key={i} className="p-3"><div className="h-3 w-16 bg-slate-600 rounded animate-pulse" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array(rows).fill(0).map((_, i) => <SkeletonRow key={i} cols={cols} />)}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-slate-700 rounded animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array(6).fill(0).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="h-3 w-28 bg-slate-700 rounded animate-pulse mb-3" />
            <div className="h-8 w-20 bg-slate-700 rounded animate-pulse" />
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="h-4 w-32 bg-slate-700 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => <div key={i} className="h-10 bg-slate-700/60 rounded animate-pulse" />)}
        </div>
      </Card>
    </div>
  )
}

const TABLE_TABS = new Set(['inventory'])
const CARD_TABS = new Set(['koifish', 'customerkoi', 'customers', 'expenses', 'deliveries', 'ponds', 'invoices', 'calendar', 'users'])

export default function ModuleSkeleton({ tab = 'dashboard' }) {
  if (tab === 'dashboard') return <DashboardSkeleton />
  if (TABLE_TABS.has(tab)) return <TableSkeleton cols={7} />
  if (CARD_TABS.has(tab)) return <CardGridSkeleton />
  return <CardGridSkeleton count={4} />
}
