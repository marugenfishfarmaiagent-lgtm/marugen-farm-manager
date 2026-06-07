import { useMemo, useState } from 'react'
import { Fish, Plus, Search, Home, Edit2, Eye, Skull, MessageSquare, PackageCheck, X } from 'lucide-react'
import {
  KOI_VARIETIES, CUSTOMER_KOI_DEATH_CAUSES, CUSTOMER_KOI_STATUS, CUSTOMER_KOI_STATUS_OPTIONS,
  formatCustomerKoiStatus, formatSGD, formatKoiSize, normalizeKoiSizeCm, genId, today,
} from '../data/constants'
import { Badge, Btn, Card, Input, Modal, PondNameInput, Select, Textarea } from '../components/ui'
import Fab from '../components/Fab'
import { readKoiImageFile } from '../lib/koiImage'
import { openWhatsAppChat } from '../lib/invoiceWhatsApp'

const tierColor = { Bronze: 'text-orange-400', Silver: 'text-slate-300', Gold: 'text-yellow-400', Platinum: 'text-cyan-400' }

const STATUS_STYLE = {
  in_pond: { badge: 'bg-emerald-500/20 text-emerald-300', border: '' },
  collected: { badge: 'bg-blue-500/20 text-blue-300', border: '' },
  deceased: { badge: 'bg-red-500/20 text-red-300', border: 'border-red-500/30' },
}

const emptyRecord = () => ({
  customerId: '', customerName: '', koiId: '', photo: null, fishName: '', variety: KOI_VARIETIES[0],
  size: '', pondName: '', purchaseDate: today(), purchasePrice: '', notes: '',
  status: CUSTOMER_KOI_STATUS.IN_POND, collectedDate: null,
})

function PhotoPicker({ photo, onPick, label = 'Photo' }) {
  const pick = async (file) => {
    if (!file) return
    try { onPick(await readKoiImageFile(file)) } catch (err) { alert(err.message) }
  }
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}</p>
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-600 p-4 text-center">
        {photo ? <img src={photo} alt="" className="w-40 h-40 mx-auto object-cover rounded-lg" /> : <p className="text-slate-500 text-sm py-6">Upload photo (max 2MB)</p>}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
    </div>
  )
}

function displayFishName(rec) {
  return rec.fishName?.trim() || rec.variety || 'Koi'
}

function KoiCodeSearch({ linkedId, farmKoiList, customers, onLink, onClear, className = '' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const linked = farmKoiList.find((k) => k.id === linkedId)
  const linkedCustomer = linked?.soldTo
    ? customers.find((c) => String(c.id) === String(linked.soldTo))
    : null

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? farmKoiList.filter((k) => [k.id, k.name, k.variety].some((x) => String(x || '').toLowerCase().includes(q)))
      : farmKoiList
    return list.slice(0, 12)
  }, [query, farmKoiList])

  if (linked) {
    return (
      <div className={`min-w-0 ${className}`}>
        <p className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Koi Code</p>
        <div className="flex items-center gap-3 bg-slate-900/50 border border-cyan-500/40 rounded-lg p-3">
          {linked.photo ? (
            <img src={linked.photo} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0"><Fish size={18} className="text-slate-500" /></div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-cyan-300 font-mono font-bold text-sm">{linked.id}</p>
            <p className="text-white text-sm truncate">{linked.name || linked.variety}</p>
            <p className="text-slate-500 text-xs">
              {linked.variety}{linked.size != null ? ` · ${formatKoiSize(linked.size)}` : ''} · {linked.status}
              {linkedCustomer ? ` · ${linkedCustomer.name}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClear} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 shrink-0" title="Clear link">
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-w-0 relative ${className}`}>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Koi Code</label>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-3.5 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 150) }}
          placeholder="Search farm stock by Koi Code e.g. KOI-001"
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-9 pr-3 py-3 sm:py-2.5 text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
          {matches.map((k) => (
            <button
              key={k.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onLink(k); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 hover:bg-slate-700 flex items-center gap-3 border-b border-slate-700/50 last:border-0"
            >
              <span className="text-cyan-300 font-mono text-xs font-bold shrink-0">{k.id}</span>
              <span className="text-white text-sm truncate flex-1">{k.name || k.variety}</span>
              <span className="text-slate-500 text-xs shrink-0">{k.status}</span>
            </button>
          ))}
        </div>
      )}
      {open && query && matches.length === 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg p-3 text-slate-500 text-sm">
          No koi found for &ldquo;{query}&rdquo;
        </div>
      )}
      <p className="text-slate-500 text-xs mt-1.5">Optional — link to farm stock by Koi Code</p>
    </div>
  )
}

