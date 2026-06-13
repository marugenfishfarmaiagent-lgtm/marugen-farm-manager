import { useCallback, useMemo, useState } from 'react'
import {
  Fish, Plus, Search, MapPin, Edit2, Eye, Skull, ShoppingBag, ImagePlus, Truck, HeartPulse, RotateCcw, Undo2,
} from 'lucide-react'
import {
  KOI_VARIETIES, KOI_STATUS, KOI_DEATH_CAUSES, FARM_POND_NAMES, mergePondNames,
  formatSGD, formatKoiSize, genId, today, getInvoiceStatus,
} from '../data/constants'
import { Badge, Btn, Card, ConfirmModalFooter, Input, Modal, PondNameInput, Select, Textarea } from '../components/ui'
import Fab from '../components/Fab'
import StoredImage from '../components/StoredImage'
import EmptyState from '../components/ui/EmptyState'
import PaginationControls from '../components/ui/PaginationControls'
import { usePagination } from '../hooks/usePagination'
import { LIST_PAGE_SIZE } from '../data/constants'
import * as db from '../lib/database'
import { isSupabaseConfigured } from '../lib/supabase'
import { readKoiImageFile } from '../lib/koiImage'
import { formatKoiInvoiceLineName, findLinkedKoiInvoices } from '../lib/koiInvoice'
import {
  buildDeceasedKoiPatch, buildSoldKoiPatch, normalizeKoiSizeField,
  sameKoiId, validateKoiFormFields, validateKoiSaleForm,
} from '../lib/koiOps'
import { hasLinkedCustomerKoiForRefund } from '../lib/customerKoiOps'
import { isAppVisibleKoiFarm } from '../lib/retention'
import { uploadInlinePhotoIfNeeded } from '../lib/farmImage'
import { persistKoiFishList } from '../lib/imageUploadOps'
import { touchUpdatedAt } from '../lib/syncMeta'

const STATUS_STYLE = {
  available: { badge: 'bg-emerald-500/20 text-emerald-300', border: 'border-slate-700/50' },
  sold: { badge: 'bg-blue-500/20 text-blue-300', border: 'border-slate-700/50 opacity-60' },
  sick: { badge: 'bg-red-500/20 text-red-300', border: 'border-amber-500/40' },
  deceased: { badge: 'bg-slate-500/20 text-slate-400', border: 'border-red-500/40' },
}

const KOI_EDIT_STATUS_OPTIONS = [
  { value: KOI_STATUS.AVAILABLE, label: 'Available' },
  { value: KOI_STATUS.SICK, label: 'Sick' },
]

const STOCK_STATUSES = [KOI_STATUS.AVAILABLE, KOI_STATUS.SICK]

const emptyKoiForm = () => ({
  photo: null, name: '', variety: KOI_VARIETIES[0], size: '',
  pondName: 'A1', price: '', notes: '',
})

