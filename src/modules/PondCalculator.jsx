import { useMemo, useState } from 'react'
import { Calculator, Droplets, Beaker } from 'lucide-react'
import {
  POND_DIM_UNITS, calcPondVolume, calcSaltToAdd, formatVolumeNumber, tonsToLitres,
} from '../lib/pondCalculator'
import { Card, Input, Select } from '../components/ui'

const emptyDims = () => ({ length: '', width: '', height: '', unit: 'm' })

export default function PondCalculator({ ponds = [] }) {
  const [dims, setDims] = useState(emptyDims)
  const [volumeSource, setVolumeSource] = useState('dimensions') // dimensions | manual | pond
  const [manualVolume, setManualVolume] = useState('')
  const [manualVolumeUnit, setManualVolumeUnit] = useState('litres')
  const [pondId, setPondId] = useState('')
  const [currentSalt, setCurrentSalt] = useState('')
  const [targetSalt, setTargetSalt] = useState('')

  const dimVolume = useMemo(
    () => calcPondVolume({
      length: dims.length,
      width: dims.width,
      height: dims.height,
      unit: dims.unit,
    }),
    [dims],
  )

  const selectedPond = ponds.find((p) => p.id === pondId)

  const activeVolumeLitres = useMemo(() => {
    if (volumeSource === 'pond' && selectedPond?.volume) {
      return tonsToLitres(selectedPond.volume)
    }
    if (volumeSource === 'manual') {
      const v = Number(manualVolume)
      if (!Number.isFinite(v) || v <= 0) return null
      return manualVolumeUnit === 'ton' ? v * 1000 : v
    }
    return dimVolume?.litres ?? null
  }, [volumeSource, manualVolume, manualVolumeUnit, selectedPond, dimVolume])

  const saltResult = useMemo(() => {
    if (activeVolumeLitres == null) return null
    return calcSaltToAdd({
      volumeLitres: activeVolumeLitres,
      currentSaltPct: currentSalt === '' ? 0 : currentSalt,
      targetSaltPct: targetSalt,
    })
  }, [activeVolumeLitres, currentSalt, targetSalt])

  const onPondSelect = (id) => {
    setPondId(id)
    const pond = ponds.find((p) => p.id === id)
    if (pond) {
      if (pond.lastSalt != null && pond.lastSalt !== '') setCurrentSalt(String(pond.lastSalt))
      setVolumeSource('pond')
    }
  }

  const dimFilled = [dims.length, dims.width, dims.height].every((v) => v !== '' && Number(v) > 0)

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <h3 className="text-white font-bold flex items-center gap-2 mb-1">
          <Droplets size={18} className="text-cyan-400" />
          Water Volume
        </h3>
        <p className="text-slate-400 text-xs mb-4">Length × width × height — rectangular pond or tank</p>

        <Select
          label="Dimension unit"
          value={dims.unit}
          onChange={(e) => setDims((d) => ({ ...d, unit: e.target.value }))}
          options={POND_DIM_UNITS}
          className="mb-3"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Length"
            type="number"
            min="0"
            step="any"
            value={dims.length}
            onChange={(e) => {
              setDims((d) => ({ ...d, length: e.target.value }))
              if (e.target.value) setVolumeSource('dimensions')
            }}
            placeholder={`e.g. 500 ${dims.unit}`}
          />
          <Input
            label="Width"
            type="number"
            min="0"
            step="any"
            value={dims.width}
            onChange={(e) => {
              setDims((d) => ({ ...d, width: e.target.value }))
              if (e.target.value) setVolumeSource('dimensions')
            }}
            placeholder={`e.g. 300 ${dims.unit}`}
          />
          <Input
            label="Height (depth)"
            type="number"
            min="0"
            step="any"
            value={dims.height}
            onChange={(e) => {
              setDims((d) => ({ ...d, height: e.target.value }))
              if (e.target.value) setVolumeSource('dimensions')
            }}
            placeholder={`e.g. 120 ${dims.unit}`}
          />
        </div>

        {dimFilled && dimVolume ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-3 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wide">Litres</p>
              <p className="text-cyan-300 font-black text-xl mt-1">{formatVolumeNumber(dimVolume.litres, 0)}</p>
              <p className="text-slate-500 text-xs">L</p>
            </div>
            <div className="rounded-xl bg-slate-900/60 border border-slate-600/50 p-3 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wide">Cubic metres</p>
              <p className="text-white font-black text-xl mt-1">{formatVolumeNumber(dimVolume.cubicMetres)}</p>
              <p className="text-slate-500 text-xs">m³</p>
            </div>
            <div className="rounded-xl bg-slate-900/60 border border-slate-600/50 p-3 text-center">
              <p className="text-slate-400 text-xs uppercase tracking-wide">Metric tons</p>
              <p className="text-white font-black text-xl mt-1">{formatVolumeNumber(dimVolume.metricTons)}</p>
              <p className="text-slate-500 text-xs">ton (water)</p>
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-sm mt-4">Enter length, width and depth to calculate volume.</p>
        )}

        {dimVolume?.dimensionsM && (
          <p className="text-slate-500 text-xs mt-3">
            Converted: {formatVolumeNumber(dimVolume.dimensionsM.length, 3)} m × {formatVolumeNumber(dimVolume.dimensionsM.width, 3)} m × {formatVolumeNumber(dimVolume.dimensionsM.height, 3)} m
          </p>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h3 className="text-white font-bold flex items-center gap-2 mb-1">
          <Beaker size={18} className="text-amber-400" />
          Salt Dosing
        </h3>
        <p className="text-slate-400 text-xs mb-4">
          How much salt to add to raise salinity. Levels are weight % (same as water test logs).
        </p>

        {ponds.length > 0 && (
          <Select
            label="Load from pond (optional)"
            value={pondId}
            onChange={(e) => onPondSelect(e.target.value)}
            options={[
              { value: '', label: '— None —' },
              ...ponds.map((p) => ({
                value: p.id,
                label: `${p.name}${p.volume ? ` (${p.volume} ton)` : ''}${p.lastSalt != null ? ` · salt ${p.lastSalt}%` : ''}`,
              })),
            ]}
            className="mb-3"
          />
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { id: 'dimensions', label: 'Use calculated volume' },
            { id: 'manual', label: 'Enter volume manually' },
            ...(ponds.length ? [{ id: 'pond', label: 'Use pond volume' }] : []),
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setVolumeSource(opt.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${volumeSource === opt.id ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-700 text-slate-400 border border-transparent'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {volumeSource === 'manual' && (
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Input
              label="Water volume"
              type="number"
              min="0"
              step="any"
              value={manualVolume}
              onChange={(e) => setManualVolume(e.target.value)}
              placeholder="e.g. 5000"
            />
            <Select
              label="Unit"
              value={manualVolumeUnit}
              onChange={(e) => setManualVolumeUnit(e.target.value)}
              options={[
                { value: 'litres', label: 'Litres (L)' },
                { value: 'ton', label: 'Metric tons' },
              ]}
            />
          </div>
        )}

        {activeVolumeLitres != null && (
          <p className="text-slate-400 text-xs mb-3">
            Water volume for salt calc: <span className="text-white font-semibold">{formatVolumeNumber(activeVolumeLitres, 0)} L</span>
            {' '}(≈ {formatVolumeNumber(activeVolumeLitres / 1000)} ton)
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Current salt level (%)"
            type="number"
            min="0"
            step="0.01"
            value={currentSalt}
            onChange={(e) => setCurrentSalt(e.target.value)}
            placeholder="e.g. 0.1"
          />
          <Input
            label="Target salt level (%)"
            type="number"
            min="0"
            step="0.01"
            value={targetSalt}
            onChange={(e) => setTargetSalt(e.target.value)}
            placeholder="e.g. 0.3"
          />
        </div>

        {saltResult && targetSalt !== '' && activeVolumeLitres != null ? (
          <div className="mt-4">
            {saltResult.overTarget ? (
              <p className="text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                Target ({targetSalt}%) is below current level ({currentSalt || 0}%). No salt needs to be added — consider a partial water change if you need to lower salinity.
              </p>
            ) : saltResult.alreadyAtTarget ? (
              <p className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
                Already at target level — no salt to add.
              </p>
            ) : (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
                <p className="text-amber-200 text-sm mb-2">
                  Raise from <strong>{currentSalt || 0}%</strong> → <strong>{targetSalt}%</strong>
                  {' '}(+{formatVolumeNumber(saltResult.deltaPct, 2)}%)
                </p>
                <div className="flex flex-wrap items-baseline gap-3">
                  <p className="text-white font-black text-2xl">{formatVolumeNumber(saltResult.kg, 2)}</p>
                  <span className="text-slate-400 text-sm">kg salt</span>
                  <span className="text-slate-500">·</span>
                  <p className="text-amber-300 font-bold text-lg">{formatVolumeNumber(saltResult.grams, 0)}</p>
                  <span className="text-slate-400 text-sm">grams</span>
                </div>
                <p className="text-slate-500 text-xs mt-2">
                  Dissolve in water before adding. Re-test after circulation. 1% ≈ 10 g salt per litre of water.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-slate-500 text-sm mt-4">Enter volume and target salt level to calculate dosing.</p>
        )}
      </Card>

      <Card className="p-4 border-slate-700/50 bg-slate-900/30">
        <p className="text-slate-500 text-xs flex items-start gap-2">
          <Calculator size={14} className="shrink-0 mt-0.5 text-slate-400" />
          <span>
            Volume assumes a rectangular tank. For irregular ponds, measure average depth or enter volume manually.
            Salt formula: mass (kg) = litres × (target% − current%) ÷ 100. Use aquarium or pond salt, not table salt with additives.
          </span>
        </p>
      </Card>
    </div>
  )
}
