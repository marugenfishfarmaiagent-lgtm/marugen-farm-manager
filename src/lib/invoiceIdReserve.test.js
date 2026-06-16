import assert from 'node:assert/strict'
import test from 'node:test'
import { genInvoiceId } from '../data/constants.js'
import { peekReservedInvoiceIds, reserveInvoiceId, unreserveInvoiceId } from './invoiceIdReserve.js'

test('reserveInvoiceId is picked up by genInvoiceId', () => {
  reserveInvoiceId('INV20260616-02')
  const id = genInvoiceId([], '2026-06-16', { reservedIds: peekReservedInvoiceIds() })
  assert.equal(id, 'INV20260616-01')
  unreserveInvoiceId('INV20260616-02')
})
