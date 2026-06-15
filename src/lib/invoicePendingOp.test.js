import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  saveInvoicePendingCreate,
  readInvoicePendingCreate,
  clearInvoicePendingCreate,
} from './invoicePendingOp.js'

const store = new Map()

describe('invoicePendingOp', () => {
  beforeEach(() => {
    store.clear()
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, v) },
      removeItem: (k) => { store.delete(k) },
    }
    clearInvoicePendingCreate()
  })

  it('round-trips pending create payload', () => {
    saveInvoicePendingCreate({ invoiceId: 'INV20260101-01', items: [{ name: 'Food', qty: 1, price: 10 }] })
    const pending = readInvoicePendingCreate()
    assert.equal(pending.invoiceId, 'INV20260101-01')
    assert.equal(pending.items.length, 1)
    clearInvoicePendingCreate()
    assert.equal(readInvoicePendingCreate(), null)
  })
})
