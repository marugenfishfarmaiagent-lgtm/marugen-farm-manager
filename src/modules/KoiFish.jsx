import { useMemo, useState } from 'react'
import {
  Fish, Plus, Search, MapPin, Edit2, Eye, ShoppingBag, ImagePlus, Truck, HeartPulse, RotateCcw,
} from 'lucide-react'
import {
  KOI_VARIETIES, KOI_STATUS, FARM_POND_NAMES, mergePondNames,
  formatSGD, formatKoiSize, normalizeKoiSizeCm, genId, today,
} from '../data/constants'
import { Badge, Btn, Card, Input, Modal, PondNameInput, Select, Textarea } from '../components/ui'
import Fab from '../components/Fab'
import { readKoiImageFile } from '../lib/koiImage'

const STATUS_STYLE = {
  available: { badge: 'bg-emerald-500/20 text-emerald-300', border: 'border-slate-700/50' },
  sold: { badge: 'bg-blue-500/20 text-blue-300', border: 'border-slate-700/50 opacity-60' },
  sick: { badge: 'bg-red-500/20 text-red-300', border: 'border-amber-500/40' },
}

const KOI_STATUS_OPTIONS = [
  { value: KOI_STATUS.AVAILABLE, label: 'Available' },
  { value: KOI_STATUS.SICK, label: 'Sick' },
  { value: KOI_STATUS.SOLD, label: 'Sold' },
]

const STOCK_STATUSES = [KOI_STATUS.AVAILABLE, KOI_STATUS.SICK]

const emptyKoiForm = () => ({
  photo: null, name: '', variety: KOI_VARIETIES[0], size: '',
  pondName: 'A1', price: '', notes: '',
})

function PhotoPicker({ photo, onPick, label = 'Photo' }) {
  const pick = async (file) => {
    if (!file) return
    try {
      const dataUrl = await readKoiImageFile(file)
      onPick(dataUrl)
    } catch (err) {
      alert(err.message)
    }
  }
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}</p>
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-600 hover:border-cyan-500/50 p-3 text-center transition-colors">
        <div className="w-full max-w-xs mx-auto aspect-square bg-slate-900 rounded-lg flex items-center justify-center overflow-hidden">
          {photo ? (
            <img src={photo} alt="Preview" className="w-full h-full object-contain" />
          ) : (
            <div className="py-8 text-slate-500">
              <ImagePlus size={32} className="mx-auto mb-2 text-cyan-400" />
              <p className="text-sm">Click to upload (max 2MB)</p>
            </div>
          )}
        </div>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
    </div>
  )
}

function KoiPhoto({ src, alt, className = '' }) {
  if (!src) return null
  return (
    <div className={`bg-slate-900 flex items-center justify-center overflow-hidden ${className}`}>
      <img src={src} alt={alt} className="w-full h-full object-contain" />
    </div>
  )
}

