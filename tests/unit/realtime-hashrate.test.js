'use strict'

const test = require('brittle')
const WrkMinerPoolRackOcean = require('../../workers/ocean.rack.minerpool.wrk')
const { POOL_TYPE, SCHEDULER_TIMES } = require('../../workers/lib/constants')
const utilsStore = require('@tetherto/hp-svc-facs-store/utils')

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

function mockBee () {
  const rows = new Map()
  const inRange = (hex, { gte, lte, lt }) =>
    (!gte || hex >= gte.toString('hex')) &&
    (!lte || hex <= lte.toString('hex')) &&
    (!lt || hex < lt.toString('hex'))

  return {
    rows,
    async get (key) {
      const value = rows.get(key.toString('hex'))
      return value === undefined ? null : { value }
    },
    async put (key, value) {
      rows.set(key.toString('hex'), value)
    },
    async del (key) {
      rows.delete(key.toString('hex'))
    },
    createReadStream (opts = {}) {
      const values = [...rows.entries()]
        .filter(([hex]) => inRange(hex, opts))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([hex, value]) => ({ key: Buffer.from(hex, 'hex'), value }))
      return (async function * () { yield * values })()
    }
  }
}

function row (bee, ts) {
  const value = bee.rows.get(utilsStore.convIntToBin(ts).toString('hex'))
  return value === undefined ? null : JSON.parse(value.toString())
}

function createWorker (accounts = ['user1', 'user2']) {
  const worker = Object.create(WrkMinerPoolRackOcean.prototype)
  worker.accounts = accounts
  worker.lastRealtimeSnapTs = {}
  worker.realtimeRetentionDays = 14
  worker.realtimeHashrateDb = mockBee()
  worker.data = { statsData: {} }
  worker.errors = []
  worker._logErr = (msg) => worker.errors.push(msg)
  return worker
}

function oceanApi (responses) {
  return {
    calls: [],
    async getHashRateInfo (username) {
      this.calls.push(username)
      const next = responses[username]?.shift()
      if (next instanceof Error) throw next
      return next ?? {}
    }
  }
}

const SNAP_1 = 1793876520
const SNAP_2 = 1793876580

test('realtime scheduler polls twice a minute off the minute boundary', (t) => {
  t.is(SCHEDULER_TIMES._RT.time, '15,45 * * * * *')
  t.is(SCHEDULER_TIMES._RT.key, 'rt')
})

test('fetchRealtimeHashrate stores one row per Ocean snap with every account', async (t) => {
  const worker = createWorker()
  worker.oceanApi = oceanApi({
    user1: [{ snap_ts: String(SNAP_1), hashrate_60s: '600000000000000000' }],
    user2: [{ snap_ts: String(SNAP_1), hashrate_60s: '10000000000000000' }]
  })

  await worker.fetchRealtimeHashrate()

  t.alike(row(worker.realtimeHashrateDb, SNAP_1 * 1000), {
    ts: SNAP_1 * 1000,
    accounts: ['user1', 'user2'],
    entries: [
      { username: 'user1', hashrate: 600000000000000000 },
      { username: 'user2', hashrate: 10000000000000000 }
    ]
  })
})

test('fetchRealtimeHashrate skips a snap it already stored', async (t) => {
  const worker = createWorker(['user1'])
  worker.oceanApi = oceanApi({
    user1: [
      { snap_ts: String(SNAP_1), hashrate_60s: '5' },
      { snap_ts: String(SNAP_1), hashrate_60s: '9' },
      { snap_ts: String(SNAP_2), hashrate_60s: '7' }
    ]
  })

  await worker.fetchRealtimeHashrate()
  await worker.fetchRealtimeHashrate()
  await worker.fetchRealtimeHashrate()

  t.is(worker.realtimeHashrateDb.rows.size, 2)
  t.is(row(worker.realtimeHashrateDb, SNAP_1 * 1000).entries[0].hashrate, 5)
  t.is(row(worker.realtimeHashrateDb, SNAP_2 * 1000).entries[0].hashrate, 7)
})

test('fetchRealtimeHashrate never stores a failed or empty response', async (t) => {
  const worker = createWorker()
  worker.oceanApi = oceanApi({
    user1: [{}],
    user2: [{ snap_ts: String(SNAP_1), hashrate_60s: null }]
  })

  await worker.fetchRealtimeHashrate()
  t.is(worker.realtimeHashrateDb.rows.size, 0)
  t.alike(worker.lastRealtimeSnapTs, {})
})

test('fetchRealtimeHashrate keeps a real zero hashrate', async (t) => {
  const worker = createWorker(['user1'])
  worker.oceanApi = oceanApi({ user1: [{ snap_ts: String(SNAP_1), hashrate_60s: '0' }] })

  await worker.fetchRealtimeHashrate()
  t.is(row(worker.realtimeHashrateDb, SNAP_1 * 1000).entries[0].hashrate, 0)
})

