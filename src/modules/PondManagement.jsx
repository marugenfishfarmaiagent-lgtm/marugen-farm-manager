import { useMemo, useRef, useState } from 'react'
import {
  Droplets, AlertTriangle, Beaker, Bell, BookOpen, Trash2, Check, Edit2, Calculator, MessageSquare,
} from 'lucide-react'
import { shareTreatmentGuideOnWhatsApp } from '../lib/pondWhatsApp'
import PondCalculator from './PondCalculator'
import {
  POND_TYPES, MAINTENANCE_TYPES, DEFAULT_TREATMENT_GUIDES, genId, today,
} from '../data/constants'
import { Badge, Btn, Card, Input, Modal, PondNameInput, Select, Textarea } from '../components/ui'
import Fab from '../components/Fab'
import PondWaterChart from '../components/PondWaterChart'
import EmptyState from '../components/ui/EmptyState'
import { filterPondLogsForApp } from '../lib/retention'
import {
  applyMaintenanceToPond, buildMaintenanceLogEntry, findPondById, isDuplicatePondName,
  isPendingReminder, markReminderCompleteInPondData, normalizeReminderRecord,
  samePondId, validateMaintenanceForm, validatePondFields, validateReminderForm, validateTreatmentForm,
} from '../lib/pondOps'
import { reminderDisplayLines } from '../lib/pondReminderCalendar'
import { hasAssignedTeam } from '../lib/assignTeam'
import { notifyAssignmentChange } from '../lib/teamAssignNotify'
import { touchPondData, touchUpdatedAt } from '../lib/syncMeta'
import StaffAssignPicker, { AssigneeBadges } from '../components/StaffAssignPicker'

const POND_TYPE_COLOR = { koi: 'bg-cyan-500/20 text-cyan-300', arowana: 'bg-amber-500/20 text-amber-300', quarantine: 'bg-red-500/20 text-red-300', display: 'bg-purple-500/20 text-purple-300' }

function ReminderDetails({ reminder, users, overdue = false }) {
  const { title, subtitle, note } = reminderDisplayLines(reminder)
  return (
    <div className="min-w-0 flex-1">
      <p className={`font-semibold ${overdue ? 'text-red-200' : 'text-white'}`}>{title}</p>
      <p className="text-slate-400 text-xs mt-0.5">{subtitle}</p>
      {note ? <p className="text-slate-300 text-xs mt-1 whitespace-pre-wrap">{note}</p> : null}
      <AssigneeBadges users={users} assignedUserIds={reminder.assignedUserIds} className="mt-1" />
    </div>
  )
}

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