function statusDetail(rec) {
  if (rec.status === CUSTOMER_KOI_STATUS.IN_POND) {
    return rec.pondName ? `Pond: ${rec.pondName}` : 'Pond not set'
  }
  if (rec.status === CUSTOMER_KOI_STATUS.COLLECTED) {
    return rec.collectedDate ? `Taken away · ${rec.collectedDate}` : 'Taken away by customer'
  }
  if (rec.status === CUSTOMER_KOI_STATUS.DECEASED) {
    return rec.deathDate ? `Deceased · ${rec.deathDate}` : 'Deceased'
  }
  return formatCustomerKoiStatus(rec.status)
}

export default function CustomerKoi({ records, setRecords, customers, farmKoiList, addNotification }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyRecord())
  const [editRec, setEditRec] = useState(null)
  const [viewRec, setViewRec] = useState(null)
  const [deathRec, setDeathRec] = useState(null)
  const [collectRec, setCollectRec] = useState(null)
  const [collectDate, setCollectDate] = useState(today())
  const [deathForm, setDeathForm] = useState({ deathDate: today(), deathCause: CUSTOMER_KOI_DEATH_CAUSES[0], deathPhoto: null, deathNotes: '' })

  const customersWithKoi = useMemo(() => {
    const ids = new Set(records.map((r) => String(r.customerId)))
    return customers.filter((c) => ids.has(String(c.id)))
  }, [records, customers])

  const filteredRecords = records.filter((r) => {
    if (selectedCustomerId !== 'all' && String(r.customerId) !== String(selectedCustomerId)) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    const q = search.toLowerCase()
    return !q || [r.fishName, r.customerName, r.pondName, r.variety, r.koiId, formatCustomerKoiStatus(r.status)].some((x) => String(x || '').toLowerCase().includes(q))
  })

  const stats = useMemo(() => ({
    total: records.length,
    inPond: records.filter((r) => r.status === CUSTOMER_KOI_STATUS.IN_POND).length,
    collected: records.filter((r) => r.status === CUSTOMER_KOI_STATUS.COLLECTED).length,
    deceased: records.filter((r) => r.status === CUSTOMER_KOI_STATUS.DECEASED).length,
    topVariety: Object.entries(records.reduce((a, r) => { a[r.variety] = (a[r.variety] || 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
  }), [records])

  const selectedCustomer = customers.find((c) => String(c.id) === String(selectedCustomerId))

  const saveRecord = () => {
    const customer = customers.find((c) => String(c.id) === String(form.customerId))
    if (!customer) {
      addNotification({ type: 'error', title: 'Customer Required', message: 'Select a customer.' })
      return
    }
    const hasSize = form.size !== '' && form.size != null
    const sizeCm = hasSize ? normalizeKoiSizeCm(form.size) : null
    if (hasSize && sizeCm == null) {
      addNotification({ type: 'error', title: 'Invalid Size', message: 'Enter a valid size in cm, or leave blank.' })
      return
    }
    if (form.status === CUSTOMER_KOI_STATUS.IN_POND && !form.pondName?.trim()) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Enter which pond the koi is in.' })
      return
    }
    if (+form.purchasePrice < 0) {
      addNotification({ type: 'error', title: 'Invalid Price', message: 'Sale price cannot be negative.' })
      return
    }
    if (form.koiId) {
      const duplicate = records.find(
        (r) => r.koiId === form.koiId && r.status !== CUSTOMER_KOI_STATUS.DECEASED,
      )
      if (duplicate) {
        addNotification({
          type: 'warning',
          title: 'Koi Already Linked',
          message: `${form.koiId} is already tracked for ${duplicate.customerName}.`,
        })
        return
      }
    }
    const rec = {
      ...form,
      id: genId('CKOI'),
      customerName: customer.name,
      fishName: form.fishName?.trim() || '',
      size: sizeCm,
      purchasePrice: +form.purchasePrice || 0,
      pondName: form.status === CUSTOMER_KOI_STATUS.IN_POND ? form.pondName.trim() : form.pondName?.trim() || '',
      collectedDate: form.status === CUSTOMER_KOI_STATUS.COLLECTED ? (form.collectedDate || today()) : null,
      deathDate: null, deathCause: null, deathPhoto: null, deathNotes: '',
    }
    setRecords((prev) => [...prev, rec])
    addNotification({ type: 'success', title: 'Record Added', message: `${displayFishName(rec)} added for ${customer.name}` })
    setShowAdd(false)
    setForm(emptyRecord())
  }

  const saveEdit = () => {
    if (!editRec) return
    const hasSize = editRec.size !== '' && editRec.size != null
    const sizeCm = hasSize ? normalizeKoiSizeCm(editRec.size) : null
    if (hasSize && sizeCm == null) {
      addNotification({ type: 'error', title: 'Invalid Size', message: 'Enter a valid size in cm, or leave blank.' })
      return
    }
    if (editRec.status === CUSTOMER_KOI_STATUS.IN_POND && !editRec.pondName?.trim()) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Enter which pond the koi is in.' })
      return
    }
    if (+editRec.purchasePrice < 0) {
      addNotification({ type: 'error', title: 'Invalid Price', message: 'Sale price cannot be negative.' })
      return
    }
    let updated = {
      ...editRec,
      fishName: editRec.fishName?.trim() || '',
      size: sizeCm,
      purchasePrice: +editRec.purchasePrice || 0,
      pondName: editRec.pondName?.trim() || '',
      collectedDate: editRec.status === CUSTOMER_KOI_STATUS.COLLECTED
        ? (editRec.collectedDate || today())
        : null,
    }
    if (updated.status !== CUSTOMER_KOI_STATUS.DECEASED) {
      updated = {
        ...updated,
        deathDate: null,
        deathCause: null,
        deathPhoto: null,
        deathNotes: '',
      }
    }
    if (updated.status === CUSTOMER_KOI_STATUS.COLLECTED && !updated.collectedDate) {
      updated.collectedDate = today()
    }
    setRecords((prev) => prev.map((r) => (r.id === editRec.id ? updated : r)))
    addNotification({ type: 'success', title: 'Updated', message: `${displayFishName(updated)} — ${formatCustomerKoiStatus(updated.status)}` })
    setEditRec(null)
  }

  const confirmCollect = () => {
    if (!collectRec) return
    setRecords((prev) => prev.map((r) => (r.id === collectRec.id ? {
      ...r,
      status: CUSTOMER_KOI_STATUS.COLLECTED,
      collectedDate: collectDate || today(),
    } : r)))
    addNotification({ type: 'success', title: 'Marked Taken Away', message: `${displayFishName(collectRec)} — customer collected on ${collectDate}` })
    setCollectRec(null)
  }

  const confirmDeath = () => {
    if (!deathRec) return
    setRecords((prev) => prev.map((r) => (r.id === deathRec.id ? {
      ...r,
      status: CUSTOMER_KOI_STATUS.DECEASED,
      ...deathForm,
    } : r)))
    addNotification({ type: 'warning', title: 'Death Recorded', message: `${displayFishName(deathRec)} (${deathRec.customerName}) recorded deceased` })
    setDeathRec(null)
  }

  const linkFarmKoi = (koi) => {
    const duplicate = records.find(
      (r) => r.koiId === koi.id && r.status !== CUSTOMER_KOI_STATUS.DECEASED,
    )
    if (duplicate) {
      addNotification({
        type: 'warning',
        title: 'Already Tracked',
        message: `${koi.id} is already in Customer Koi for ${duplicate.customerName}.`,
      })
      return
    }
    const buyer = koi.soldTo
      ? customers.find((c) => String(c.id) === String(koi.soldTo))
      : null
    const existingRec = records.find((r) => r.koiId === koi.id)
    const customerFromRecord = existingRec
      ? customers.find((c) => String(c.id) === String(existingRec.customerId))
      : null
    const customer = buyer || customerFromRecord

    setForm((f) => {
      const next = {
        ...f,
        koiId: koi.id,
        variety: koi.variety || f.variety,
        size: koi.size ?? f.size,
        photo: koi.photo || f.photo,
        fishName: koi.name?.trim() || f.fishName,
        purchasePrice: koi.soldPrice != null ? String(koi.soldPrice) : (koi.price != null ? String(koi.price) : f.purchasePrice),
        purchaseDate: koi.soldDate || f.purchaseDate,
        pondName: koi.keepPondName || koi.pondName || f.pondName,
      }
      if (customer) {
        next.customerId = String(customer.id)
        next.customerName = customer.name
      }
      if (koi.sellDisposition === 'keep') {
        next.status = CUSTOMER_KOI_STATUS.IN_POND
        next.pondName = koi.keepPondName || koi.pondName || next.pondName
        next.collectedDate = null
      } else if (koi.sellDisposition === 'taken') {
        next.status = CUSTOMER_KOI_STATUS.COLLECTED
        next.collectedDate = koi.soldDate || today()
      }
      return next
    })

    if (customer) {
      addNotification({ type: 'info', title: 'Customer Auto-selected', message: `${customer.name} linked to ${koi.id}` })
    } else if (koi.soldTo) {
      addNotification({ type: 'warning', title: 'Customer Not Found', message: `Buyer for ${koi.id} is not in the customer list.` })
    }
  }

  const clearFarmKoiLink = () => {
    setForm((f) => ({ ...f, koiId: '' }))
  }

  const openAdd = () => {
    const base = emptyRecord()
    if (selectedCustomerId !== 'all') {
      base.customerId = String(selectedCustomerId)
      base.customerName = selectedCustomer?.name || ''
    }
    setForm(base)
    setShowAdd(true)
  }

  const statusBadge = (r) => {
    const style = STATUS_STYLE[r.status] || STATUS_STYLE.in_pond
    return (
      <Badge className={`absolute top-2 right-2 ${style.badge}`}>
        {formatCustomerKoiStatus(r.status)}
      </Badge>
    )
  }

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white">Customer Koi</h2>
        <p className="text-slate-400 text-sm">Sold koi — track pond, taken away, or deceased</p>
      </div>
      <Fab onClick={openAdd} label="Add Koi Record" />

      <div className="flex flex-col lg:flex-row gap-4 min-h-[480px]">
        <Card className="lg:w-64 shrink-0 p-3 space-y-2 lg:sticky lg:top-4 lg:self-start max-h-[70vh] overflow-y-auto">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-2.5 text-slate-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-sm text-white" />
          </div>
          <button type="button" onClick={() => setSelectedCustomerId('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${selectedCustomerId === 'all' ? 'bg-cyan-500/20 border-l-2 border-cyan-400 text-white' : 'text-slate-400 hover:bg-slate-700/50'}`}>
            All Customers <Badge className="ml-1 bg-slate-700">{records.length}</Badge>
          </button>
          {customersWithKoi.map((c) => {
            const count = records.filter((r) => String(r.customerId) === String(c.id)).length
            return (
              <button key={c.id} type="button" onClick={() => setSelectedCustomerId(String(c.id))}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${selectedCustomerId === String(c.id) ? 'bg-cyan-500/20 border-l-2 border-cyan-400' : 'hover:bg-slate-700/50'}`}>
                <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-cyan-400">{c.name.slice(0, 2).toUpperCase()}</span>
                <span className="flex-1 min-w-0 truncate text-white">{c.name}</span>
                <Badge className="bg-slate-700">{count}</Badge>
              </button>
            )
          })}
        </Card>

        <div className="flex-1 min-w-0 space-y-4">
          {selectedCustomerId === 'all' ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                ['all', 'Total', stats.total, 'text-white'],
                [CUSTOMER_KOI_STATUS.IN_POND, 'In pond', stats.inPond, 'text-emerald-400'],
                [CUSTOMER_KOI_STATUS.COLLECTED, 'Taken away', stats.collected, 'text-blue-400'],
                [CUSTOMER_KOI_STATUS.DECEASED, 'Deceased', stats.deceased, 'text-slate-400'],
              ].map(([value, label, count, color]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`p-4 rounded-xl border text-left transition-colors touch-manipulation ${statusFilter === value ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-800'}`}
                >
                  <p className="text-slate-500 text-xs">{label}</p>
                  <p className={`font-black text-lg ${color}`}>{count}</p>
                </button>
              ))}
              <Card className="p-4"><p className="text-slate-500 text-xs">Top variety</p><p className="text-white font-black text-lg truncate">{stats.topVariety}</p></Card>
            </div>
          ) : selectedCustomer && (
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white">{selectedCustomer.name}</h3>
              <span className={`font-bold text-sm ${tierColor[selectedCustomer.tier]}`}>{selectedCustomer.tier}</span>
              {selectedCustomer.whatsapp && (
                <Btn variant="ghost" size="sm" onClick={() => openWhatsAppChat(selectedCustomer.whatsapp)}><MessageSquare size={14} /></Btn>
              )}
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ['all', 'All'],
              [CUSTOMER_KOI_STATUS.IN_POND, 'In pond'],
              [CUSTOMER_KOI_STATUS.COLLECTED, 'Taken away'],
              [CUSTOMER_KOI_STATUS.DECEASED, 'Deceased'],
            ].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setStatusFilter(value)}
                className={`px-3 py-2 rounded-lg text-xs font-bold shrink-0 ${statusFilter === value ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRecords.length === 0 ? (
              <Card className="p-8 text-center text-slate-500 md:col-span-2">
                {records.length === 0 ? 'No customer koi records — tap Add Koi Record to get started.' : 'No records match your search or filters.'}
              </Card>
            ) : filteredRecords.map((r) => (
              <Card key={r.id} className={`overflow-hidden ${STATUS_STYLE[r.status]?.border || ''}`}>
                <div className="aspect-video bg-slate-900 relative">
                  {r.photo ? <img src={r.photo} alt="" className={`w-full h-full object-cover ${r.status === CUSTOMER_KOI_STATUS.DECEASED ? 'grayscale' : ''}`} /> : <div className="w-full h-full flex items-center justify-center"><Fish size={40} className="text-slate-600" /></div>}
                  {statusBadge(r)}
                </div>
                <div className="p-4">
                  <p className="text-white font-bold text-lg">{displayFishName(r)}</p>
                  <p className="text-slate-500 text-xs">{r.customerName}</p>
                  <div className="flex flex-wrap gap-1 my-2">
                    <Badge className="bg-slate-700">{r.variety}</Badge>
                    {r.size != null && r.size !== '' && <Badge className="bg-slate-700">{formatKoiSize(r.size)}</Badge>}
                  </div>
                  <p className="text-slate-400 text-xs flex items-center gap-1">
                    {r.status === CUSTOMER_KOI_STATUS.IN_POND && <Home size={12} />}
                    {r.status === CUSTOMER_KOI_STATUS.COLLECTED && <PackageCheck size={12} />}
                    {r.status === CUSTOMER_KOI_STATUS.DECEASED && <Skull size={12} />}
                    {statusDetail(r)}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">Sold {r.purchaseDate} · {formatSGD(r.purchasePrice)}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Btn variant="ghost" size="sm" onClick={() => setViewRec(r)}><Eye size={12} />View</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setEditRec({ ...r })}><Edit2 size={12} />Edit</Btn>
                    {r.status === CUSTOMER_KOI_STATUS.IN_POND && (
                      <Btn variant="success" size="sm" onClick={() => { setCollectRec(r); setCollectDate(today()) }}><PackageCheck size={12} />Taken away</Btn>
                    )}
                    {r.status !== CUSTOMER_KOI_STATUS.DECEASED && (
                      <Btn variant="danger" size="sm" onClick={() => { setDeathRec(r); setDeathForm({ deathDate: today(), deathCause: CUSTOMER_KOI_DEATH_CAUSES[0], deathPhoto: null, deathNotes: '' }) }}><Skull size={12} /></Btn>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer Koi" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {customers.length === 0 ? (
            <p className="text-amber-300 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 sm:col-span-2">
              No customers yet. Add a customer first before tracking customer koi.
            </p>
          ) : (
            <Select label="Customer" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} required className="sm:col-span-2"
              options={[{ value: '', label: '-- Select --' }, ...customers.map((c) => ({ value: String(c.id), label: c.name }))]} />
          )}
          <PhotoPicker photo={form.photo} onPick={(p) => setForm((f) => ({ ...f, photo: p }))} />
          <Input label="Fish name (optional)" value={form.fishName} onChange={(e) => setForm((f) => ({ ...f, fishName: e.target.value }))} placeholder="Leave blank to use variety" />
          <Select label="Variety" value={form.variety} onChange={(e) => setForm((f) => ({ ...f, variety: e.target.value }))} options={KOI_VARIETIES.map((v) => ({ value: v, label: v }))} required />
          <Input label="Size (cm, optional)" type="number" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} min="1" step="0.1" placeholder="e.g. 35" />
          <Select label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={CUSTOMER_KOI_STATUS_OPTIONS.filter((o) => o.value !== CUSTOMER_KOI_STATUS.DECEASED)} />
          {form.status === CUSTOMER_KOI_STATUS.IN_POND && (
            <PondNameInput value={form.pondName} onChange={(e) => setForm((f) => ({ ...f, pondName: e.target.value }))} required className="sm:col-span-2" placeholder="e.g. A3 or customer pond" />
          )}
          {form.status === CUSTOMER_KOI_STATUS.COLLECTED && (
            <Input label="Taken away date" type="date" value={form.collectedDate || today()} onChange={(e) => setForm((f) => ({ ...f, collectedDate: e.target.value }))} className="sm:col-span-2" />
          )}
          <Input label="Purchase / sold date" type="date" value={form.purchaseDate} onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))} />
          <Input label="Sale price (S$)" type="number" value={form.purchasePrice} onChange={(e) => setForm((f) => ({ ...f, purchasePrice: e.target.value }))} step="0.01" />
          <KoiCodeSearch
            linkedId={form.koiId}
            farmKoiList={farmKoiList}
            customers={customers}
            onLink={linkFarmKoi}
            onClear={clearFarmKoiLink}
            className="sm:col-span-2"
          />
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="sm:col-span-2" />
        </div>
        <div className="modal-actions mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={saveRecord} disabled={customers.length === 0}>Save</Btn>
        </div>
      </Modal>

      <Modal open={!!editRec} onClose={() => setEditRec(null)} title="Edit Record" size="md">
        {editRec && (
          <>
            <PhotoPicker photo={editRec.photo} onPick={(p) => setEditRec((r) => ({ ...r, photo: p }))} />
            <Input label="Fish name (optional)" value={editRec.fishName} onChange={(e) => setEditRec((r) => ({ ...r, fishName: e.target.value }))} className="mt-3" placeholder="Leave blank to use variety" />
            <Select label="Variety" value={editRec.variety} onChange={(e) => setEditRec((r) => ({ ...r, variety: e.target.value }))} className="mt-3"
              options={KOI_VARIETIES.map((v) => ({ value: v, label: v }))} />
            <Input label="Size (cm, optional)" type="number" value={editRec.size ?? ''} onChange={(e) => setEditRec((r) => ({ ...r, size: e.target.value }))} min="1" step="0.1" className="mt-3" placeholder="e.g. 35" />
            <Input label="Purchase / sold date" type="date" value={editRec.purchaseDate || today()} onChange={(e) => setEditRec((r) => ({ ...r, purchaseDate: e.target.value }))} className="mt-3" />
            <Input label="Sale price (S$)" type="number" value={editRec.purchasePrice} onChange={(e) => setEditRec((r) => ({ ...r, purchasePrice: e.target.value }))} step="0.01" className="mt-3" />
            {editRec.koiId && (
              <p className="text-cyan-400 text-xs font-mono mt-3">Koi Code: {editRec.koiId}</p>
            )}
            <Select label="Status" value={editRec.status} onChange={(e) => setEditRec((r) => ({ ...r, status: e.target.value }))} className="mt-3"
              options={editRec.status === CUSTOMER_KOI_STATUS.DECEASED
                ? CUSTOMER_KOI_STATUS_OPTIONS
                : CUSTOMER_KOI_STATUS_OPTIONS.filter((o) => o.value !== CUSTOMER_KOI_STATUS.DECEASED)} />
            {editRec.status === CUSTOMER_KOI_STATUS.IN_POND && (
              <PondNameInput value={editRec.pondName} onChange={(e) => setEditRec((r) => ({ ...r, pondName: e.target.value }))} className="mt-3" required placeholder="e.g. A3 or customer pond" />
            )}
            {editRec.status === CUSTOMER_KOI_STATUS.COLLECTED && (
              <Input label="Taken away date" type="date" value={editRec.collectedDate || today()} onChange={(e) => setEditRec((r) => ({ ...r, collectedDate: e.target.value }))} className="mt-3" />
            )}
            <Textarea label="Notes" value={editRec.notes} onChange={(e) => setEditRec((r) => ({ ...r, notes: e.target.value }))} className="mt-3" />
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setEditRec(null)}>Cancel</Btn>
              <Btn onClick={saveEdit}>Save</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!collectRec} onClose={() => setCollectRec(null)} title="Mark as Taken Away" size="sm">
        {collectRec && (
          <div className="space-y-3">
            <p className="text-slate-300 text-sm">
              Customer took <strong className="text-white">{displayFishName(collectRec)}</strong> away from the farm / pond.
            </p>
            <Input label="Taken away date" type="date" value={collectDate} onChange={(e) => setCollectDate(e.target.value)} required />
            <div className="flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setCollectRec(null)}>Cancel</Btn>
              <Btn variant="success" onClick={confirmCollect}><PackageCheck size={14} />Confirm</Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!deathRec} onClose={() => setDeathRec(null)} title="Record Koi Death" size="md">
        {deathRec && (
          <div className="border border-red-500/30 rounded-xl p-4 space-y-3">
            <p className="text-red-200 text-sm">Document the loss of <strong>{displayFishName(deathRec)}</strong> ({deathRec.customerName})</p>
            <Input label="Date of death" type="date" value={deathForm.deathDate} onChange={(e) => setDeathForm((f) => ({ ...f, deathDate: e.target.value }))} required />
            <Select label="Cause" value={deathForm.deathCause} onChange={(e) => setDeathForm((f) => ({ ...f, deathCause: e.target.value }))}
              options={CUSTOMER_KOI_DEATH_CAUSES.map((c) => ({ value: c, label: c }))} />
            <PhotoPicker photo={deathForm.deathPhoto} onPick={(p) => setDeathForm((f) => ({ ...f, deathPhoto: p }))} label="Death photo" />
            <Textarea label="Death notes" value={deathForm.deathNotes} onChange={(e) => setDeathForm((f) => ({ ...f, deathNotes: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setDeathRec(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmDeath}><Skull size={14} />Record Death</Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!viewRec} onClose={() => setViewRec(null)} title={viewRec ? displayFishName(viewRec) : ''} size="lg">
        {viewRec && (
          <div className="space-y-4">
            {viewRec.photo && <img src={viewRec.photo} alt="" className="w-full max-h-56 object-cover rounded-xl" />}
            <Badge className={STATUS_STYLE[viewRec.status]?.badge}>{formatCustomerKoiStatus(viewRec.status)}</Badge>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Customer', viewRec.customerName],
                ['Variety', viewRec.variety],
                viewRec.size != null && viewRec.size !== '' ? ['Size', formatKoiSize(viewRec.size)] : null,
                ['Sold', viewRec.purchaseDate],
                ['Price', formatSGD(viewRec.purchasePrice)],
                viewRec.status === CUSTOMER_KOI_STATUS.IN_POND ? ['Pond', viewRec.pondName] : null,
                viewRec.status === CUSTOMER_KOI_STATUS.COLLECTED ? ['Taken away', viewRec.collectedDate] : null,
              ].filter(Boolean).map(([k, v]) => (
                <div key={k}><p className="text-slate-500 text-xs">{k}</p><p className="text-white">{v || '—'}</p></div>
              ))}
            </div>
            {viewRec.koiId && <p className="text-cyan-400 text-xs font-mono">Koi Code: {viewRec.koiId}</p>}
            {viewRec.notes && <p className="text-slate-400 text-sm">{viewRec.notes}</p>}
            {viewRec.status === CUSTOMER_KOI_STATUS.DECEASED && (
              <Card className="p-3 border-red-500/40">
                <p className="text-red-300 font-bold text-xs mb-2">Death Record</p>
                <p className="text-sm text-white">{viewRec.deathDate} — {viewRec.deathCause}</p>
                {viewRec.deathNotes && <p className="text-slate-400 text-sm mt-1">{viewRec.deathNotes}</p>}
                {viewRec.deathPhoto && <img src={viewRec.deathPhoto} alt="" className="mt-2 rounded-lg max-h-40 border border-red-500/50" />}
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