test('fetchRealtimeHashrate fills an account missed earlier on the same snap', async (t) => {
  const worker = createWorker()
  worker.oceanApi = oceanApi({
    user1: [{ snap_ts: String(SNAP_1), hashrate_60s: '5' }, { snap_ts: String(SNAP_1), hashrate_60s: '5' }],
    user2: [{}, { snap_ts: String(SNAP_1), hashrate_60s: '3' }]
  })

  await worker.fetchRealtimeHashrate()
  t.is(row(worker.realtimeHashrateDb, SNAP_1 * 1000).entries.length, 1)

  await worker.fetchRealtimeHashrate()
  t.alike(row(worker.realtimeHashrateDb, SNAP_1 * 1000).entries, [
    { username: 'user1', hashrate: 5 },
    { username: 'user2', hashrate: 3 }
  ])
})

test('fetchRealtimeHashrate does not overlap itself', async (t) => {
  const worker = createWorker(['user1'])
  let release
  worker.oceanApi = {
    calls: 0,
    getHashRateInfo () {
      this.calls++
      return new Promise(resolve => { release = () => resolve({ snap_ts: String(SNAP_1), hashrate_60s: '1' }) })
    }
  }

  const first = worker.fetchRealtimeHashrate()
  await worker.fetchRealtimeHashrate()
  release()
  await first
  t.is(worker.oceanApi.calls, 1)
})

test('fetchRealtimeHashrate logs and recovers when the API throws', async (t) => {
  const worker = createWorker(['user1'])
  worker.oceanApi = oceanApi({ user1: [new Error('down'), { snap_ts: String(SNAP_1), hashrate_60s: '1' }] })

  await worker.fetchRealtimeHashrate()
  t.alike(worker.errors, ['ERR_FETCH_REALTIME_HASHRATE'])

  await worker.fetchRealtimeHashrate()
  t.is(worker.realtimeHashrateDb.rows.size, 1)
})

test('getWrkExtData hashrate-1m reports missing accounts as null', async (t) => {
  const worker = createWorker()
  const t1 = SNAP_1 * 1000
  const t2 = SNAP_2 * 1000
  await worker._mergeRealtimeHashrate(t1, [{ username: 'user1', hashrate: 5 }, { username: 'user2', hashrate: 3 }])
  await worker._mergeRealtimeHashrate(t2, [{ username: 'user2', hashrate: 4 }])

  const data = await worker.getWrkExtData({ query: { key: 'hashrate-1m', start: t1, end: t2 } })

  t.alike(data, [
    { ts: t1, stats: [{ poolType: POOL_TYPE, username: 'user1', hashrate: 5 }, { poolType: POOL_TYPE, username: 'user2', hashrate: 3 }] },
    { ts: t2, stats: [{ poolType: POOL_TYPE, username: 'user1', hashrate: null }, { poolType: POOL_TYPE, username: 'user2', hashrate: 4 }] }
  ])
})

test('getWrkExtData hashrate-1m only expects accounts configured when the row was written', async (t) => {
  const worker = createWorker(['user1'])
  const t1 = SNAP_1 * 1000
  await worker._mergeRealtimeHashrate(t1, [{ username: 'user1', hashrate: 5 }])
  worker.accounts = ['user1', 'user2']

  const data = await worker.getWrkExtData({ query: { key: 'hashrate-1m', start: t1, end: t1 } })
  t.alike(data[0].stats, [{ poolType: POOL_TYPE, username: 'user1', hashrate: 5 }])
})

test('getWrkExtData hashrate-1m requires a range', async (t) => {
  const worker = createWorker()
  await t.exception(() => worker.getWrkExtData({ query: { key: 'hashrate-1m' } }), /ERR_START_INVALID/)
})

test('pruneRealtimeHashrate drops rows past retention', async (t) => {
  const worker = createWorker(['user1'])
  const now = Date.parse('2026-11-06T00:00:00Z')
  const old = now - 15 * DAY_MS
  const edge = now - 14 * DAY_MS
  const recent = now - MINUTE_MS
  for (const ts of [old, edge, recent]) {
    await worker._mergeRealtimeHashrate(ts, [{ username: 'user1', hashrate: 1 }])
  }

  await worker.pruneRealtimeHashrate(now)

  t.absent(row(worker.realtimeHashrateDb, old))
  t.ok(row(worker.realtimeHashrateDb, edge))
  t.ok(row(worker.realtimeHashrateDb, recent))
})

test('fetchData routes the realtime and daily keys', async (t) => {
  const worker = createWorker()
  const calls = []
  worker.fetchRealtimeHashrate = async () => calls.push('rt')
  worker.fetchTransactions = async () => calls.push('tx')
  worker.fetchBlocks = async () => calls.push('blocks')
  worker.fetchYearlyBalances = async () => calls.push('balances')
  worker.pruneRealtimeHashrate = async (now) => calls.push(`prune:${now}`)

  await worker.fetchData(SCHEDULER_TIMES._RT.key, new Date(1000))
  await worker.fetchData(SCHEDULER_TIMES._1D.key, new Date(2000))

  t.alike(calls, ['rt', 'tx', 'blocks', 'balances', 'prune:2000'])
})