export default function PondManagement({
  pondData, setPondData, addNotification, currentUser, users = [], canEdit = false, canDelete = false,
  onPersistPondData, onSyncReminderCalendar,
}) {
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
  const [remindForm, setRemindForm] = useState({ pondId: '', type: 'water_test', dueDate: today(), dueTime: '09:00', note: '', repeat: 'none', assignedUserIds: [] })
  const [guideForm, setGuideForm] = useState({ title: '', category: '', steps: '', warning: '' })
  const [editingGuideId, setEditingGuideId] = useState(null)
  const [savingGuide, setSavingGuide] = useState(false)
  const [deletingGuideId, setDeletingGuideId] = useState(null)
  const [confirmDeleteGuideId, setConfirmDeleteGuideId] = useState(null)
  const [editingTreatmentId, setEditingTreatmentId] = useState(null)
  const [completingReminderId, setCompletingReminderId] = useState(null)
  const [confirmDeletePondId, setConfirmDeletePondId] = useState(null)
  const [deletingPond, setDeletingPond] = useState(false)
  const [savingReminder, setSavingReminder] = useState(false)
  const completingReminderRef = useRef(null)
  const savingReminderRef = useRef(false)
  const savingPondRef = useRef(false)
  const [savingPond, setSavingPond] = useState(false)

  const todayStr = today()
  const activeTreatments = visiblePond.treatmentLogs.filter((t) => t.startDate <= todayStr && (!t.endDate || t.endDate >= todayStr))
  const overdueReminders = visiblePond.reminders.filter((r) => isPendingReminder(r) && r.dueDate < todayStr)
  const pendingReminders = visiblePond.reminders.filter((r) => isPendingReminder(r) && r.dueDate >= todayStr)

  const update = (patch) => setPondData((prev) => touchPondData({ ...prev, ...patch }))

  const commitPondData = async (buildNext) => {
    if (savingPondRef.current) return null
    // Compute next state from the current prop value — do NOT rely on the
    // React state updater being called synchronously (it isn't in React 19
    // concurrent mode, so side-effect capture inside setState is unreliable).
    const snapshot = pondData
    const nextPond = buildNext(snapshot)
    if (nextPond === snapshot) return null
    setPondData(nextPond)
    if (!onPersistPondData) return nextPond

    savingPondRef.current = true
    setSavingPond(true)
    try {
      await onPersistPondData(nextPond)
      return nextPond
    } catch {
      setPondData(snapshot)
      addNotification({ type: 'error', title: 'Save failed', message: 'Could not save to cloud. Try again.' })
      return null
    } finally {
      savingPondRef.current = false
      setSavingPond(false)
    }
  }

  const markReminderDone = async (reminderId) => {
    const id = String(reminderId)
    if (completingReminderRef.current === id) return

    completingReminderRef.current = id
    setCompletingReminderId(id)
    try {
      const nextPond = await commitPondData((prev) => {
        const result = markReminderCompleteInPondData(prev, reminderId)
        return result.changed ? result.data : prev
      })
      if (!nextPond) {
        addNotification({ type: 'error', title: 'Reminder not updated', message: 'Could not find that reminder. Refresh and try again.' })
        return
      }
      try {
        await onSyncReminderCalendar?.('remove', { id })
      } catch {
        addNotification({
          type: 'warning',
          title: 'Calendar sync skipped',
          message: 'Reminder marked done in pond data; calendar could not be updated.',
        })
      }
      addNotification({ type: 'success', title: 'Reminder completed', message: 'Marked as done.' })
    } catch {
      addNotification({ type: 'error', title: 'Save failed', message: 'Reminder could not be saved to cloud. Try again.' })
    } finally {
      completingReminderRef.current = null
      setCompletingReminderId(null)
    }
  }
  const hasPonds = ponds.length > 0

  const displayGuides = treatmentGuides?.length ? treatmentGuides : (treatmentGuides == null ? DEFAULT_TREATMENT_GUIDES : [])

  const ensureGuidesMutable = () => (treatmentGuides != null ? treatmentGuides : [...DEFAULT_TREATMENT_GUIDES])

  const pondSaltLevel = (pond) => pond.lastSalt

  const syncPondNameInLogs = (pondId, pondName) => ({
    maintenanceLogs: maintenanceLogs.map((l) => (samePondId(l.pondId, pondId) ? { ...l, pondName } : l)),
    treatmentLogs: treatmentLogs.map((l) => (samePondId(l.pondId, pondId) ? { ...l, pondName } : l)),
    reminders: reminders.map((r) => (samePondId(r.pondId, pondId) ? { ...r, pondName } : r)),
  })

  const addPond = async () => {
    if (!canEdit) { denyEdit(); return }
    const check = validatePondFields(pondForm)
    if (!check.ok) {
      addNotification({ type: 'error', title: 'Invalid Pond', message: check.message })
      return
    }
    if (isDuplicatePondName(ponds, check.name)) {
      addNotification({ type: 'warning', title: 'Duplicate Pond', message: `${check.name} is already in the pond list.` })
      return
    }
    const formSnapshot = { ...pondForm, name: check.name, volume: check.volume }
    const saved = await commitPondData((prev) =>
      touchPondData({ ...prev, ponds: [...prev.ponds, { ...formSnapshot, id: genId('POND'), lastpH: null, lastAmmonia: null, lastNitrite: null, lastSalt: null, lastChecked: null }] }),
    )
    if (!saved) return
    addNotification({ type: 'success', title: 'Pond Added', message: `${check.name} added to pond list.` })
    setShowAddPond(false)
    setPondForm({ name: '', type: 'koi', volume: '', notes: '' })
  }

  const saveMaint = async () => {
    if (!canEdit) { denyEdit(); return }
    if (savingPond) return
    if (!hasPonds) {
      addNotification({ type: 'error', title: 'No Ponds', message: 'Add a pond before logging maintenance.' })
      return
    }
    const check = validateMaintenanceForm(maintForm)
    if (!check.ok) {
      addNotification({ type: 'error', title: 'Invalid Maintenance', message: check.message })
      return
    }
    const pond = findPondById(ponds, maintForm.pondId)
    if (!pond) {
      addNotification({ type: 'error', title: 'Pond Not Found', message: 'Selected pond is no longer in the list.' })
      return
    }
    const formSnapshot = { ...maintForm }
    const saved = await commitPondData((prev) => {
      const p = findPondById(prev.ponds, formSnapshot.pondId)
      if (!p) return prev
      const log = buildMaintenanceLogEntry(
        { ...formSnapshot, id: genId('MAINT') },
        { pond: p, performedBy: currentUser?.name || '' },
      )
      const nextPonds = (prev.ponds || []).map((row) => (
        samePondId(row.id, p.id) ? applyMaintenanceToPond(row, formSnapshot) : row
      ))
      return touchPondData({
        ...prev,
        ponds: nextPonds,
        maintenanceLogs: [log, ...(prev.maintenanceLogs || [])],
      })
    })
    if (!saved) return
    addNotification({ type: 'success', title: 'Logged', message: `Maintenance recorded for ${pond.name}` })
    setMaintModal(null)
  }

  const saveTreatment = async () => {
    if (!canEdit) { denyEdit(); return }
    if (savingPond) return
    if (!hasPonds) {
      addNotification({ type: 'error', title: 'No Ponds', message: 'Add a pond before logging treatment.' })
      return
    }
    const check = validateTreatmentForm(treatForm)
    if (!check.ok) {
      addNotification({ type: 'error', title: 'Invalid Treatment', message: check.message })
      return
    }
    const pond = findPondById(ponds, treatForm.pondId)
    if (!pond) {
      addNotification({ type: 'error', title: 'Pond Not Found', message: 'Selected pond is no longer in the list.' })
      return
    }
    const formSnapshot = {
      ...treatForm,
      medicine: treatForm.medicine.trim(),
      reason: treatForm.reason?.trim() || '',
      notes: treatForm.notes?.trim() || '',
    }
    const editingId = editingTreatmentId
    const saved = await commitPondData((prev) => {
      const p = findPondById(prev.ponds, formSnapshot.pondId)
      if (!p) return prev
      const payload = {
        ...formSnapshot,
        pondName: p.name,
        performedBy: currentUser?.name || '',
      }
      if (editingId) {
        return touchPondData({
          ...prev,
          treatmentLogs: (prev.treatmentLogs || []).map((t) => (
            String(t.id) === String(editingId)
              ? touchUpdatedAt({ ...t, ...payload, id: editingId })
              : t
          )),
        })
      }
      const log = touchUpdatedAt({ ...payload, id: genId('TREAT') })
      return touchPondData({
        ...prev,
        treatmentLogs: [log, ...(prev.treatmentLogs || [])],
      })
    })
    if (!saved) return
    if (editingId) {
      addNotification({ type: 'success', title: 'Treatment Updated', message: `${formSnapshot.medicine} — ${pond.name}` })
    } else {
      addNotification({ type: 'info', title: 'Treatment Started', message: `${formSnapshot.medicine} in ${pond.name}` })
    }
    setTreatModal(null)
    setEditingTreatmentId(null)
  }

  const openEditTreatment = (log) => {
    if (!canEdit) { denyEdit(); return }
    setEditingTreatmentId(log.id)
    setTreatForm({
      pondId: log.pondId,
      medicine: log.medicine || '',
      dosage: log.dosage || '',
      reason: log.reason || '',
      startDate: log.startDate || today(),
      endDate: log.endDate || '',
      waterChangeBefore: Boolean(log.waterChangeBefore),
      notes: log.notes || '',
    })
    setTreatModal('edit')
  }

  const deleteTreatment = async (treatmentId) => {
    if (!canDelete) { denyDelete(); return }
    if (savingPond) return
    const id = String(treatmentId)
    const saved = await commitPondData((prev) => touchPondData({
      ...prev,
      treatmentLogs: (prev.treatmentLogs || []).filter((t) => String(t.id) !== id),
    }))
    if (!saved) return
    addNotification({ type: 'info', title: 'Treatment Removed', message: 'Treatment log deleted.' })
  }

  const deletePond = (pondId) => {
    if (!canDelete) { denyDelete(); return }
    const pond = findPondById(ponds, pondId)
    if (!pond) return
    setConfirmDeletePondId(pondId)
  }

  const confirmDeletePond = async () => {
    const pondId = confirmDeletePondId
    const pond = findPondById(ponds, pondId)
    if (!pond) { setConfirmDeletePondId(null); return }
    setDeletingPond(true)
    try {
      const saved = await commitPondData((prev) =>
        touchPondData({
          ...prev,
          ponds: prev.ponds.filter((p) => !samePondId(p.id, pondId)),
          maintenanceLogs: prev.maintenanceLogs.filter((l) => !samePondId(l.pondId, pondId)),
          treatmentLogs: prev.treatmentLogs.filter((t) => !samePondId(t.pondId, pondId)),
          reminders: prev.reminders.filter((r) => !samePondId(r.pondId, pondId)),
        }),
      )
      if (!saved) return
      setConfirmDeletePondId(null)
      addNotification({ type: 'info', title: 'Pond Deleted', message: `${pond.name} removed.` })
      if (editPond && samePondId(editPond.id, pondId)) setEditPond(null)
    } finally {
      setDeletingPond(false)
    }
  }

  const saveReminder = async () => {
    if (!canEdit) { denyEdit(); return }
    if (savingReminderRef.current) return
    if (!hasPonds) {
      addNotification({ type: 'error', title: 'No Ponds', message: 'Add a pond before creating a reminder.' })
      return
    }
    const check = validateReminderForm(remindForm)
    if (!check.ok) {
      addNotification({ type: 'error', title: 'Invalid Reminder', message: check.message })
      return
    }
    const pond = findPondById(ponds, remindForm.pondId)
    if (!pond) {
      addNotification({ type: 'error', title: 'Pond Not Found', message: 'Selected pond is no longer in the list.' })
      return
    }
    const newReminder = touchUpdatedAt(normalizeReminderRecord({
      ...remindForm,
      id: genId('REM'),
      pondName: pond.name,
      status: 'pending',
      assignedUserIds: remindForm.assignedUserIds,
    }))
    setRemindModal(null)
    savingReminderRef.current = true
    setSavingReminder(true)
    try {
      const saved = await commitPondData((prev) => touchPondData({
        ...prev,
        reminders: [...(prev.reminders || []), newReminder],
      }))
      if (!saved) return

      const reminderMsg = `${reminderDisplayLines(newReminder).title} · ${newReminder.dueDate}`
      try {
        await onSyncReminderCalendar?.('upsert', newReminder)
      } catch {
        addNotification({
          type: 'warning',
          title: 'Calendar sync skipped',
          message: 'Reminder saved to pond data; calendar could not be updated.',
        })
      }
      addNotification({
        type: 'success',
        title: 'Reminder Set',
        message: reminderMsg,
      })
      if (hasAssignedTeam(newReminder.assignedUserIds)) {
        notifyAssignmentChange({
          isNew: true,
          nextAssignedUserIds: newReminder.assignedUserIds,
          title: 'Pond Task Assigned',
          message: reminderMsg,
          url: '/?tab=ponds',
          actor: currentUser?.name,
          actorRole: currentUser?.role,
        })
      }
    } finally {
      savingReminderRef.current = false
      setSavingReminder(false)
    }
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

  const saveGuide = async () => {
    if (!canEdit) { denyEdit(); return }
    if (savingGuide) return
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
    const currentEditId = editingGuideId
    setSavingGuide(true)
    try {
      if (currentEditId) {
        const saved = await commitPondData((prev) => touchPondData({
          ...prev,
          treatmentGuides: (prev.treatmentGuides != null ? prev.treatmentGuides : [...DEFAULT_TREATMENT_GUIDES])
            .map((g) => (g.id === currentEditId ? { ...g, ...payload } : g)),
        }))
        if (!saved) return
        addNotification({ type: 'success', title: 'Guide Updated', message: payload.title })
      } else {
        const saved = await commitPondData((prev) => touchPondData({
          ...prev,
          treatmentGuides: [...(prev.treatmentGuides != null ? prev.treatmentGuides : [...DEFAULT_TREATMENT_GUIDES]), { ...payload, id: genId('GUIDE') }],
        }))
        if (!saved) return
        addNotification({ type: 'success', title: 'Guide Added', message: payload.title })
      }
      setGuideModal(null)
      setEditingGuideId(null)
      setGuideForm({ title: '', category: '', steps: '', warning: '' })
    } finally {
      setSavingGuide(false)
    }
  }

  const confirmDeleteGuide = async () => {
    const guideId = confirmDeleteGuideId
    if (!guideId) return
    setDeletingGuideId(guideId)
    try {
      const saved = await commitPondData((prev) => touchPondData({
        ...prev,
        treatmentGuides: (prev.treatmentGuides != null ? prev.treatmentGuides : [...DEFAULT_TREATMENT_GUIDES])
          .filter((g) => g.id !== guideId),
      }))
      if (!saved) return
      setConfirmDeleteGuideId(null)
      addNotification({ type: 'info', title: 'Guide Removed', message: 'Treatment guide deleted.' })
    } finally {
      setDeletingGuideId(null)
    }
  }

  const shareGuideOnWhatsApp = (guide) => {
    try {
      shareTreatmentGuideOnWhatsApp(guide)
      addNotification({ type: 'success', title: 'WhatsApp Opened', message: 'Choose a chat or group, then send the guide.' })
    } catch (err) {
      addNotification({ type: 'error', title: 'WhatsApp Failed', message: err?.message || 'Could not open WhatsApp.' })
    }
  }

  const filteredLogs = visiblePond.maintenanceLogs.filter((l) => pondFilter === 'all' || samePondId(l.pondId, pondFilter))

  const openNewMaint = () => {
    setMaintForm({ pondId: ponds[0]?.id || '', type: 'water_test', date: today(), notes: '', showParams: true, pH: '', ammonia: '', nitrite: '', saltLevel: '' })
    setMaintModal('new')
  }

  const openNewTreatment = () => {
    setEditingTreatmentId(null)
    setTreatForm({ pondId: ponds[0]?.id || '', medicine: '', dosage: '', reason: '', startDate: today(), endDate: '', waterChangeBefore: false, notes: '' })
    setTreatModal('new')
  }

  const closeTreatModal = () => {
    setTreatModal(null)
    setEditingTreatmentId(null)
  }

  const openNewReminder = () => {
    setRemindForm({ pondId: ponds[0]?.id || '', type: 'water_test', dueDate: today(), dueTime: '09:00', note: '', repeat: 'none', assignedUserIds: [] })
    setRemindModal('new')
  }

  const saveEditPond = async () => {
    if (!editPond) return
    if (!canEdit) { denyEdit(); return }
    const check = validatePondFields(editPond)
    if (!check.ok) {
      addNotification({ type: 'error', title: 'Invalid Pond', message: check.message })
      return
    }
    if (isDuplicatePondName(ponds, check.name, editPond.id)) {
      addNotification({ type: 'warning', title: 'Duplicate Pond', message: `${check.name} is already in the pond list.` })
      return
    }
    const editSnapshot = { ...editPond, name: check.name, volume: check.volume, notes: editPond.notes?.trim() || '' }
    const saved = await commitPondData((prev) => {
      const prevPond = findPondById(prev.ponds, editSnapshot.id)
      const patch = {
        ponds: prev.ponds.map((p) => (samePondId(p.id, editSnapshot.id) ? editSnapshot : p)),
        ...(prevPond && prevPond.name !== editSnapshot.name ? syncPondNameInLogs(editSnapshot.id, editSnapshot.name) : {}),
      }
      return touchPondData({ ...prev, ...patch })
    })
    if (!saved) return
    addNotification({ type: 'success', title: 'Pond Updated', message: `${check.name} saved` })
    setEditPond(null)
  }

  const tabs = ['ponds', 'calculator', 'maintenance', 'treatments', 'reminders', 'guide']

  const fabByTab = {
    ponds: canEdit ? { onClick: () => setShowAddPond(true), label: 'Add Pond' } : null,
    maintenance: canEdit ? { onClick: openNewMaint, label: 'Log Maintenance', disabled: !hasPonds } : null,
    treatments: canEdit ? { onClick: openNewTreatment, label: 'Log Treatment', disabled: !hasPonds } : null,
    reminders: canEdit ? { onClick: openNewReminder, label: 'Add Reminder', disabled: !hasPonds, icon: Bell } : null,
    guide: canEdit ? { onClick: openAddGuide, label: 'Add Guide' } : null,
  }
  const fabAction = fabByTab[tab]
  const pondModalOpen = showAddPond || !!editPond || !!maintModal || !!treatModal || !!remindModal || !!guideModal || !!confirmDeletePondId

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
            <Card className="md:col-span-2 xl:col-span-3">
              <EmptyState
                emoji="💧"
                title="No ponds yet"
                hint="Register A1, B2, quarantine tanks, etc."
                actionLabel={canEdit ? 'Add Pond' : undefined}
                onAction={canEdit ? () => setShowAddPond(true) : undefined}
              />
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
                  {canEdit && (
                    <>
                      <Btn variant="secondary" size="sm" onClick={() => { setMaintModal(p.id); setMaintForm((f) => ({ ...f, pondId: p.id, date: today() })) }}>Maintenance</Btn>
                      <Btn variant="secondary" size="sm" onClick={() => { setTreatModal(p.id); setTreatForm((f) => ({ ...f, pondId: p.id })) }}>Treatment</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => { setRemindModal(p.id); setRemindForm((f) => ({ ...f, pondId: p.id })) }}><Bell size={12} /></Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setEditPond({ ...p })}><Edit2 size={12} />Edit</Btn>
                      {canDelete && (
                        <Btn variant="danger" size="sm" onClick={() => deletePond(p.id)}><Trash2 size={12} />Delete</Btn>
                      )}
                    </>
                  )}
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
          <Card className="p-4 border-slate-700/50">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Droplets size={14} className="text-cyan-400" />
              Water parameter history
            </h3>
            <PondWaterChart
              logs={visiblePond.maintenanceLogs}
              pondId={pondFilter}
              pondName={pondFilter !== 'all' ? findPondById(ponds, pondFilter)?.name : null}
            />
          </Card>
          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-700/50">
              {filteredLogs.length === 0 ? (
                <EmptyState
                  emoji="💧"
                  title={visiblePond.maintenanceLogs.length === 0 ? 'No maintenance logs yet' : 'No logs for this pond'}
                  hint="Log water tests and pond maintenance"
                  className="py-10"
                />
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
          <div className="block md:hidden space-y-2">
            {visiblePond.treatmentLogs.length === 0 ? (
              <Card><EmptyState emoji="💊" title="No treatment logs yet" hint="Log medicine and dosage per pond" className="py-10" /></Card>
            ) : visiblePond.treatmentLogs.map((t) => (
              <Card key={t.id} className="p-3 text-sm">
                <div className="flex justify-between gap-2 items-start">
                  <div className="min-w-0 flex-1">
                    <span className="text-white font-medium">{t.medicine}</span>
                    <Badge className="bg-amber-500/20 text-amber-300 ml-2">{t.pondName}</Badge>
                    <p className="text-slate-400 text-xs mt-1">{t.startDate} → {t.endDate || 'ongoing'}</p>
                    {t.performedBy && <p className="text-slate-500 text-xs mt-1">By {t.performedBy}</p>}
                  </div>
                  {(canEdit || canDelete) && (
                    <div className="flex gap-1 shrink-0">
                      {canEdit && <Btn variant="ghost" size="sm" onClick={() => openEditTreatment(t)}><Edit2 size={12} /></Btn>}
                      {canDelete && <Btn variant="danger" size="sm" onClick={() => deleteTreatment(t.id)}><Trash2 size={12} /></Btn>}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Card className="overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead><tr className="bg-slate-700/30 text-slate-400 text-xs"><th className="p-2 text-left">Pond</th><th className="p-2 text-left">Medicine</th><th className="p-2 text-left">Period</th><th className="p-2 text-left">By</th><th className="p-2 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-700/30">
                {visiblePond.treatmentLogs.length === 0 ? (
                  <tr><td colSpan={5} className="p-0"><EmptyState emoji="💊" title="No treatment logs yet" className="py-10" /></td></tr>
                ) : visiblePond.treatmentLogs.map((t) => (
                  <tr key={t.id} className="text-slate-300">
                    <td className="p-2">{t.pondName}</td>
                    <td className="p-2">{t.medicine}</td>
                    <td className="p-2">{t.startDate} → {t.endDate || 'ongoing'}</td>
                    <td className="p-2 text-xs">{t.performedBy}</td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit && <Btn variant="ghost" size="sm" onClick={() => openEditTreatment(t)}><Edit2 size={12} /></Btn>}
                        {canDelete && <Btn variant="danger" size="sm" onClick={() => deleteTreatment(t.id)}><Trash2 size={12} /></Btn>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        </>
      )}

      {tab === 'reminders' && (
        <>
          {overdueReminders.length > 0 && (
            <Card className="p-4 border-red-500/40">
              <p className="text-red-300 font-bold text-sm mb-2">Overdue</p>
              {overdueReminders.map((r) => (
                <div key={r.id} className="flex justify-between items-start gap-3 py-2 text-sm border-b border-red-500/20 last:border-0">
                  <ReminderDetails reminder={r} users={users} overdue />
                  <Btn variant="success" size="sm" disabled={completingReminderId === String(r.id)} onClick={() => markReminderDone(r.id)}><Check size={12} /></Btn>
                </div>
              ))}
            </Card>
          )}
          {overdueReminders.length === 0 && pendingReminders.length === 0 && (
            <Card className="p-6 text-center text-slate-500 text-sm">No pending reminders.</Card>
          )}
          {pendingReminders.map((r) => (
            <Card key={r.id} className="p-3 flex justify-between items-start gap-3 text-sm">
              <ReminderDetails reminder={r} users={users} />
              <div className="flex gap-2 shrink-0">
                <Btn variant="success" size="sm" disabled={completingReminderId === String(r.id)} onClick={() => markReminderDone(r.id)}>Done</Btn>
                {canDelete && (
                  <Btn variant="ghost" size="sm" disabled={completingReminderId === String(r.id)} onClick={async () => {
                    const id = String(r.id)
                    const saved = await commitPondData((prev) => touchPondData({
                      ...prev,
                      reminders: (prev.reminders || []).filter((x) => String(x.id) !== id),
                    }))
                    if (!saved) return
                    try {
                      await onSyncReminderCalendar?.('remove', { id })
                    } catch {
                      addNotification({ type: 'warning', title: 'Calendar sync skipped', message: 'Reminder deleted from pond data; calendar could not be updated.' })
                    }
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
                <div className="flex flex-col gap-1 shrink-0">
                  <Btn variant="success" size="sm" onClick={() => shareGuideOnWhatsApp(g)} title="Share on WhatsApp">
                    <MessageSquare size={12} />
                  </Btn>
                  {canEdit && <Btn variant="ghost" size="sm" onClick={() => openEditGuide(g)}><Edit2 size={12} /></Btn>}
                  {canDelete && <Btn variant="danger" size="sm" disabled={!!deletingGuideId} onClick={() => { if (!canDelete) { denyDelete(); return } setConfirmDeleteGuideId(g.id) }}><Trash2 size={12} /></Btn>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showAddPond} onClose={() => setShowAddPond(false)} title="Add Pond">
        <div className="grid grid-cols-2 gap-3">
          <PondNameInput value={pondForm.name} onChange={(e) => setPondForm((f) => ({ ...f, name: e.target.value }))} extraNames={ponds.map((p) => p.name)} className="col-span-2" required />
          <Select label="Type" value={pondForm.type} onChange={(e) => setPondForm((f) => ({ ...f, type: e.target.value }))} options={POND_TYPES} />
          <Input label="Volume (ton)" type="number" value={pondForm.volume} onChange={(e) => setPondForm((f) => ({ ...f, volume: e.target.value }))} min="0" step="0.1" />
          <Textarea label="Notes" value={pondForm.notes} onChange={(e) => setPondForm((f) => ({ ...f, notes: e.target.value }))} className="col-span-2" />
        </div>
        <div className="modal-actions mt-4 flex justify-end gap-2"><Btn variant="secondary" onClick={() => setShowAddPond(false)} disabled={savingPond}>Cancel</Btn><Btn onClick={addPond} disabled={!canEdit || savingPond}>{savingPond ? 'Saving…' : 'Save'}</Btn></div>
      </Modal>

      <Modal open={!!editPond} onClose={() => setEditPond(null)} title="Edit Pond">
        {editPond && (
          <>
            <PondNameInput value={editPond.name} onChange={(e) => setEditPond((p) => ({ ...p, name: e.target.value }))} extraNames={ponds.map((p) => p.name)} required />
            <Select label="Type" value={editPond.type} onChange={(e) => setEditPond((p) => ({ ...p, type: e.target.value }))} options={POND_TYPES} className="mt-3" />
            <Input label="Volume (ton)" type="number" value={editPond.volume} onChange={(e) => setEditPond((p) => ({ ...p, volume: e.target.value }))} className="mt-3" min="0" step="0.1" />
            <Textarea label="Notes" value={editPond.notes || ''} onChange={(e) => setEditPond((p) => ({ ...p, notes: e.target.value }))} className="mt-3" />
            <div className="modal-actions mt-4 flex justify-between gap-2">
              {canDelete && (
                <Btn variant="danger" onClick={() => deletePond(editPond.id)}><Trash2 size={14} />Delete Pond</Btn>
              )}
              <div className="flex gap-2 ml-auto">
                <Btn variant="secondary" onClick={() => setEditPond(null)} disabled={savingPond}>Cancel</Btn>
                <Btn onClick={saveEditPond} disabled={savingPond}>{savingPond ? 'Saving…' : 'Save'}</Btn>
              </div>
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
        <div className="modal-actions mt-4 flex justify-end gap-2"><Btn variant="secondary" onClick={() => setMaintModal(null)} disabled={savingPond}>Cancel</Btn><Btn onClick={saveMaint} disabled={!canEdit || savingPond}>Save</Btn></div>
      </Modal>

      <Modal open={!!treatModal} onClose={closeTreatModal} title={editingTreatmentId ? 'Edit Treatment' : 'Log Treatment'} size="lg">
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
        <Textarea label="Notes" value={treatForm.notes} onChange={(e) => setTreatForm((f) => ({ ...f, notes: e.target.value }))} className="mt-3" />
        <div className="modal-actions mt-4 flex justify-end gap-2">
          <Btn variant="secondary" onClick={closeTreatModal} disabled={savingPond}>Cancel</Btn>
          <Btn onClick={saveTreatment} disabled={!canEdit || savingPond}>{editingTreatmentId ? 'Save Changes' : 'Start'}</Btn>
        </div>
      </Modal>

      <Modal open={!!remindModal} onClose={() => setRemindModal(null)} title="Add Reminder">
        <Select label="Pond" value={remindForm.pondId} onChange={(e) => setRemindForm((f) => ({ ...f, pondId: e.target.value }))}
          options={hasPonds ? ponds.map((p) => ({ value: p.id, label: p.name })) : [{ value: '', label: 'No ponds — add one first' }]} />
        <Select label="Reminder type" value={remindForm.type} onChange={(e) => setRemindForm((f) => ({ ...f, type: e.target.value }))} options={MAINTENANCE_TYPES} className="mt-3" />
        <Input label="Due date" type="date" value={remindForm.dueDate} onChange={(e) => setRemindForm((f) => ({ ...f, dueDate: e.target.value }))} className="mt-3" />
        <Input label="Time" type="time" value={remindForm.dueTime} onChange={(e) => setRemindForm((f) => ({ ...f, dueTime: e.target.value }))} className="mt-3" />
        <Textarea label="Note" value={remindForm.note} onChange={(e) => setRemindForm((f) => ({ ...f, note: e.target.value }))} className="mt-3" />
        <StaffAssignPicker
          className="mt-3"
          users={users}
          value={remindForm.assignedUserIds}
          onChange={(assignedUserIds) => setRemindForm((f) => ({ ...f, assignedUserIds }))}
          excludeUserId={currentUser?.id}
        />
        <div className="modal-actions mt-4 flex justify-end gap-2"><Btn variant="secondary" onClick={() => setRemindModal(null)} disabled={savingReminder}>Cancel</Btn><Btn onClick={saveReminder} disabled={!canEdit || savingReminder}>{savingReminder ? 'Saving…' : 'Save'}</Btn></div>
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
          <Btn variant="secondary" disabled={savingGuide} onClick={() => { setGuideModal(null); setEditingGuideId(null); setGuideForm({ title: '', category: '', steps: '', warning: '' }) }}>Cancel</Btn>
          <Btn onClick={saveGuide} disabled={savingGuide}>{savingGuide ? 'Saving…' : editingGuideId ? 'Save Changes' : 'Save'}</Btn>
        </div>
      </Modal>

      <Modal open={!!confirmDeleteGuideId} onClose={() => setConfirmDeleteGuideId(null)} title="Delete Guide" size="sm">
        {confirmDeleteGuideId && (() => {
          const guide = displayGuides.find((g) => g.id === confirmDeleteGuideId)
          return guide ? (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">Delete <strong className="text-white">{guide.title}</strong>?</p>
              <p className="text-red-400 text-xs">This cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <Btn variant="secondary" onClick={() => setConfirmDeleteGuideId(null)} disabled={!!deletingGuideId}>Cancel</Btn>
                <Btn variant="danger" onClick={confirmDeleteGuide} disabled={!!deletingGuideId}><Trash2 size={14} />{deletingGuideId ? 'Deleting…' : 'Delete'}</Btn>
              </div>
            </div>
          ) : null
        })()}
      </Modal>

      <Modal open={!!confirmDeletePondId} onClose={() => setConfirmDeletePondId(null)} title="Delete Pond" size="sm">
        {confirmDeletePondId && (() => {
          const pond = findPondById(ponds, confirmDeletePondId)
          return pond ? (
            <div className="space-y-4">
              <p className="text-slate-300 text-sm">Delete <strong className="text-white">{pond.name}</strong> and all its maintenance logs, treatment logs, and reminders?</p>
              <p className="text-red-400 text-xs">This cannot be undone.</p>
              <div className="flex justify-end gap-2">
                <Btn variant="secondary" onClick={() => setConfirmDeletePondId(null)} disabled={deletingPond}>Cancel</Btn>
                <Btn variant="danger" onClick={confirmDeletePond} disabled={deletingPond}><Trash2 size={14} />{deletingPond ? 'Deleting…' : 'Delete'}</Btn>
              </div>
            </div>
          ) : null
        })()}
      </Modal>
    </div>
  )
}
