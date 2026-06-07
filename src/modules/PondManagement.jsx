import { useMemo, useState } from 'react'
import {
  Droplets, AlertTriangle, Beaker, Bell, BookOpen, Trash2, Check, Edit2, Calculator,
} from 'lucide-react'
import PondCalculator from './PondCalculator'
import {
  POND_TYPES, MAINTENANCE_TYPES, DEFAULT_TREATMENT_GUIDES, genId, today,
} from '../data/constants'
import { Badge, Btn, Card, Input, Modal, PondNameInput, Select, Textarea } from '../components/ui'
import Fab from '../components/Fab'
import { filterPondLogsForApp } from '../lib/retention'

const POND_TYPE_COLOR = { koi: 'bg-cyan-500/20 text-cyan-300', arowana: 'bg-amber-500/20 text-amber-300', quarantine: 'bg-red-500/20 text-red-300', display: 'bg-purple-500/20 text-purple-300' }

function daysSince(dateStr) {
  if (!dateStr) return 999
  const d = new Date(`${dateStr}T12:00:00`)
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

function paramColor(kind, value) {
  if (value == null || value === '') return 'text-slate-500'
  const v = Number(value)
  if (Number.isNaN(v)) return 'text-slate-500'
  if (kind === 'ph') return v >= 6.8 && v <= 7.5 ? 'text-emerald-400' : 'text-amber-400'
  if (kind === 'ammonia') return v === 0 ? 'text-emerald-400' : v <= 0.25 ? 'text-amber-400' : 'text-red-400'
  if (kind === 'nitrite') return v === 0 ? 'text-emerald-400' : 'text-red-400'
  return 'text-white'
}

export default function PondManagement({ pondData, setPondData, addNotification, currentUser, canEdit = false, canDelete = false }) {
  const { ponds, maintenanceLogs, treatmentLogs, reminders, treatmentGuides } = pondData
  const visiblePond = useMemo(() => filterPondLogsForApp(pondData), [pondData])
  const denyEdit = () => addNotification({ type: 'error', title: 'Permission Denied', message: 'You need the "Edit records" permission. Contact the farm owner.' })
  const denyDelete = () => addNotification({ type: 'error', title: 'Permission Denied', message: 'You need the "Delete records" permission. Contact the farm owner.' })

  const [tab, setTab] = useState('ponds')
  const [showAddPond, setShowAddPond] = useState(false)
  const [editPond, setEditPond] = useState(null)
  const [pondForm, setPondForm] = useState({ name: '', type: 'koi', volume: '', notes: '' })
  const [maintModal, setMaintModal] = useState(null)
  const [treatModal, setTreatModal] = useState(null)
  const [remindModal, setRemindModal] = useState(null)
  const [guideModal, setGuideModal] = useState(null)
  const [pondFilter, setPondFilter] = useState('all')

  const [maintForm, setMaintForm] = useState({ pondId: '', type: 'water_test', date: today(), notes: '', showParams: true, pH: '', ammonia: '', nitrite: '', saltLevel: '' })
  const [treatForm, setTreatForm] = useState({ pondId: '', medicine: '', dosage: '', reason: '', startDate: today(), endDate: '', waterChangeBefore: false, notes: '' })
  const [remindForm, setRemindForm] = useState({ pondId: '', type: 'water_test', dueDate: today(), dueTime: '09:00', note: '', repeat: 'none' })
  const [guideForm, setGuideForm] = useState({ title: '', category: '', steps: '', warning: '' })
  const [editingGuideId, setEditingGuideId] = useState(null)

  const todayStr = today()
  const activeTreatments = treatmentLogs.filter((t) => t.startDate <= todayStr && (!t.endDate || t.endDate >= todayStr))
  const overdueReminders = visiblePond.reminders.filter((r) => r.status === 'pending' && r.dueDate < todayStr)
  const pendingReminders = visiblePond.reminders.filter((r) => r.status === 'pending' && r.dueDate >= todayStr)

  const update = (patch) => setPondData((prev) => ({ ...prev, ...patch }))
  const hasPonds = ponds.length > 0

  const displayGuides = treatmentGuides.length ? treatmentGuides : DEFAULT_TREATMENT_GUIDES

  const ensureGuidesMutable = () => (treatmentGuides.length ? treatmentGuides : [...DEFAULT_TREATMENT_GUIDES])

  const pondSaltLevel = (pond) => pond.lastSalt ?? pond.lastTemp

  const syncPondNameInLogs = (pondId, pondName) => ({
    maintenanceLogs: maintenanceLogs.map((l) => (l.pondId === pondId ? { ...l, pondName } : l)),
    treatmentLogs: treatmentLogs.map((l) => (l.pondId === pondId ? { ...l, pondName } : l)),
    reminders: reminders.map((r) => (r.pondId === pondId ? { ...r, pondName } : r)),
  })

  const addPond = () => {
    const name = pondForm.name?.trim()
    if (!name) {
      addNotification({ type: 'error', title: 'Pond Name Required', message: 'Select or enter a pond name.' })
      return
    }
    if (ponds.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      addNotification({ type: 'warning', title: 'Duplicate Pond', message: `${name} is already in the pond list.` })
      return
    }
    if (+pondForm.volume < 0) {
      addNotification({ type: 'error', title: 'Invalid Volume', message: 'Volume cannot be negative.' })
      return
    }
    update({ ponds: [...ponds, { ...pondForm, name, id: genId('POND'), volume: +pondForm.volume || 0, lastpH: null, lastAmmonia: null, lastNitrite: null, lastSalt: null, lastChecked: null }] })
    addNotification({ type: 'success', title: 'Pond Added', message: `${name} added to pond list.` })
    setShowAddPond(false)
    setPondForm({ name: '', type: 'koi', volume: '', notes: '' })
  }

  const saveMaint = () => {
    if (!hasPonds) {
      addNotification({ type: 'error', title: 'No Ponds', message: 'Add a pond before logging maintenance.' })
      return
    }
    const pond = ponds.find((p) => p.id === maintForm.pondId)
    if (!pond) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Select which pond this maintenance is for.' })
      return
    }
    const log = { ...maintForm, id: genId('MAINT'), pondName: pond.name, performedBy: currentUser?.name || '' }
    let nextPonds = ponds
    const hasParams = maintForm.showParams && [maintForm.pH, maintForm.ammonia, maintForm.nitrite, maintForm.saltLevel].some((v) => v !== '' && v != null)
    if (hasParams) {
      nextPonds = ponds.map((p) => (p.id === pond.id ? {
        ...p,
        lastpH: maintForm.pH !== '' ? +maintForm.pH : p.lastpH,
        lastAmmonia: maintForm.ammonia !== '' ? +maintForm.ammonia : p.lastAmmonia,
        lastNitrite: maintForm.nitrite !== '' ? +maintForm.nitrite : p.lastNitrite,
        lastSalt: maintForm.saltLevel !== '' ? +maintForm.saltLevel : p.lastSalt,
        lastChecked: maintForm.date,
      } : p))
    }
    update({ ponds: nextPonds, maintenanceLogs: [log, ...maintenanceLogs] })
    addNotification({ type: 'success', title: 'Logged', message: `Maintenance recorded for ${pond.name}` })
    setMaintModal(null)
  }

  const saveTreatment = () => {
    if (!hasPonds) {
      addNotification({ type: 'error', title: 'No Ponds', message: 'Add a pond before logging treatment.' })
      return
    }
    const pond = ponds.find((p) => p.id === treatForm.pondId)
    if (!pond) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Select which pond to treat.' })
      return
    }
    if (!treatForm.medicine?.trim()) {
      addNotification({ type: 'error', title: 'Medicine Required', message: 'Enter the medicine or treatment name.' })
      return
    }
    if (treatForm.endDate && treatForm.startDate && treatForm.endDate < treatForm.startDate) {
      addNotification({ type: 'error', title: 'Invalid Dates', message: 'End date cannot be before start date.' })
      return
    }
    const log = { ...treatForm, medicine: treatForm.medicine.trim(), id: genId('TREAT'), pondName: pond.name, performedBy: currentUser?.name || '' }
    update({ treatmentLogs: [log, ...treatmentLogs] })
    addNotification({ type: 'info', title: 'Treatment Started', message: `${treatForm.medicine} in ${pond.name}` })
    setTreatModal(null)
  }

  const saveReminder = () => {
    if (!hasPonds) {
      addNotification({ type: 'error', title: 'No Ponds', message: 'Add a pond before creating a reminder.' })
      return
    }
    const pond = ponds.find((p) => p.id === remindForm.pondId)
    if (!pond) {
      addNotification({ type: 'error', title: 'Pond Required', message: 'Select which pond this reminder is for.' })
      return
    }
    if (!remindForm.dueDate) {
      addNotification({ type: 'error', title: 'Date Required', message: 'Choose a due date for the reminder.' })
      return
    }
    update({ reminders: [...reminders, { ...remindForm, id: genId('REM'), pondName: pond.name, status: 'pending' }] })
    addNotification({ type: 'success', title: 'Reminder Set', message: `${pond.name} — ${MAINTENANCE_TYPES.find((m) => m.value === remindForm.type)?.label || remindForm.type}` })
    setRemindModal(null)
  }

  const openAddGuide = () => {
    if (!canEdit) { denyEdit(); return }
    setEditingGuideId(null)
    setGuideForm({ title: '', category: '', steps: '', warning: '' })
    setGuideModal(true)
  }

  const openEditGuide = (guide) => {
    if (!canEdit) { denyEdit(); return }
    setEditingGuideId(guide.id)
    setGuideForm({
      title: guide.title || '',
      category: guide.category || '',
      steps: guide.steps || '',
      warning: guide.warning || '',
    })
    setGuideModal(true)
  }

  const saveGuide = () => {
    if (!canEdit) { denyEdit(); return }
    if (!guideForm.title?.trim()) {
      addNotification({ type: 'error', title: 'Title Required', message: 'Enter a guide title.' })
      return
    }
    const payload = {
      title: guideForm.title.trim(),
      category: guideForm.category?.trim() || '',
      steps: guideForm.steps?.trim() || '',
      warning: guideForm.warning?.trim() || '',
    }
    const guides = ensureGuidesMutable()
    if (editingGuideId) {
      update({
        treatmentGuides: guides.map((g) => (g.id === editingGuideId ? { ...g, ...payload } : g)),
      })
      addNotification({ type: 'success', title: 'Guide Updated', message: payload.title })
    } else {
      update({ treatmentGuides: [...guides, { ...payload, id: genId('GUIDE') }] })
      addNotification({ type: 'success', title: 'Guide Added', message: payload.title })
    }
    setGuideModal(null)
    setEditingGuideId(null)
    setGuideForm({ title: '', category: '', steps: '', warning: '' })
  }

  const deleteGuide = (guideId) => {
    if (!canDelete) { denyDelete(); return }
    const guides = ensureGuidesMutable().filter((g) => g.id !== guideId)
    update({ treatmentGuides: guides })
    addNotification({ type: 'info', title: 'Guide Removed', message: 'Treatment guide deleted.' })
  }

  const filteredLogs = visiblePond.maintenanceLogs.filter((l) => pondFilter === 'all' || l.pondId === pondFilter)

  const openNewMaint = () => {
    setMaintForm({ pondId: ponds[0]?.id || '', type: 'water_test', date: today(), notes: '', showParams: true, pH: '', ammonia: '', nitrite: '', saltLevel: '' })
    setMaintModal('new')
  }

  const openNewTreatment = () => {
    setTreatForm({ pondId: ponds[0]?.id || '', medicine: '', dosage: '', reason: '', startDate: today(), endDate: '', waterChangeBefore: false, notes: '' })
    setTreatModal('new')
  }

  const openNewReminder = () => {
    setRemindForm({ pondId: ponds[0]?.id || '', type: 'water_test', dueDate: today(), dueTime: '09:00', note: '', repeat: 'none' })
    setRemindModal('new')
  }

  const saveEditPond = () => {
    if (!editPond) return
    if (!canEdit) { denyEdit(); return }
    const name = editPond.name?.trim()
    if (!name) {
      addNotification({ type: 'error', title: 'Pond Name Required', message: 'Enter a pond name.' })
      return
    }
    const duplicate = ponds.some((p) => p.id !== editPond.id && p.name.trim().toLowerCase() === name.toLowerCase())
    if (duplicate) {
      addNotification({ type: 'warning', title: 'Duplicate Pond', message: `${name} is already in the pond list.` })
      return
    }
    const prev = ponds.find((p) => p.id === editPond.id)
    const updated = {
      ...editPond,
      name,
      volume: +editPond.volume || 0,
      notes: editPond.notes?.trim() || '',
    }
    const patch = {
      ponds: ponds.map((p) => (p.id === editPond.id ? updated : p)),
      ...(prev && prev.name !== name ? syncPondNameInLogs(editPond.id, name) : {}),
    }
    update(patch)
    addNotification({ type: 'success', title: 'Pond Updated', message: `${name} saved` })
    setEditPond(null)
  }

  const tabs = ['ponds', 'calculator', 'maintenance', 'treatments', 'reminders', 'guide']

  const fabByTab = {
    ponds: { onClick: () => setShowAddPond(true), label: 'Add Pond' },
    maintenance: { onClick: openNewMaint, label: 'Log Maintenance', disabled: !hasPonds },
    treatments: { onClick: openNewTreatment, label: 'Log Treatment', disabled: !hasPonds },
    reminders: { onClick: openNewReminder, label: 'Add Reminder', disabled: !hasPonds, icon: Bell },
    guide: canEdit ? { onClick: openAddGuide, label: 'Add Guide' } : null,
  }
  const fabAction = fabByTab[tab]
  const pondModalOpen = showAddPond || !!editPond || !!maintModal || !!treatModal || !!remindModal || !!guideModal

  return (
    <div className="space-y-4 pb-20 lg:pb-12">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2"><Droplets className="text-cyan-400" />Pond Management</h2>
        <p className="text-slate-400 text-sm">Volume & salt calculator · maintenance · treatments</p>
      </div>
      {fabAction && <Fab {...fabAction} hidden={pondModalOpen} />}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-3 py-2 rounded-lg text-xs font-bold capitalize shrink-0 flex items-center gap-1.5 ${tab === t ? 'bg-cyan-500 text-slate-900' : 'bg-slate-700 text-slate-300'}`}>
            {t === 'calculator' && <Calculator size={12} />}
            {t === 'guide' ? 'Treatment Guide' : t === 'calculator' ? 'Calculator' : t}
          </button>
        ))}
      </div>

      {(overdueReminders.length > 0 || activeTreatments.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {overdueReminders.length > 0 && (
            <Badge className="bg-red-500/20 text-red-300">{overdueReminders.length} overdue reminder{overdueReminders.length > 1 ? 's' : ''}</Badge>
          )}
          {activeTreatments.length > 0 && (
            <Badge className="bg-amber-500/20 text-amber-300">{activeTreatments.length} active treatment{activeTreatments.length > 1 ? 's' : ''}</Badge>
          )}
        </div>
      )}

      {tab === 'ponds' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ponds.length === 0 ? (
            <Card className="p-8 text-center text-slate-500 md:col-span-2 xl:col-span-3">
              No ponds yet — tap Add Pond to register A1, B2, quarantine tanks, etc.
            </Card>
          ) : ponds.map((p) => {
            const days = daysSince(p.lastChecked)
            return (
              <Card key={p.id} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-white font-bold text-lg">{p.name}</h3>
                  <Badge className={POND_TYPE_COLOR[p.type] || POND_TYPE_COLOR.koi}>{p.type}</Badge>
                </div>
                <p className="text-slate-400 text-sm">{p.volume ? `${p.volume} ton` : '— ton'}</p>
                <div className="grid grid-cols-4 gap-2 my-3 text-center text-xs">
                  <div><p className="text-slate-500">pH</p><p className={`font-bold ${paramColor('ph', p.lastpH)}`}>{p.lastpH ?? '—'}</p></div>
                  <div><p className="text-slate-500">NH3</p><p className={`font-bold ${paramColor('ammonia', p.lastAmmonia)}`}>{p.lastAmmonia ?? '—'}</p></div>
                  <div><p className="text-slate-500">NO2</p><p className={`font-bold ${paramColor('nitrite', p.lastNitrite)}`}>{p.lastNitrite ?? '—'}</p></div>
                  <div><p className="text-slate-500">Salt</p><p className="font-bold text-white">{pondSaltLevel(p) != null ? `${pondSaltLevel(p)}%` : '—'}</p></div>
                </div>
                {days > 7 && <p className="text-amber-400 text-xs flex items-center gap-1 mb-2"><AlertTriangle size={12} />Last checked {days} days ago</p>}
                <div className="flex flex-wrap gap-2">
                  <Btn variant="secondary" size="sm" onClick={() => { setMaintModal(p.id); setMaintForm((f) => ({ ...f, pondId: p.id, date: today() })) }}>Maintenance</Btn>
                  <Btn variant="secondary" size="sm" onClick={() => { setTreatModal(p.id); setTreatForm((f) => ({ ...f, pondId: p.id })) }}>Treatment</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => { setRemindModal(p.id); setRemindForm((f) => ({ ...f, pondId: p.id })) }}><Bell size={12} /></Btn>
                  {canEdit && <Btn variant="ghost" size="sm" onClick={() => setEditPond({ ...p })}>Edit</Btn>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'calculator' && <PondCalculator ponds={ponds} />}

      {tab === 'maintenance' && (
        <>
          <Select label="Filter pond" value={pondFilter} onChange={(e) => setPondFilter(e.target.value)}
            options={[{ value: 'all', label: 'All ponds' }, ...ponds.map((p) => ({ value: p.id, label: p.name }))]} />
          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-700/50">
              {filteredLogs.length === 0 ? (
                <p className="p-6 text-slate-500 text-sm text-center">
                  {visiblePond.maintenanceLogs.length === 0 ? 'No maintenance logs yet.' : 'No logs for the selected pond.'}
                </p>
              ) : filteredLogs.map((l) => (
                <div key={l.id} className="p-3 text-sm flex flex-wrap gap-2 items-center">
                  <span className="text-slate-500">{l.date}</span>
                  <span className="text-white font-medium">{l.pondName}</span>
                  <Badge className="bg-blue-500/20 text-blue-300">{MAINTENANCE_TYPES.find((m) => m.value === l.type)?.label || l.type}</Badge>
                  <span className="text-slate-400 flex-1">{l.notes}</span>
                  <span className="text-slate-500 text-xs">{l.performedBy}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === 'treatments' && (
        <>
          {activeTreatments.length > 0 && (
            <Card className="p-4 border-amber-500/30 bg-amber-500/5">
              <p className="text-amber-300 font-bold text-sm mb-2 flex items-center gap-2"><Beaker size={16} />Active treatments</p>
              <p className="text-amber-200/80 text-xs mb-3">Do NOT add new fish during treatment</p>
              {activeTreatments.map((t) => (
                <div key={t.id} className="text-sm text-white py-1">{t.medicine} — {t.pondName} ({t.dosage})</div>
              ))}
            </Card>
          )}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-700/30 text-slate-400 text-xs"><th className="p-2 text-left">Pond</th><th className="p-2 text-left">Medicine</th><th className="p-2 text-left">Period</th><th className="p-2 text-left">By</th></tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {visiblePond.treatmentLogs.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-slate-500 text-sm">No treatment logs yet.</td></tr>
                ) : visiblePond.treatmentLogs.map((t) => (
                  <tr key={t.id} className="text-slate-300"><td className="p-2">{t.pondName}</td><td className="p-2">{t.medicine}</td><td className="p-2">{t.startDate} → {t.endDate || 'ongoing'}</td><td className="p-2 text-xs">{t.performedBy}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'reminders' && (
        <>
          {overdueReminders.length > 0 && (
            <Card className="p-4 border-red-500/40">
              <p className="text-red-300 font-bold text-sm mb-2">Overdue</p>
              {overdueReminders.map((r) => (
                <div key={r.id} className="flex justify-between items-center py-2 text-sm">
                  <span className="text-white">{r.pondName} — {r.note || r.type} ({r.dueDate})</span>
                  <Btn variant="success" size="sm" onClick={() => update({ reminders: reminders.map((x) => (x.id === r.id ? { ...x, status: 'done' } : x)) })}><Check size={12} /></Btn>
                </div>
              ))}
            </Card>
          )}
          {overdueReminders.length === 0 && pendingReminders.length === 0 && (
            <Card className="p-6 text-center text-slate-500 text-sm">No pending reminders.</Card>
          )}
          {pendingReminders.map((r) => (
            <Card key={r.id} className="p-3 flex justify-between items-center text-sm">
              <span className="text-white">{r.pondName} · {r.dueDate} {r.dueTime}</span>
              <div className="flex gap-2">
                <Btn variant="success" size="sm" onClick={() => update({ reminders: reminders.map((x) => (x.id === r.id ? { ...x, status: 'done' } : x)) })}>Done</Btn>
                {canDelete && (
                  <Btn variant="ghost" size="sm" onClick={() => {
                    if (!canDelete) { denyDelete(); return }
                    update({ reminders: reminders.filter((x) => x.id !== r.id) })
                  }}><Trash2 size={12} /></Btn>
                )}
              </div>
            </Card>
          ))}
        </>
      )}

      {tab === 'guide' && (
        <div className="space-y-3">
          {displayGuides.map((g) => (
            <Card key={g.id} className="p-4">
              <div className="flex items-start gap-2">
                <BookOpen size={18} className="text-cyan-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold">{g.title}</p>
                  <Badge className="bg-slate-700 mt-1">{g.category}</Badge>
                  <p className="text-slate-300 text-sm mt-2 whitespace-pre-wrap">{g.steps}</p>
                  {g.warning && <p className="text-amber-400 text-xs mt-2">⚠ {g.warning}</p>}
                </div>
                {(canEdit || canDelete) && (
                  <div className="flex flex-col gap-1 shrink-0">
                    {canEdit && <Btn variant="ghost" size="sm" onClick={() => openEditGuide(g)}><Edit2 size={12} /></Btn>}
                    {canDelete && <Btn variant="danger" size="sm" onClick={() => deleteGuide(g.id)}><Trash2 size={12} /></Btn>}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showAddPond} onClose={() => setShowAddPond(false)} title="Add Pond">
        <div className="grid grid-cols-2 gap-3">
          <PondNameInput value={pondForm.name} onChange={(e) => setPondForm((f) => ({ ...f, name: e.target.value }))} className="col-span-2" required />
          <Select label="Type" value={pondForm.type} onChange={(e) => setPondForm((f) => ({ ...f, type: e.target.value }))} options={POND_TYPES} />
          <Input label="Volume (ton)" type="number" value={pondForm.volume} onChange={(e) => setPondForm((f) => ({ ...f, volume: e.target.value }))} min="0" step="0.1" />
          <Textarea label="Notes" value={pondForm.notes} onChange={(e) => setPondForm((f) => ({ ...f, notes: e.target.value }))} className="col-span-2" />
        </div>
        <div className="modal-actions mt-4 flex justify-end gap-2"><Btn variant="secondary" onClick={() => setShowAddPond(false)}>Cancel</Btn><Btn onClick={addPond}>Save</Btn></div>
      </Modal>

      <Modal open={!!editPond} onClose={() => setEditPond(null)} title="Edit Pond">
        {editPond && (
          <>
            <PondNameInput value={editPond.name} onChange={(e) => setEditPond((p) => ({ ...p, name: e.target.value }))} required />
            <Select label="Type" value={editPond.type} onChange={(e) => setEditPond((p) => ({ ...p, type: e.target.value }))} options={POND_TYPES} className="mt-3" />
            <Input label="Volume (ton)" type="number" value={editPond.volume} onChange={(e) => setEditPond((p) => ({ ...p, volume: e.target.value }))} className="mt-3" min="0" step="0.1" />
            <Textarea label="Notes" value={editPond.notes || ''} onChange={(e) => setEditPond((p) => ({ ...p, notes: e.target.value }))} className="mt-3" />
            <div className="modal-actions mt-4 flex justify-end gap-2">
              <Btn variant="secondary" onClick={() => setEditPond(null)}>Cancel</Btn>
              <Btn onClick={saveEditPond}>Save</Btn>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!maintModal} onClose={() => setMaintModal(null)} title="Log Maintenance" size="lg">
        <Select label="Pond" value={maintForm.pondId} onChange={(e) => setMaintForm((f) => ({ ...f, pondId: e.target.value }))}
          options={hasPonds ? ponds.map((p) => ({ value: p.id, label: p.name })) : [{ value: '', label: 'No ponds — add one first' }]} />
        <Select label="Type" value={maintForm.type} onChange={(e) => setMaintForm((f) => ({ ...f, type: e.target.value }))} options={MAINTENANCE_TYPES} className="mt-3" />
        <Input label="Date" type="date" value={maintForm.date} onChange={(e) => setMaintForm((f) => ({ ...f, date: e.target.value }))} className="mt-3" />
        <Textarea label="Notes" value={maintForm.notes} onChange={(e) => setMaintForm((f) => ({ ...f, notes: e.target.value }))} className="mt-3" />
        <label className="flex items-center gap-2 mt-3 text-sm text-slate-300">
          <input type="checkbox" checked={maintForm.showParams} onChange={(e) => setMaintForm((f) => ({ ...f, showParams: e.target.checked }))} />Record water test params
        </label>
        {maintForm.showParams && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Input label="pH" type="number" step="0.1" value={maintForm.pH} onChange={(e) => setMaintForm((f) => ({ ...f, pH: e.target.value }))} />
            <Input label="Ammonia" type="number" step="0.01" value={maintForm.ammonia} onChange={(e) => setMaintForm((f) => ({ ...f, ammonia: e.target.value }))} />
            <Input label="Nitrite" type="number" step="0.01" value={maintForm.nitrite} onChange={(e) => setMaintForm((f) => ({ ...f, nitrite: e.target.value }))} />
            <Input label="Salt level (%)" type="number" step="0.1" value={maintForm.saltLevel} onChange={(e) => setMaintForm((f) => ({ ...f, saltLevel: e.target.value }))} placeholder="e.g. 0.3" />
          </div>
        )}
        <div className="modal-actions mt-4 flex justify-end gap-2"><Btn variant="secondary" onClick={() => setMaintModal(null)}>Cancel</Btn><Btn onClick={saveMaint}>Save</Btn></div>
      </Modal>

      <Modal open={!!treatModal} onClose={() => setTreatModal(null)} title="Log Treatment" size="lg">
        <Select label="Pond" value={treatForm.pondId} onChange={(e) => setTreatForm((f) => ({ ...f, pondId: e.target.value }))}
          options={hasPonds ? ponds.map((p) => ({ value: p.id, label: p.name })) : [{ value: '', label: 'No ponds — add one first' }]} />
        <Input label="Medicine" value={treatForm.medicine} onChange={(e) => setTreatForm((f) => ({ ...f, medicine: e.target.value }))} className="mt-3" placeholder="Melafix" />
        <Input label="Dosage" value={treatForm.dosage} onChange={(e) => setTreatForm((f) => ({ ...f, dosage: e.target.value }))} className="mt-3" />
        <Textarea label="Reason" value={treatForm.reason} onChange={(e) => setTreatForm((f) => ({ ...f, reason: e.target.value }))} className="mt-3" />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Start" type="date" value={treatForm.startDate} onChange={(e) => setTreatForm((f) => ({ ...f, startDate: e.target.value }))} />
          <Input label="End" type="date" value={treatForm.endDate} onChange={(e) => setTreatForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm text-slate-300">
          <input type="checkbox" checked={treatForm.waterChangeBefore} onChange={(e) => setTreatForm((f) => ({ ...f, waterChangeBefore: e.target.checked }))} />Water change before treatment
        </label>
        <div className="modal-actions mt-4 flex justify-end gap-2"><Btn variant="secondary" onClick={() => setTreatModal(null)}>Cancel</Btn><Btn onClick={saveTreatment}>Start</Btn></div>
      </Modal>

      <Modal open={!!remindModal} onClose={() => setRemindModal(null)} title="Add Reminder">
        <Select label="Pond" value={remindForm.pondId} onChange={(e) => setRemindForm((f) => ({ ...f, pondId: e.target.value }))}
          options={hasPonds ? ponds.map((p) => ({ value: p.id, label: p.name })) : [{ value: '', label: 'No ponds — add one first' }]} />
        <Select label="Reminder type" value={remindForm.type} onChange={(e) => setRemindForm((f) => ({ ...f, type: e.target.value }))} options={MAINTENANCE_TYPES} className="mt-3" />
        <Input label="Due date" type="date" value={remindForm.dueDate} onChange={(e) => setRemindForm((f) => ({ ...f, dueDate: e.target.value }))} className="mt-3" />
        <Input label="Time" type="time" value={remindForm.dueTime} onChange={(e) => setRemindForm((f) => ({ ...f, dueTime: e.target.value }))} className="mt-3" />
        <Textarea label="Note" value={remindForm.note} onChange={(e) => setRemindForm((f) => ({ ...f, note: e.target.value }))} className="mt-3" />
        <div className="modal-actions mt-4 flex justify-end gap-2"><Btn variant="secondary" onClick={() => setRemindModal(null)}>Cancel</Btn><Btn onClick={saveReminder}>Save</Btn></div>
      </Modal>

      <Modal
        open={!!guideModal}
        onClose={() => { setGuideModal(null); setEditingGuideId(null); setGuideForm({ title: '', category: '', steps: '', warning: '' }) }}
        title={editingGuideId ? 'Edit Treatment Guide' : 'Add Treatment Guide'}
      >
        <Input label="Title" value={guideForm.title} onChange={(e) => setGuideForm((f) => ({ ...f, title: e.target.value }))} />
        <Input label="Category" value={guideForm.category} onChange={(e) => setGuideForm((f) => ({ ...f, category: e.target.value }))} className="mt-3" />
        <Textarea label="Steps" value={guideForm.steps} onChange={(e) => setGuideForm((f) => ({ ...f, steps: e.target.value }))} className="mt-3" />
        <Input label="Warning" value={guideForm.warning} onChange={(e) => setGuideForm((f) => ({ ...f, warning: e.target.value }))} className="mt-3" />
        <div className="modal-actions mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={() => { setGuideModal(null); setEditingGuideId(null); setGuideForm({ title: '', category: '', steps: '', warning: '' }) }}>Cancel</Btn>
          <Btn onClick={saveGuide}>{editingGuideId ? 'Save Changes' : 'Save'}</Btn>
        </div>
      </Modal>
    </div>
  )
}
