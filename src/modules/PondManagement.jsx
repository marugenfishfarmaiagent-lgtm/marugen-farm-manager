import { Droplets } from 'lucide-react'
import PondCalculator from './PondCalculator'

export default function PondManagement() {
  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2"><Droplets className="text-cyan-400" />Pond Calculator</h2>
        <p className="text-slate-400 text-sm">Water volume & salt dosing calculator</p>
      </div>
      <PondCalculator />
    </div>
  )
}