export default function KoiFish({
  koiList, setKoiList, customers, onKoiSold, addNotification,
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [varietyFilter, setVarietyFilter] = useState('all')
  const [pondFilter, setPondFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyKoiForm())
  const [editKoi, setEditKoi] = useState(null)
  const [viewKoi, setViewKoi] = useState(null)
  const [sellKoi, setSellKoi] = useState(null)
  const [shipKoi, setShipKoi] = useState(null)
  const [shipToPond, setShipToPond] = useState('')
  const [sellForm, setSellForm] = useState({
    customerId: '', soldPrice: '', soldDate: today(), disposition: 'taken', keepPondName: '',
  })

  const pondNames = useMemo(
    () => mergePondNames(FARM_POND_NAMES, koiList.map((k) => k.pondName)),
    [koiList],
  )

  const filtered = koiList.filter((k) => {
    const q = search.toLowerCase()
    const matchSearch = !q || [k.name, k.variety, k.pondName, k.id].some((x) => String(x || '').toLowerCase().includes(q))
    const matchStatus = statusFilter === 'all' || k.status === statusFilter
    const matchVariety = varietyFilter === 'all' || k.variety === varietyFilter
    const matchPond = pondFilter === 'all' || k.pondName === pondFilter
    return matchSearch && matchStatus && matchVariety && matchPond
  })

  const counts = useMemo(() => ({
    available: koiList.filter((k) => k.status === KOI_STATUS.AVAILABLE).length,
    sold: koiList.filter((k) => k.status === KOI_STATUS.SOLD).length,
    sick: koiList.filter((k) => k.status === KOI_STATUS.SICK).length,
  }), [koiList])

  const soldFish = koiList.filter((k) => k.status === KOI_STATUS.SOLD)
  const recentSold = [...soldFish].sort((a, b) => (b.soldDate || '').localeCompare(a.soldDate || '')).slice(0, 5)

  const parseOptionalSize = (value) => {
    if (value == null || value === '') return null
    const sizeCm = normalizeKoiSizeCm(value)
    if (sizeCm == null) {
      addNotification({ type: 'error', title: 'Invalid Size', message: 'Enter a valid size in cm, or leave blank.' })
      return undefined
    }
    return sizeCm
  }

  const addKoi = () => {
    if (!form.variety || form.price === '') {
      addNotification({ type: 'error', title: 'Missing Fields', message: 'Enter variety, price, and pond.' })
      return
    }
    const sizeCm = parseOptionalSize(form.size)
    if (sizeCm === undefined) return
    if (!form.pondName?.trim()) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Select or enter a pond name.' })
      return
    }
    if (+form.price < 0) {
      addNotification({ type: 'error', title: 'Invalid Price', message: 'Selling price cannot be negative.' })
      return
    }
    const koi = {
      ...form,
      id: genId('KOI'),
      name: form.name?.trim() || '',
      pondName: form.pondName.trim(),
      size: sizeCm,
      price: +form.price,
      dateAdded: today(),
      status: KOI_STATUS.AVAILABLE,
      soldTo: null, soldDate: null, soldPrice: null,
      sellDisposition: null, keepPondName: null,
      deathDate: null, deathCause: null, deathPhoto: null,
    }
    setKoiList((prev) => [...prev, koi])
    addNotification({ type: 'success', title: 'Koi Added', message: `${koi.variety} added to ${koi.pondName}` })
    setShowAdd(false)
    setForm(emptyKoiForm())
  }

  const saveEdit = () => {
    if (!editKoi) return
    const sizeCm = parseOptionalSize(editKoi.size)
    if (sizeCm === undefined) return
    if (!editKoi.pondName?.trim()) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Select or enter a pond name.' })
      return
    }
    let updated = {
      ...editKoi,
      name: editKoi.name?.trim() || '',
      pondName: editKoi.pondName.trim(),
      size: sizeCm,
      price: +editKoi.price || 0,
    }
    if (updated.status !== KOI_STATUS.SOLD) {
      updated = {
        ...updated,
        soldTo: null,
        soldDate: null,
        soldPrice: null,
        sellDisposition: null,
        keepPondName: null,
      }
    }
    setKoiList((prev) => prev.map((k) => (k.id === editKoi.id ? updated : k)))
    addNotification({ type: 'success', title: 'Updated', message: `${editKoi.id} saved` })
    setEditKoi(null)
  }

  const setKoiStatus = (koi, status) => {
    setKoiList((prev) => prev.map((k) => (k.id === koi.id ? { ...k, status } : k)))
    if (status === KOI_STATUS.SICK) {
      addNotification({ type: 'warning', title: 'Marked Sick', message: `${koi.name || koi.variety} moved to sick list — use Ship to quarantine if needed.` })
    } else if (status === KOI_STATUS.AVAILABLE) {
      addNotification({ type: 'success', title: 'Recovered', message: `${koi.name || koi.variety} marked available again.` })
    }
  }

  const openShip = (koi) => {
    setShipKoi(koi)
    setShipToPond(pondNames.find((p) => p !== koi.pondName) || '')
  }

  const confirmShip = () => {
    if (!shipKoi) return
    const to = shipToPond?.trim()
    if (!to) {
      addNotification({ type: 'error', title: 'Destination Required', message: 'Select the pond to move this fish to.' })
      return
    }
    if (to === shipKoi.pondName) {
      addNotification({ type: 'error', title: 'Same Pond', message: 'Choose a different pond from the current one.' })
      return
    }
    const from = shipKoi.pondName
    setKoiList((prev) => prev.map((k) => (k.id === shipKoi.id ? { ...k, pondName: to } : k)))
    addNotification({ type: 'success', title: 'Pond Transfer', message: `${shipKoi.name || shipKoi.variety} moved ${from} → ${to}` })
    setShipKoi(null)
    setShipToPond('')
  }

  const confirmSell = () => {
    if (!sellKoi || !sellForm.customerId) {
      addNotification({ type: 'error', title: 'Customer Required', message: 'Select a customer to complete the sale.' })
      return
    }
    const customer = customers.find((c) => String(c.id) === String(sellForm.customerId))
    if (!customer) {
      addNotification({ type: 'error', title: 'Customer Not Found', message: 'Selected customer is no longer in the list.' })
      return
    }
    if (sellForm.disposition === 'keep' && !sellForm.keepPondName?.trim()) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Select which pond the koi will be kept in.' })
      return
    }
    const soldPrice = +sellForm.soldPrice || sellKoi.price
    const soldDate = sellForm.soldDate || today()
    const keepPondName = sellForm.keepPondName?.trim() || ''
    setKoiList((prev) => prev.map((k) => (k.id === sellKoi.id ? {
      ...k,
      status: KOI_STATUS.SOLD,
      soldTo: sellForm.customerId,
      soldPrice,
      soldDate,
      sellDisposition: sellForm.disposition,
      keepPondName: sellForm.disposition === 'keep' ? keepPondName : null,
    } : k)))
    onKoiSold?.(sellKoi, customer, soldPrice, soldDate, {
      disposition: sellForm.disposition,
      keepPondName,
    })
    const dispositionNote = sellForm.disposition === 'keep'
      ? `kept at ${keepPondName} — added to Customer Koi`
      : 'taken away by customer'
    addNotification({
      type: 'success',
      title: 'Koi Sold',
      message: `${sellKoi.id} sold to ${customer?.name || 'customer'} for ${formatSGD(soldPrice)} (${dispositionNote})`,
    })
    setSellKoi(null)
  }

  const customerName = (id) => customers.find((c) => String(c.id) === String(id))?.name || '—'
  const fabHidden = showAdd || !!editKoi || !!viewKoi || !!sellKoi || !!shipKoi

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          <Fish className="text-cyan-400" />Koi Fish Inventory
          <Badge className="bg-cyan-500/20 text-cyan-300">{koiList.length}</Badge>
        </h2>
        <p className="text-slate-400 text-sm">Farm stock · pond transfers · sales</p>
      </div>
      <Fab onClick={() => { setForm(emptyKoiForm()); setShowAdd(true) }} label="Add Koi" hidden={fabHidden} />

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ['available', counts.available, 'text-emerald-400'],
          ['sold', counts.sold, 'text-blue-400'],
          ['sick', counts.sick, 'text-red-400'],
        ].map(([label, n, color]) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(label)}
            className={`px-3 py-2 rounded-xl border flex items-center gap-2 transition-colors touch-manipulation ${statusFilter === label ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-800'}`}
          >
            <span className="text-slate-500 capitalize text-xs">{label}</span>
            <span className={`font-black ${color}`}>{n}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, variety, pond..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
        </div>
        <Select label="" value={varietyFilter} onChange={(e) => setVarietyFilter(e.target.value)}
          options={[{ value: 'all', label: 'All varieties' }, ...KOI_VARIETIES.map((v) => ({ value: v, label: v }))]} />
        <Select label="" value={pondFilter} onChange={(e) => setPondFilter(e.target.value)}
          options={[{ value: 'all', label: 'All ponds' }, ...pondNames.map((p) => ({ value: p, label: p }))]} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'available', 'sold', 'sick'].map((s) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={`px-3 py-2 rounded-lg text-xs font-bold capitalize shrink-0 ${statusFilter === s ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>{s}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-slate-500 md:col-span-2 xl:col-span-3">
            {koiList.length === 0 ? 'No koi in stock — tap Add Koi to get started.' : 'No koi match your search or filters.'}
          </Card>
        ) : filtered.map((k) => {
          const st = STATUS_STYLE[k.status] || STATUS_STYLE.available
          return (
            <Card key={k.id} className={`overflow-hidden ${st.border}`}>
              <div className="relative aspect-square bg-slate-900">
                {k.photo ? (
                  <img src={k.photo} alt={k.name || k.variety} className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600"><Fish size={48} /></div>
                )}
                <Badge className={`absolute top-2 right-2 ${st.badge}`}>{k.status}</Badge>
                {k.status === 'sold' && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><span className="text-white font-black text-lg">SOLD</span></div>}
              </div>
              <div className="p-4 space-y-2">
                <p className="text-white font-bold">{k.name || k.variety}</p>
                <div className="flex flex-wrap gap-1">
                  <Badge className="bg-slate-700 text-slate-300">{k.variety}</Badge>
                  {k.size != null && k.size !== '' && (
                    <Badge className="bg-slate-700 text-slate-300">{formatKoiSize(k.size)}</Badge>
                  )}
                </div>
                <p className="text-slate-400 text-xs flex items-center gap-1"><MapPin size={12} />{k.pondName}</p>
                <p className={`text-xl font-black ${k.status === 'sold' ? 'text-slate-500' : 'text-cyan-400'}`}>{formatSGD(k.status === 'sold' ? k.soldPrice : k.price)}</p>
                <p className="text-slate-500 text-[10px]">Added {k.dateAdded}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Btn variant="ghost" size="sm" onClick={() => setViewKoi(k)}><Eye size={12} />View</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setEditKoi({ ...k })}><Edit2 size={12} />Edit</Btn>
                  {STOCK_STATUSES.includes(k.status) && (
                    <>
                      <Btn variant="secondary" size="sm" onClick={() => openShip(k)}><Truck size={12} />Ship</Btn>
                      <Btn variant="success" size="sm" onClick={() => {
                        setSellKoi(k)
                        setSellForm({
                          customerId: '',
                          soldPrice: String(k.price),
                          soldDate: today(),
                          disposition: 'taken',
                          keepPondName: k.pondName || 'A1',
                        })
                      }}><ShoppingBag size={12} />Sell</Btn>
                      {k.status === KOI_STATUS.AVAILABLE ? (
                        <Btn variant="ghost" size="sm" onClick={() => setKoiStatus(k, KOI_STATUS.SICK)} title="Mark as sick">
                          <HeartPulse size={12} />Sick
                        </Btn>
                      ) : (
                        <Btn variant="ghost" size="sm" onClick={() => setKoiStatus(k, KOI_STATUS.AVAILABLE)} title="Mark recovered">
                          <RotateCcw size={12} />Recover
                        </Btn>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {soldFish.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-bold text-white mb-3">Sold Fish Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
            <div><p className="text-slate-500 text-xs">Total sold</p><p className="text-white font-bold">{soldFish.length}</p></div>
            <div><p className="text-slate-500 text-xs">Revenue</p><p className="text-emerald-400 font-bold">{formatSGD(soldFish.reduce((s, k) => s + (k.soldPrice || 0), 0))}</p></div>
            <div><p className="text-slate-500 text-xs">Top variety</p><p className="text-cyan-400 font-bold">{Object.entries(soldFish.reduce((a, k) => { a[k.variety] = (a[k.variety] || 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}</p></div>
          </div>
          <div className="space-y-2">
            {recentSold.map((k) => (
              <div key={k.id} className="flex items-center gap-3 text-sm border-t border-slate-700/50 pt-2">
                {k.photo ? <img src={k.photo} alt="" className="w-10 h-10 rounded object-contain bg-slate-900" /> : <div className="w-10 h-10 rounded bg-slate-800 flex items-center justify-center"><Fish size={16} /></div>}
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{k.variety} · {customerName(k.soldTo)}</p>
                  <p className="text-slate-500 text-xs">
                    {k.soldDate}
                    {k.sellDisposition === 'keep' ? ` · Kept ${k.keepPondName || '—'}` : k.sellDisposition === 'taken' ? ' · Taken away' : ''}
                  </p>
                </div>
                <p className="text-emerald-400 font-bold">{formatSGD(k.soldPrice)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Koi" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PhotoPicker photo={form.photo} onPick={(p) => setForm((f) => ({ ...f, photo: p }))} className="sm:col-span-2" />
          <Input label="Fish name (optional)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Select label="Variety" value={form.variety} onChange={(e) => setForm((f) => ({ ...f, variety: e.target.value }))} options={KOI_VARIETIES.map((v) => ({ value: v, label: v }))} />
          <Input label="Size (cm, optional)" type="number" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} min="1" step="0.1" placeholder="e.g. 28" />
          <PondNameInput value={form.pondName} onChange={(e) => setForm((f) => ({ ...f, pondName: e.target.value }))} required />
          <Input label="Selling price (S$)" type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} step="0.01" required />
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="sm:col-span-2" />
        </div>
        <div className="modal-actions mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addKoi}><Plus size={14} />Add Koi</Btn>
        </div>
      </Modal>

      <Modal open={!!editKoi} onClose={() => setEditKoi(null)} title={`Edit ${editKoi?.id}`} size="lg">
        {editKoi && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PhotoPicker photo={editKoi.photo} onPick={(p) => setEditKoi((k) => ({ ...k, photo: p }))} className="sm:col-span-2" />
              <Input label="Name (optional)" value={editKoi.name} onChange={(e) => setEditKoi((k) => ({ ...k, name: e.target.value }))} />
              <Select label="Variety" value={editKoi.variety} onChange={(e) => setEditKoi((k) => ({ ...k, variety: e.target.value }))}
                options={KOI_VARIETIES.map((v) => ({ value: v, label: v }))} />
              <Input label="Size (cm, optional)" type="number" value={editKoi.size ?? ''} onChange={(e) => setEditKoi((k) => ({ ...k, size: e.target.value }))} min="1" step="0.1" />
              <Select label="Status" value={editKoi.status} onChange={(e) => setEditKoi((k) => ({ ...k, status: e.target.value }))}
                options={KOI_STATUS_OPTIONS} />
              <PondNameInput value={editKoi.pondName} onChange={(e) => setEditKoi((k) => ({ ...k, pondName: e.target.value }))} required />
              <Input label="Selling price" type="number" value={editKoi.price} onChange={(e) => setEditKoi((k) => ({ ...k, price: e.target.value }))} step="0.01" />
              <Textarea label="Notes" value={editKoi.notes} onChange={(e) => setEditKoi((k) => ({ ...k, notes: e.target.value }))} className="sm:col-span-2" />
            </div>
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setEditKoi(null)}>Cancel</Btn>
              <Btn onClick={saveEdit}>Save</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!shipKoi} onClose={() => { setShipKoi(null); setShipToPond('') }} title="Ship to Pond" size="sm">
        {shipKoi && (
          <>
            <div className="flex gap-3 mb-4">
              {shipKoi.photo ? (
                <img src={shipKoi.photo} alt="" className="w-16 h-16 rounded-lg object-contain bg-slate-900" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center"><Fish size={20} /></div>
              )}
              <div>
                <p className="text-white font-bold">{shipKoi.name || shipKoi.variety}</p>
                <p className="text-slate-400 text-sm">Currently in <span className="text-cyan-300 font-bold">{shipKoi.pondName}</span></p>
              </div>
            </div>
            <PondNameInput
              label="Move to pond"
              value={shipToPond}
              onChange={(e) => setShipToPond(e.target.value)}
              required
            />
            <p className="text-slate-500 text-xs mt-2">Transfer fish between ponds — e.g. D1 → A1 or to quarantine.</p>
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => { setShipKoi(null); setShipToPond('') }}>Cancel</Btn>
              <Btn onClick={confirmShip}><Truck size={14} />Move Fish</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!sellKoi} onClose={() => setSellKoi(null)} title="Mark Koi Sold" size="md">
        {sellKoi && (
          <>
            <div className="flex gap-3 mb-4">
              {sellKoi.photo ? <img src={sellKoi.photo} alt="" className="w-20 h-20 rounded-lg object-contain bg-slate-900" /> : <div className="w-20 h-20 rounded-lg bg-slate-800 flex items-center justify-center"><Fish size={24} /></div>}
              <div><p className="text-white font-bold">{sellKoi.name || sellKoi.variety}</p><p className="text-slate-400 text-sm">{formatKoiSize(sellKoi.size)} · {sellKoi.pondName}</p></div>
            </div>
            {customers.length === 0 ? (
              <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                No customers yet. Add a customer first before selling koi.
              </p>
            ) : (
              <Select label="Customer" value={sellForm.customerId} onChange={(e) => setSellForm((f) => ({ ...f, customerId: e.target.value }))} required
                options={[{ value: '', label: '-- Select customer --' }, ...customers.map((c) => ({ value: String(c.id), label: c.name }))]} />
            )}
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">After sale</p>
              <div className="flex gap-2">
                {[
                  ['taken', 'Taken away'],
                  ['keep', 'Keep at farm'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSellForm((f) => ({ ...f, disposition: value }))}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-bold transition-colors ${sellForm.disposition === value ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-slate-500 text-xs mt-2">
                {sellForm.disposition === 'keep'
                  ? 'Fish stays at the farm — record will be added to Customer Koi.'
                  : 'Customer took the fish — no Customer Koi record.'}
              </p>
            </div>
            {sellForm.disposition === 'keep' && (
              <PondNameInput
                label="Keep in pond"
                value={sellForm.keepPondName}
                onChange={(e) => setSellForm((f) => ({ ...f, keepPondName: e.target.value }))}
                className="mt-3"
                required
              />
            )}
            <Input label="Sold price (S$)" type="number" value={sellForm.soldPrice} onChange={(e) => setSellForm((f) => ({ ...f, soldPrice: e.target.value }))} step="0.01" className="mt-3" />
            <Input label="Sold date" type="date" value={sellForm.soldDate} onChange={(e) => setSellForm((f) => ({ ...f, soldDate: e.target.value }))} className="mt-3" />
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setSellKoi(null)}>Cancel</Btn>
              <Btn variant="success" onClick={confirmSell} disabled={customers.length === 0}><ShoppingBag size={14} />Confirm Sale</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!viewKoi} onClose={() => setViewKoi(null)} title={viewKoi?.id} size="lg">
        {viewKoi && (
          <div className="space-y-4">
            <KoiPhoto src={viewKoi.photo} alt={viewKoi.name || viewKoi.variety} className="w-full aspect-square max-h-80 rounded-xl" />
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Variety', viewKoi.variety], ['Size', formatKoiSize(viewKoi.size)], ['Pond', viewKoi.pondName], ['Price', formatSGD(viewKoi.price)], ['Status', viewKoi.status]].map(([k, v]) => (
                <div key={k}><p className="text-slate-500 text-xs">{k}</p><p className="text-white">{v}</p></div>
              ))}
            </div>
            {viewKoi.status === 'sold' && (
              <Card className="p-3 border-blue-500/30">
                <p className="text-blue-300 text-xs font-bold mb-2">Sale record</p>
                <p className="text-sm text-white">Buyer: {customerName(viewKoi.soldTo)}</p>
                <p className="text-sm text-white">Date: {viewKoi.soldDate} · {formatSGD(viewKoi.soldPrice)}</p>
                <p className="text-sm text-white">
                  {viewKoi.sellDisposition === 'keep'
                    ? `Kept at farm — ${viewKoi.keepPondName || '—'}`
                    : viewKoi.sellDisposition === 'taken'
                      ? 'Taken away by customer'
                      : '—'}
                </p>
              </Card>
            )}
            {viewKoi.notes && <p className="text-slate-400 text-sm">{viewKoi.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
