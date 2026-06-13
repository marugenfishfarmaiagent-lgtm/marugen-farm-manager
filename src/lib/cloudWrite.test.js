import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { writeCloudFirst, writeInventoryCloudFirst, writeListCloudFirst } from './cloudWrite.js'
import { peekDeletions } from './syncDeletions.js'

describe('writeCloudFirst', () => {
  it('flushes to cloud before setState', async () => {
    const order = []
    const next = [{ id: '1' }]
    await writeCloudFirst({
      next,
      flush: async () => { order.push('flush') },
      setState: () => { order.push('setState') },
    })
    assert.deepEqual(order, ['flush', 'setState'])
  })

  it('unmarks delete and rethrows when flush fails', async () => {
    const before = peekDeletions('customers').length
    await assert.rejects(
      () => writeCloudFirst({
        next: [],
        deleteMeta: { entity: 'customers', id: 'C1' },
        flush: async () => { throw new Error('network') },
        setState: () => {},
      }),
      /network/,
    )
    assert.equal(peekDeletions('customers').length, before)
  })

  it('rolls back local persist on failure', async () => {
    const persisted = []
    const snapshot = ['a']
    const next = ['a', 'b']
    await assert.rejects(
      () => writeCloudFirst({
        snapshot,
        next,
        persistLocal: async (v) => { persisted.push(v) },
        flush: async () => { throw new Error('fail') },
      }),
      /fail/,
    )
    assert.deepEqual(persisted, [snapshot])
  })
})

describe('writeInventoryCloudFirst', () => {
  it('updates products and stock log after flush', async () => {
    let products = []
    let stockLog = []
    await writeInventoryCloudFirst({
      nextProducts: [{ id: 'P1' }],
      nextStockLog: [{ id: 'L1' }],
      setProducts: (v) => { products = v },
      setStockLog: (v) => { stockLog = v },
      flush: async () => {},
    })
    assert.deepEqual(products, [{ id: 'P1' }])
    assert.deepEqual(stockLog, [{ id: 'L1' }])
  })
})

describe('writeListCloudFirst', () => {
  it('skips flush when cloud is not configured', async () => {
    let flushed = false
    let state = []
    await writeListCloudFirst({
      next: [1],
      setState: (v) => { state = v },
      flush: async () => { flushed = true },
      isCloudConfigured: false,
    })
    assert.equal(flushed, false)
    assert.deepEqual(state, [1])
  })
})