function PhotoPicker({ photo, onPick, onError, label = 'Photo', disabled = false }) {
  const [compressing, setCompressing] = useState(false)
  const pick = async (file) => {
    if (!file || disabled || compressing) return
    try {
      setCompressing(true)
      const dataUrl = await readKoiImageFile(file)
      onPick(dataUrl)
    } catch (err) {
      onError?.(err?.message || 'Could not process image.')
    } finally {
      setCompressing(false)
    }
  }
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">{label}</p>
      <label className={`block rounded-xl border-2 border-dashed border-slate-600 hover:border-cyan-500/50 p-3 text-center transition-colors ${disabled || compressing ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}>
        <div className="w-full max-w-xs mx-auto aspect-square bg-slate-900 rounded-lg flex items-center justify-center overflow-hidden">
          {photo ? (
            <img src={photo} alt="Preview" className="w-full h-full object-contain" />
          ) : (
            <div className="py-8 text-slate-500">
              <ImagePlus size={32} className="mx-auto mb-2 text-cyan-400" />
              <p className="text-sm">{compressing ? 'Compressing photo…' : 'Click to upload — large photos auto-compressed'}</p>
            </div>
          )}
        </div>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled || compressing}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            pick(file)
          }}
        />
      </label>
    </div>
  )
}

function KoiPhoto({ src, alt, className = '', recordId, field = 'photo', onRefresh }) {
  if (!src) return null
  return (
    <div className={`bg-slate-900 flex items-center justify-center overflow-hidden ${className}`}>
      <StoredImage
        src={src}
        alt={alt}
        className="w-full h-full object-contain"
        entity="koi_fish"
        recordId={recordId}
        field={field}
        onRefresh={onRefresh}
      />
    </div>
  )
}

export default function KoiFish({
  koiList, setKoiList, customers, invoices = [], customerKoiList = [],
  onKoiSold, onKoiRefund, onCreateInvoiceFromSale, addNotification,
  registeredPondNames = [], canEdit = false, canRefund = false,
}) {
  const refreshKoiImage = useCallback(async ({ entity, id, field }) => {
    if (!isSupabaseConfigured) return
    try {
      const { url } = await db.refreshSignedImage({ entity, id, field })
      if (!url) return
      setKoiList((prev) => prev.map((k) => {
        if (!sameKoiId(k.id, id)) return k
        if (field === 'death_photo') return { ...k, deathPhoto: url }
        return { ...k, photo: url }
      }))
    } catch {
      /* signed URL refresh failed */
    }
  }, [setKoiList])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('stock')
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
    customerId: '', soldPrice: '', soldDate: today(), disposition: 'taken', keepPondName: '', createInvoice: true,
  })
  const [deathKoi, setDeathKoi] = useState(null)
  const [deathForm, setDeathForm] = useState({
    deathDate: today(), deathCause: KOI_DEATH_CAUSES[0], deathPhoto: null, notes: '',
  })
  const [refundKoi, setRefundKoi] = useState(null)
  const [refundReason, setRefundReason] = useState('')
  const [saving, setSaving] = useState(false)

  const pondNames = useMemo(
    () => mergePondNames(FARM_POND_NAMES, registeredPondNames, koiList.map((k) => k.pondName)),
    [koiList, registeredPondNames],
  )

  const filteredList = koiList.filter((k) => {
    if (!isAppVisibleKoiFarm(k)) return false
    const q = search.toLowerCase()
    const matchSearch = !q || [k.name, k.variety, k.pondName, k.id].some((x) => String(x || '').toLowerCase().includes(q))
    const matchStatus = statusFilter === 'stock'
      ? k.status !== KOI_STATUS.SOLD && k.status !== KOI_STATUS.DECEASED
      : k.status === statusFilter
    const matchVariety = varietyFilter === 'all' || k.variety === varietyFilter
    const matchPond = pondFilter === 'all' || k.pondName === pondFilter
    return matchSearch && matchStatus && matchVariety && matchPond
  })
  const koiPage = usePagination(filteredList, LIST_PAGE_SIZE, `${search}-${statusFilter}-${varietyFilter}-${pondFilter}`)

  const counts = useMemo(() => ({
    available: koiList.filter((k) => k.status === KOI_STATUS.AVAILABLE).length,
    sold: koiList.filter((k) => k.status === KOI_STATUS.SOLD).length,
    sick: koiList.filter((k) => k.status === KOI_STATUS.SICK).length,
    deceased: koiList.filter((k) => k.status === KOI_STATUS.DECEASED && isAppVisibleKoiFarm(k)).length,
  }), [koiList])

  const soldFish = koiList.filter((k) => k.status === KOI_STATUS.SOLD)
  const stockCount = koiList.filter((k) => k.status !== KOI_STATUS.SOLD).length

  const openRefund = (koi) => {
    if (!canRefund) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Refund sales" permission. Contact the farm owner.' })
      return
    }
    setRefundKoi(koi)
    setRefundReason('')
  }

  const confirmRefund = () => {
    if (!refundKoi) return
    if (!canRefund) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Refund sales" permission. Contact the farm owner.' })
      return
    }
    onKoiRefund?.(refundKoi, { reason: refundReason })
    if (viewKoi?.id === refundKoi.id) setViewKoi(null)
    setRefundKoi(null)
    setRefundReason('')
  }

  const refundLinkedInvoices = refundKoi
    ? findLinkedKoiInvoices(invoices, refundKoi.id).filter(
      (inv) => !['cancelled', 'paid'].includes(getInvoiceStatus(inv)),
    )
    : []

  const notifyImageError = (message) => {
    addNotification({ type: 'error', title: 'Photo Upload Failed', message })
  }

  const addKoi = async () => {
    if (!canEdit) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Edit records" permission. Contact the farm owner.' })
      return
    }
    const check = validateKoiFormFields(form)
    if (!check.ok) {
      addNotification({ type: 'error', title: 'Invalid Koi', message: check.message })
      return
    }
    if (saving) return
    const sizeCm = normalizeKoiSizeField(form.size)
    const id = genId('KOI')
    try {
      setSaving(true)
      const koiBase = touchUpdatedAt({
        ...form,
        id,
        photo: null,
        name: form.name?.trim() || '',
        pondName: form.pondName.trim(),
        size: sizeCm,
        price: Number(form.price) || 0,
        dateAdded: today(),
        status: KOI_STATUS.AVAILABLE,
        soldTo: null, soldDate: null, soldPrice: null,
        sellDisposition: null, keepPondName: null,
        deathDate: null, deathCause: null, deathPhoto: null,
      })
      await persistKoiFishList([...koiList, koiBase])

      const photo = await uploadInlinePhotoIfNeeded(
        form.photo,
        (data) => db.uploadKoiFishPhoto(id, data, 'photo'),
      )
      const koi = touchUpdatedAt({ ...koiBase, photo })
      const nextList = [...koiList, koi]
      await persistKoiFishList(nextList)
      setKoiList(nextList)
      addNotification({ type: 'success', title: 'Koi Added', message: `${koi.variety} added to ${koi.pondName}` })
      setShowAdd(false)
      setForm(emptyKoiForm())
    } catch (err) {
      notifyImageError(err?.message || 'Could not save koi with photo.')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!editKoi) return
    if (!canEdit) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Edit records" permission. Contact the farm owner.' })
      return
    }
    if (editKoi.status === KOI_STATUS.SOLD || editKoi.status === KOI_STATUS.DECEASED) {
      addNotification({
        type: 'error',
        title: 'Cannot Edit',
        message: 'Sold or deceased fish cannot be edited here. Use Refund or view the death record.',
      })
      return
    }
    const check = validateKoiFormFields(editKoi)
    if (!check.ok) {
      addNotification({ type: 'error', title: 'Invalid Koi', message: check.message })
      return
    }
    if (saving) return
    const sizeCm = normalizeKoiSizeField(editKoi.size)
    try {
      setSaving(true)
      const photo = await uploadInlinePhotoIfNeeded(
        editKoi.photo,
        (data) => db.uploadKoiFishPhoto(editKoi.id, data, 'photo'),
      )
      const updated = touchUpdatedAt({
        ...editKoi,
        photo,
        name: editKoi.name?.trim() || '',
        pondName: editKoi.pondName.trim(),
        size: sizeCm,
        price: Number(editKoi.price) || 0,
        soldTo: null,
        soldDate: null,
        soldPrice: null,
        sellDisposition: null,
        keepPondName: null,
      })
      const nextList = koiList.map((k) => (sameKoiId(k.id, editKoi.id) ? updated : k))
      await persistKoiFishList(nextList)
      setKoiList(nextList)
      addNotification({ type: 'success', title: 'Updated', message: `${editKoi.id} saved` })
      setEditKoi(null)
    } catch (err) {
      notifyImageError(err?.message || 'Could not save koi photo.')
    } finally {
      setSaving(false)
    }
  }

  const setKoiStatus = (koi, status) => {
    if (!canEdit) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Edit records" permission. Contact the farm owner.' })
      return
    }
    setKoiList((prev) => prev.map((k) => (sameKoiId(k.id, koi.id) ? touchUpdatedAt({ ...k, status }) : k)))
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
    if (!canEdit) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Edit records" permission. Contact the farm owner.' })
      return
    }
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
    setKoiList((prev) => prev.map((k) => (sameKoiId(k.id, shipKoi.id) ? touchUpdatedAt({ ...k, pondName: to }) : k)))
    addNotification({ type: 'success', title: 'Pond Transfer', message: `${shipKoi.name || shipKoi.variety} moved ${from} → ${to}` })
    setShipKoi(null)
    setShipToPond('')
  }

  const confirmSell = async () => {
    if (!canEdit) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Edit records" permission. Contact the farm owner.' })
      return
    }
    if (!sellKoi || saving) return
    const currentKoi = koiList.find((k) => sameKoiId(k.id, sellKoi.id)) || sellKoi
    const customer = customers.find((c) => String(c.id) === String(sellForm.customerId))
    if (!customer) {
      addNotification({ type: 'error', title: 'Customer Not Found', message: 'Selected customer is no longer in the list.' })
      return
    }
    const saleCheck = validateKoiSaleForm({
      customerId: sellForm.customerId,
      disposition: sellForm.disposition,
      keepPondName: sellForm.keepPondName,
      soldPrice: sellForm.soldPrice,
      soldDate: sellForm.soldDate,
      koi: currentKoi,
    })
    if (!saleCheck.ok) {
      addNotification({ type: 'error', title: 'Cannot Complete Sale', message: saleCheck.message })
      return
    }
    const soldPrice = saleCheck.soldPrice
    const soldDate = saleCheck.soldDate
    const keepPondName = sellForm.keepPondName?.trim() || ''
    const soldPatch = buildSoldKoiPatch(currentKoi, {
      customerId: customer.id,
      soldPrice,
      soldDate,
      disposition: sellForm.disposition,
      keepPondName,
    })
    const nextList = koiList.map((k) => (sameKoiId(k.id, currentKoi.id) ? soldPatch : k))
    setKoiList(nextList)
    setStatusFilter('sold')
    await onKoiSold?.(currentKoi, customer, soldPrice, soldDate, {
      disposition: sellForm.disposition,
      keepPondName,
    })
    const dispositionNote = sellForm.disposition === 'keep'
      ? `kept at ${keepPondName} — added to Customer Koi`
      : 'taken away by customer'
    addNotification({
      type: 'success',
      title: 'Koi Sold',
      message: `${currentKoi.id} sold to ${customer?.name || 'customer'} for ${formatSGD(soldPrice)} (${dispositionNote})`,
    })
    if (sellForm.createInvoice) {
      onCreateInvoiceFromSale?.({
        customerId: String(customer.id),
        customerName: customer.name,
        manualCustomer: false,
        items: [{
          name: formatKoiInvoiceLineName(currentKoi),
          qty: 1,
          price: soldPrice,
          productId: '',
          manual: false,
          koiId: currentKoi.id,
          koiDisposition: sellForm.disposition,
          keepPondName: sellForm.disposition === 'keep' ? keepPondName : '',
          koiAlreadySold: true,
        }],
        notes: `Koi sale — ${currentKoi.name || currentKoi.variety} (${currentKoi.id})`,
        due: soldDate,
        discountType: 'none',
        discountValue: '',
      })
    }
    setSellKoi(null)
    if (isSupabaseConfigured) {
      try {
        setSaving(true)
        await persistKoiFishList(nextList)
      } catch (err) {
        addNotification({
          type: 'warning',
          title: 'Cloud Sync Pending',
          message: err?.message || 'Sale saved on this device. Retry cloud sync when online.',
        })
      } finally {
        setSaving(false)
      }
    }
  }

  const confirmDeath = async () => {
    if (!deathKoi) return
    if (!canEdit) {
      addNotification?.({ type: 'error', title: 'Permission Denied', message: 'You need the "Edit records" permission. Contact the farm owner.' })
      return
    }
    if (deathKoi.status === KOI_STATUS.SOLD) {
      addNotification({
        type: 'error',
        title: 'Cannot Record Death',
        message: 'This fish is marked sold. Refund the sale first if the fish died after purchase.',
      })
      return
    }
    if (!deathForm.deathDate?.trim()) {
      addNotification({ type: 'error', title: 'Date Required', message: 'Choose the date of death.' })
      return
    }
    if (saving) return
    try {
      setSaving(true)
      const deathPhoto = await uploadInlinePhotoIfNeeded(
        deathForm.deathPhoto,
        (data) => db.uploadKoiFishPhoto(deathKoi.id, data, 'death_photo'),
      )
      const patch = buildDeceasedKoiPatch(deathKoi, { ...deathForm, deathPhoto })
      const nextList = koiList.map((k) => (sameKoiId(k.id, deathKoi.id) ? patch : k))
      await persistKoiFishList(nextList)
      setKoiList(nextList)
      addNotification({ type: 'warning', title: 'Death Recorded', message: `${deathKoi.name || deathKoi.variety} recorded as deceased` })
      setDeathKoi(null)
      setDeathForm({ deathDate: today(), deathCause: KOI_DEATH_CAUSES[0], deathPhoto: null, notes: '' })
    } catch (err) {
      notifyImageError(err?.message || 'Could not save death photo.')
    } finally {
      setSaving(false)
    }
  }

  const customerName = (id) => customers.find((c) => String(c.id) === String(id))?.name || '—'
  const fabHidden = !canEdit || showAdd || !!editKoi || !!viewKoi || !!sellKoi || !!shipKoi || !!deathKoi || !!refundKoi

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          <Fish className="text-cyan-400" />Koi Fish Inventory
          <Badge className="bg-cyan-500/20 text-cyan-300">{stockCount}</Badge>
        </h2>
        <p className="text-slate-400 text-sm">Farm stock · pond transfers · sales · refunds</p>
      </div>
      <Fab onClick={() => { setForm(emptyKoiForm()); setShowAdd(true) }} label="Add Koi" hidden={fabHidden} />

      <div className="flex flex-wrap gap-2 text-xs">
        {[
          ['available', counts.available, 'text-emerald-400'],
          ['sold', counts.sold, 'text-blue-400'],
          ['sick', counts.sick, 'text-red-400'],
          ['deceased', counts.deceased, 'text-slate-400'],
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
        {[
          ['stock', 'Stock'],
          ['available', 'Available'],
          ['sold', 'Sold'],
          ['sick', 'Sick'],
          ['deceased', 'Deceased'],
        ].map(([s, label]) => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)}
            className={`px-3 py-2 rounded-lg text-xs font-bold shrink-0 ${statusFilter === s ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredList.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <EmptyState
              emoji="🐠"
              title={koiList.length === 0
                ? 'No koi fish yet'
                : statusFilter === 'sold' && soldFish.length === 0
                  ? 'No sold fish on record'
                  : 'No koi match your filters'}
              hint={koiList.length === 0 ? 'Tap Add Koi to register stock' : 'Try a different status or search'}
              actionLabel={koiList.length === 0 && canEdit ? 'Add Koi' : undefined}
              onAction={koiList.length === 0 && canEdit ? () => { setForm(emptyKoiForm()); setShowAdd(true) } : undefined}
            />
          </Card>
        ) : koiPage.paginatedItems.map((k) => {
          const st = STATUS_STYLE[k.status] || STATUS_STYLE.available
          return (
            <Card key={k.id} className={`overflow-hidden ${st.border}`}>
              <div className="relative aspect-square bg-slate-900">
                {k.photo ? (
                  <StoredImage
                    src={k.photo}
                    alt={k.name || k.variety}
                    className={`w-full h-full object-contain ${k.status === KOI_STATUS.DECEASED ? 'grayscale' : ''}`}
                    entity="koi_fish"
                    recordId={k.id}
                    field="photo"
                    onRefresh={refreshKoiImage}
                  />
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
                  {k.status === KOI_STATUS.SOLD || hasLinkedCustomerKoiForRefund(customerKoiList, k.id) ? (
                    canRefund && (
                      <Btn variant="secondary" size="sm" onClick={() => openRefund(k)}>
                        <Undo2 size={12} />
                        {k.status === KOI_STATUS.SOLD ? 'Refund' : 'Reverse keep'}
                      </Btn>
                    )
                  ) : (
                    canEdit && <Btn variant="ghost" size="sm" onClick={() => setEditKoi({ ...k })}><Edit2 size={12} />Edit</Btn>
                  )}
                  {canEdit && STOCK_STATUSES.includes(k.status) && (
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
                          createInvoice: true,
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
                      <Btn
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setDeathKoi(k)
                          setDeathForm({ deathDate: today(), deathCause: KOI_DEATH_CAUSES[0], deathPhoto: null, notes: '' })
                        }}
                      >
                        <Skull size={12} />Death
                      </Btn>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      <PaginationControls {...koiPage} />

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Koi" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PhotoPicker photo={form.photo} onPick={(p) => setForm((f) => ({ ...f, photo: p }))} onError={notifyImageError} className="sm:col-span-2" />
          <Input label="Fish name (optional)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Select label="Variety" value={form.variety} onChange={(e) => setForm((f) => ({ ...f, variety: e.target.value }))} options={KOI_VARIETIES.map((v) => ({ value: v, label: v }))} />
          <Input label="Size (cm, optional)" type="number" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} min="1" step="0.1" placeholder="e.g. 28" />
          <PondNameInput value={form.pondName} onChange={(e) => setForm((f) => ({ ...f, pondName: e.target.value }))} extraNames={registeredPondNames} required />
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
              <PhotoPicker photo={editKoi.photo} onPick={(p) => setEditKoi((k) => ({ ...k, photo: p }))} onError={notifyImageError} className="sm:col-span-2" />
              <Input label="Name (optional)" value={editKoi.name} onChange={(e) => setEditKoi((k) => ({ ...k, name: e.target.value }))} />
              <Select label="Variety" value={editKoi.variety} onChange={(e) => setEditKoi((k) => ({ ...k, variety: e.target.value }))}
                options={KOI_VARIETIES.map((v) => ({ value: v, label: v }))} />
              <Input label="Size (cm, optional)" type="number" value={editKoi.size ?? ''} onChange={(e) => setEditKoi((k) => ({ ...k, size: e.target.value }))} min="1" step="0.1" />
              <Select label="Status" value={editKoi.status} onChange={(e) => setEditKoi((k) => ({ ...k, status: e.target.value }))}
                options={KOI_EDIT_STATUS_OPTIONS} />
              <PondNameInput value={editKoi.pondName} onChange={(e) => setEditKoi((k) => ({ ...k, pondName: e.target.value }))} extraNames={registeredPondNames} required />
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

      <Modal
        open={!!shipKoi}
        onClose={() => { setShipKoi(null); setShipToPond('') }}
        title="Ship to Pond"
        size="sm"
        footer={shipKoi && (
          <ConfirmModalFooter onCancel={() => { setShipKoi(null); setShipToPond('') }}>
            <Btn onClick={confirmShip} className="w-full sm:w-auto justify-center"><Truck size={14} />Move Fish</Btn>
          </ConfirmModalFooter>
        )}
      >
        {shipKoi && (
          <>
            <div className="flex gap-3 mb-4">
              {shipKoi.photo ? (
                <StoredImage src={shipKoi.photo} alt="" className="w-16 h-16 rounded-lg object-contain bg-slate-900" entity="koi_fish" recordId={shipKoi.id} field="photo" onRefresh={refreshKoiImage} />
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
              extraNames={registeredPondNames}
              required
            />
            <p className="text-slate-500 text-xs mt-2">Transfer fish between ponds — e.g. D1 → A1 or to quarantine.</p>
          </>
        )}
      </Modal>

      <Modal open={!!sellKoi} onClose={() => setSellKoi(null)} title="Mark Koi Sold" size="md">
        {sellKoi && (
          <>
            <div className="flex gap-3 mb-4">
              {sellKoi.photo ? <StoredImage src={sellKoi.photo} alt="" className="w-20 h-20 rounded-lg object-contain bg-slate-900" entity="koi_fish" recordId={sellKoi.id} field="photo" onRefresh={refreshKoiImage} /> : <div className="w-20 h-20 rounded-lg bg-slate-800 flex items-center justify-center"><Fish size={24} /></div>}
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
                extraNames={registeredPondNames}
                className="mt-3"
                required
              />
            )}
            <Input label="Sold price (S$)" type="number" value={sellForm.soldPrice} onChange={(e) => setSellForm((f) => ({ ...f, soldPrice: e.target.value }))} step="0.01" className="mt-3" />
            <Input label="Sold date" type="date" value={sellForm.soldDate} onChange={(e) => setSellForm((f) => ({ ...f, soldDate: e.target.value }))} className="mt-3" />
            <label className="flex items-center gap-2.5 mt-4 cursor-pointer touch-manipulation">
              <input
                type="checkbox"
                checked={sellForm.createInvoice}
                onChange={(e) => setSellForm((f) => ({ ...f, createInvoice: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500/50"
              />
              <span className="text-sm text-slate-300">Create invoice for this sale</span>
            </label>
            <p className="text-xs text-slate-500 mt-1 ml-6">
              {sellForm.createInvoice
                ? 'After confirm, Invoices opens with this fish pre-filled.'
                : 'Invoice will not be created — only the sale is recorded.'}
            </p>
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setSellKoi(null)}>Cancel</Btn>
              <Btn variant="success" onClick={confirmSell} disabled={customers.length === 0 || saving}><ShoppingBag size={14} />{saving ? 'Saving…' : 'Confirm Sale'}</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!deathKoi} onClose={() => setDeathKoi(null)} title="Record Fish Death" size="md">
        {deathKoi && (
          <div className="border border-red-500/30 rounded-xl p-4 space-y-3">
            <p className="text-red-300 text-sm">Record death for {deathKoi.name || deathKoi.variety} · {deathKoi.pondName}</p>
            <Input label="Date of death" type="date" value={deathForm.deathDate} onChange={(e) => setDeathForm((f) => ({ ...f, deathDate: e.target.value }))} required />
            <Select label="Cause" value={deathForm.deathCause} onChange={(e) => setDeathForm((f) => ({ ...f, deathCause: e.target.value }))}
              options={KOI_DEATH_CAUSES.map((c) => ({ value: c, label: c }))} />
            <PhotoPicker photo={deathForm.deathPhoto} onPick={(p) => setDeathForm((f) => ({ ...f, deathPhoto: p }))} onError={notifyImageError} label="Death photo (optional)" />
            <Textarea label="Notes" value={deathForm.notes} onChange={(e) => setDeathForm((f) => ({ ...f, notes: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setDeathKoi(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmDeath}><Skull size={14} />Record Death</Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!refundKoi} onClose={() => { setRefundKoi(null); setRefundReason('') }} title="Refund Koi Sale" size="md">
        {refundKoi && (
          <div className="space-y-4">
            <div className="flex gap-3">
              {refundKoi.photo ? (
                <StoredImage src={refundKoi.photo} alt="" className="w-16 h-16 rounded-lg object-contain bg-slate-900" entity="koi_fish" recordId={refundKoi.id} field="photo" onRefresh={refreshKoiImage} />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center"><Fish size={20} /></div>
              )}
              <div>
                <p className="text-white font-bold">{refundKoi.name || refundKoi.variety}</p>
                <p className="text-slate-400 text-sm">{refundKoi.id} · {customerName(refundKoi.soldTo)}</p>
                <p className="text-emerald-400 font-bold text-sm">{formatSGD(refundKoi.soldPrice)}</p>
              </div>
            </div>
            <p className="text-slate-400 text-sm">
              {refundKoi.status === KOI_STATUS.SOLD ? (
                <>This returns the fish to <span className="text-cyan-300">available</span> stock, removes any linked Customer Koi record, and logs the refund in notes.</>
              ) : (
                <>This removes the linked <span className="text-cyan-300">Customer Koi</span> record for this keep-at-farm sale. The fish stays in farm stock.</>
              )}
            </p>
            {refundLinkedInvoices.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-200 text-sm">
                <p className="font-semibold mb-1">Linked invoices still open</p>
                <p className="text-xs text-amber-200/90">
                  Cancel or adjust manually: {refundLinkedInvoices.map((inv) => inv.id).join(', ')}
                </p>
              </div>
            )}
            <Textarea
              label="Refund reason (optional)"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Customer returned fish, wrong sale recorded"
              rows={2}
            />
            <div className="modal-actions flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => { setRefundKoi(null); setRefundReason('') }}>Cancel</Btn>
              <Btn variant="danger" onClick={confirmRefund}><Undo2 size={14} />Confirm Refund</Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!viewKoi} onClose={() => setViewKoi(null)} title={viewKoi?.id} size="lg">
        {viewKoi && (
          <div className="space-y-4">
            <KoiPhoto src={viewKoi.photo} alt={viewKoi.name || viewKoi.variety} className="w-full aspect-square max-h-80 rounded-xl" recordId={viewKoi.id} onRefresh={refreshKoiImage} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[['Variety', viewKoi.variety], ['Size', formatKoiSize(viewKoi.size)], ['Pond', viewKoi.pondName], ['Price', formatSGD(viewKoi.price)], ['Status', viewKoi.status]].map(([k, v]) => (
                <div key={k}><p className="text-slate-500 text-xs">{k}</p><p className="text-white">{v}</p></div>
              ))}
            </div>
            {viewKoi.status === 'sold' && (
              <Card className="p-3 border-blue-500/30 space-y-3">
                <div>
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
                </div>
                {canRefund && (
                  <Btn variant="secondary" onClick={() => openRefund(viewKoi)} className="w-full justify-center">
                    <Undo2 size={14} />Refund Sale
                  </Btn>
                )}
              </Card>
            )}
            {viewKoi.status === KOI_STATUS.DECEASED && (
              <Card className="p-3 border-red-500/40">
                <p className="text-red-300 text-xs font-bold mb-2">Death record</p>
                <p className="text-sm text-white">{viewKoi.deathDate} — {viewKoi.deathCause}</p>
                {viewKoi.deathPhoto && (
                  <StoredImage
                    src={viewKoi.deathPhoto}
                    alt=""
                    className="mt-2 rounded-lg max-h-40 border border-red-500/50 object-contain bg-slate-900"
                    entity="koi_fish"
                    recordId={viewKoi.id}
                    field="death_photo"
                    onRefresh={refreshKoiImage}
                  />
                )}
              </Card>
            )}
            {viewKoi.notes && <p className="text-slate-400 text-sm">{viewKoi.notes}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}
