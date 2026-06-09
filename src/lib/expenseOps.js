import { EXPENSE_CATEGORIES, genId } from '../data/constants'
import { touchUpdatedAt } from './syncMeta'

const NOTE_MAX_LEN = 500

export function sameExpenseId(a, b) {
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function normalizeExpenseRecord(expense) {
  if (!expense) return expense
  const amountRaw = expense.amount
  let amount = null
  if (amountRaw != null && amountRaw !== '') {
    const n = Number(amountRaw)
    amount = Number.isFinite(n) && n >= 0 ? n : null
  }
  const category = expense.category && EXPENSE_CATEGORIES.includes(expense.category)
    ? expense.category
    : (expense.category || null)
  return {
    ...expense,
    category,
    amount,
    note: String(expense.note || '').slice(0, NOTE_MAX_LEN),
    booked: Boolean(expense.booked),
    bookedAt: expense.bookedAt || null,
    bookedBy: expense.bookedBy || '',
    imageName: expense.imageName || '',
    imageUrl: expense.imageUrl || '',
    imageData: expense.imageData || '',
    addedBy: expense.addedBy || '',
  }
}

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateExpenseReceiptFields({ date, note, hasImage }) {
  if (!hasImage) {
    return { ok: false, message: 'Upload an expense invoice or receipt photo.' }
  }
  if (!date?.trim()) {
    return { ok: false, message: 'Choose the receipt date before saving.' }
  }
  if (note != null && String(note).length > NOTE_MAX_LEN) {
    return { ok: false, message: `Note must be ${NOTE_MAX_LEN} characters or fewer.` }
  }
  return { ok: true }
}

export function validateExpenseDateUpdate(date) {
  if (!date?.trim()) {
    return { ok: false, message: 'Choose a receipt date before saving.' }
  }
  return { ok: true }
}

export function buildExpenseReceiptRecord({
  imageData, imageName, date, note, addedBy,
}) {
  const check = validateExpenseReceiptFields({ date, note, hasImage: !!imageData })
  if (!check.ok) return check
  return {
    ok: true,
    expense: touchUpdatedAt(normalizeExpenseRecord({
      id: genId('EXP'),
      category: null,
      amount: null,
      date: date.trim(),
      note: note?.trim() || '',
      imageData,
      imageName: imageName || 'receipt.jpg',
      imageUrl: '',
      addedBy: addedBy || 'Staff',
      booked: false,
      bookedAt: null,
      bookedBy: '',
    })),
  }
}

export function isValidExpenseCategory(category) {
  if (!category) return true
  return EXPENSE_CATEGORIES.includes(category)
}
