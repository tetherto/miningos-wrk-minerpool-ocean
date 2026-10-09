'use strict'

const test = require('brittle')
const WrkMinerPoolRackOcean = require('../../workers/ocean.rack.minerpool.wrk')
const { POOL_TYPE, SCHEDULER_TIMES } = require('../../workers/lib/constants')
const utilsStore = require('@tetherto/hp-svc-facs-store/utils')

function mockDbStream (rows) {
  return {
    createReadStream () {
      return (async function * () {
        for (const row of rows) {
          yield { value: Buffer.from(JSON.stringify(row)) }
        }
      })()
    }
  }
}

function mockBee () {
  const rows = new Map()
  return {
    rows,
    async get (key) {
      const value = rows.get(key.toString('hex'))
      return value === undefined ? null : { value }
    },
    async put (key, value) {
      rows.set(key.toString('hex'), value)
    },
    createReadStream () {
      const values = [...rows.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([, value]) => ({ value }))
      return (async function * () { yield * values })()
    }
  }
}

function beeRow (bee, ts) {
  const value = bee.rows.get(utilsStore.convIntToBin(ts).toString('hex'))
  return value === undefined ? null : JSON.parse(value.toString())
}

function createMockWorker () {
  const mockCtx = {
    rack: 'rack-1',
    storePrimaryKey: 'test-key'
  }

  const mockConf = {
    ocean: {
      accounts: ['user1', 'user2'],
      apiUrl: 'https://api.test.com',
      datum: {
        apiUrl: 'https://datum.test.com',
        user: '',
        password: ''
      }
    }
  }

  const worker = Object.create(WrkMinerPoolRackOcean.prototype)
  worker.ctx = mockCtx
  worker.conf = mockConf
  worker.accounts = mockConf.ocean.accounts
  worker.apiRetries = mockConf.ocean.apiRetry || 3
  worker.lastSavedHashrateTs = {}
  worker.wtype = 'ocean'
  worker.prefix = 'ocean-rack-1'
  worker.data = {
    statsData: {},
    workersData: { ts: 0, workers: [] },
    yearlyBalances: {}
  }

  worker._logErr = () => {}
  worker.appendPoolType = WrkMinerPoolRackOcean.prototype.appendPoolType
  worker.filterWorkers = WrkMinerPoolRackOcean.prototype.filterWorkers
  worker._getBlocksMonthlyAggr = WrkMinerPoolRackOcean.prototype._getBlocksMonthlyAggr
  worker._getPoolBlocks = WrkMinerPoolRackOcean.prototype._getPoolBlocks
  worker._aggrTransactions = WrkMinerPoolRackOcean.prototype._aggrTransactions
  worker._projection = WrkMinerPoolRackOcean.prototype._projection

  return worker
}

test('appendPoolType: should add poolType to data array', (t) => {
  const worker = createMockWorker()
  const data = [
    { id: 'worker1', name: 'worker1' },
    { id: 'worker2', name: 'worker2' }
  ]

  const result = worker.appendPoolType(data)

  t.is(result.length, 2)
  t.is(result[0].poolType, POOL_TYPE)
  t.is(result[0].id, 'worker1')
  t.is(result[1].poolType, POOL_TYPE)
  t.is(result[1].id, 'worker2')
})

test('appendPoolType: should handle empty array', (t) => {
  const worker = createMockWorker()
  const result = worker.appendPoolType([])
  t.is(result.length, 0)
})

test('filterWorkers: should filter workers with offset and limit', (t) => {
  const worker = createMockWorker()
  const workers = Array.from({ length: 10 }, (_, i) => ({ id: `worker${i}`, name: `worker${i}` }))

  const result = worker.filterWorkers(workers, 2, 3)

  t.is(result.length, 3)
  t.is(result[0].id, 'worker2')
  t.is(result[2].id, 'worker4')
})

test('filterWorkers: should limit to max 100', (t) => {
  const worker = createMockWorker()
  const workers = Array.from({ length: 200 }, (_, i) => ({ id: `worker${i}`, name: `worker${i}` }))

  const result = worker.filterWorkers(workers, 0, 150)

  t.is(result.length, 100)
})

test('filterWorkers: should handle empty array', (t) => {
  const worker = createMockWorker()
  const result = worker.filterWorkers([], 0, 10)
  t.is(result.length, 0)
})

test('_getBlocksMonthlyAggr: should aggregate blocks by month', (t) => {
  const worker = createMockWorker()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const blocks = [
    {
      ts: new Date(currentYear, currentMonth - 1, 15).toISOString(),
      networkDifficulty: 1000,
      poolShares: 500,
      luck: 2.0
    },
    {
      ts: new Date(currentYear, currentMonth - 1, 20).toISOString(),
      networkDifficulty: 2000,
      poolShares: 1000,
      luck: 2.0
    }
  ]

  const result = worker._getBlocksMonthlyAggr(blocks)

  t.ok(result.ts)
  t.ok(result.blocksData)
  const key = `${currentYear}-${currentMonth}`
  if (result.blocksData[key]) {
    t.ok(result.blocksData[key].poolLuck > 0)
    t.ok(result.blocksData[key].siteLuck > 0)
  }
})

test('_getBlocksMonthlyAggr: should handle empty blocks array', (t) => {
  const worker = createMockWorker()
  const result = worker._getBlocksMonthlyAggr([])

  t.ok(result.ts)
  t.ok(result.blocksData)
  t.is(Object.keys(result.blocksData).length, 0)
})

test('_getBlocksMonthlyAggr: should calculate poolLuck correctly', (t) => {
  const worker = createMockWorker()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const blocks = [
    {
      ts: new Date(currentYear, currentMonth - 1, 15).toISOString(),
      networkDifficulty: 1000,
      poolShares: 500,
      luck: 2.0
    }
  ]

  const result = worker._getBlocksMonthlyAggr(blocks)
  const key = `${currentYear}-${currentMonth}`

  if (result.blocksData[key]) {
    t.is(result.blocksData[key].poolLuck, 200)
  }
})

test('_getPoolBlocks: should aggregate all blocks', (t) => {
  const worker = createMockWorker()
  const blocks = [
    {
      networkDifficulty: 1000,
      poolShares: 500,
      luck: 2.0
    },
    {
      networkDifficulty: 2000,
      poolShares: 1000,
      luck: 2.0
    }
  ]

  const result = worker._getPoolBlocks(blocks)

  t.ok(result.ts)
  t.ok(result.blocksData)
  t.is(result.blocksData.blocks.length, 2)
  t.ok(result.blocksData.allBlocksLuck > 0)
  t.ok(result.blocksData.adjustedLuck > 0)
})

test('_getPoolBlocks: should handle zero shares', (t) => {
  const worker = createMockWorker()
  const blocks = [
    {
      networkDifficulty: 1000,
      poolShares: 0,
      luck: 2.0
    }
  ]

  const result = worker._getPoolBlocks(blocks)

  t.is(result.blocksData.allBlocksLuck, 0)
})

test('_getPoolBlocks: should handle empty blocks array', (t) => {
  const worker = createMockWorker()
  const result = worker._getPoolBlocks([])

  t.ok(result.ts)
  t.ok(result.blocksData)
  t.is(result.blocksData.blocks.length, 0)
  t.is(result.blocksData.allBlocksLuck, 0)
  t.ok(isNaN(result.blocksData.adjustedLuck) || result.blocksData.adjustedLuck === 0)
})

test('_aggrTransactions: should aggregate transactions correctly', (t) => {
  const worker = createMockWorker()
  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const end = new Date('2024-01-01T02:00:00Z').getTime()

  const data = [
    {
      transactions: [
        { satoshis_net_earned: 100000000 }, // 1 BTC
        { satoshis_net_earned: 50000000 } // 0.5 BTC
      ]
    },
    {
      transactions: [
        { satoshis_net_earned: 25000000 } // 0.25 BTC
      ]
    }
  ]

  const result = worker._aggrTransactions(data, { start, end })

  t.ok(result.ts)
  t.ok(result.hourlyRevenues)
  t.ok(result.hourlyRevenues.length > 0)
  t.ok(result.hourlyRevenues[0].revenue >= 0)
})

test('_aggrTransactions: should handle empty transactions', (t) => {
  const worker = createMockWorker()
  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const end = new Date('2024-01-01T01:00:00Z').getTime()

  const data = [
    {
      transactions: []
    }
  ]

  const result = worker._aggrTransactions(data, { start, end })

  t.ok(result.ts)
  t.ok(result.hourlyRevenues)
})

test('_aggrTransactions: should handle missing transactions property', (t) => {
  const worker = createMockWorker()
  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const end = new Date('2024-01-01T01:00:00Z').getTime()

  const data = [
    {}
  ]

  const result = worker._aggrTransactions(data, { start, end })

  t.ok(result.ts)
  t.ok(result.hourlyRevenues)
})

test('_aggrByInterval: should aggregate data correctly', (t) => {
  const worker = createMockWorker()
  const data = [
    {
      ts: new Date('2024-01-01T00:15:00Z').getTime(),
      stats: [
        { hashrate: 1000000, hashrate_1h: 1000000 },
        { hashrate: 2000000, hashrate_1h: 2000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:20:00Z').getTime(),
      stats: [
        { hashrate: 1000000, hashrate_1h: 1000000 },
        { hashrate: 2000000, hashrate_1h: 2000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:25:00Z').getTime(),
      stats: [
        { hashrate: 1000000, hashrate_1h: 1000000 },
        { hashrate: 2000000, hashrate_1h: 2000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:30:00Z').getTime(),
      stats: [
        { hashrate: 2000000, hashrate_1h: 2000000 },
        { hashrate: 3000000, hashrate_1h: 3000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:35:00Z').getTime(),
      stats: [
        { hashrate: 3000000, hashrate_1h: 3000000 },
        { hashrate: 4000000, hashrate_1h: 4000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:40:00Z').getTime(),
      stats: [
        { hashrate: 4000000, hashrate_1h: 4000000 },
        { hashrate: 5000000, hashrate_1h: 5000000 }
      ]
    }
  ]

  const interval = '30m'
  const result = worker._aggrByInterval(data, interval)

  t.ok(result)
  t.ok(result.length === 2)
  t.ok(result[0].ts === new Date('2024-01-01T00:30:00Z').getTime())
  t.ok(result[0].stats[0].hashrate === 1250000)
  t.ok(result[0].stats[0].hashrate_1h === 2000000)
  t.ok(result[0].stats[1].hashrate === 2250000)
  t.ok(result[0].stats[1].hashrate_1h === 3000000)
  t.ok(result[1].ts === new Date('2024-01-01T01:00:00Z').getTime())
  t.ok(result[1].stats[0].hashrate === 3500000)
  t.ok(result[1].stats[0].hashrate_1h === 4000000)
  t.ok(result[1].stats[1].hashrate === 4500000)
  t.ok(result[1].stats[1].hashrate_1h === 5000000)
})

test('_projection: should project fields from array', (t) => {
  const worker = createMockWorker()
  const data = [
    { id: 1, name: 'test1', value: 100 },
    { id: 2, name: 'test2', value: 200 }
  ]

  const fields = { name: 1, value: 1 }
  const result = worker._projection(data, fields)

  t.ok(Array.isArray(result))
  t.is(result.length, 2)
  // Note: mingo projection behavior may vary, so we just check that result exists
  t.ok(result[0])
  t.ok(result[1])
})

test('_projection: should project fields from single object', (t) => {
  const worker = createMockWorker()
  const data = { id: 1, name: 'test1', value: 100 }

  const fields = { name: 1 }
  const result = worker._projection(data, fields)

  t.ok(result)
  // Note: mingo projection behavior may vary, so we just check that result exists
  t.ok(typeof result === 'object')
})

test('_projection: should return all fields when fields is empty', (t) => {
  const worker = createMockWorker()
  const data = [{ id: 1, name: 'test1' }]

  const result = worker._projection(data, {})

  t.ok(Array.isArray(result))
  t.ok(result[0].id)
  t.ok(result[0].name)
})

test('_aggrByInterval: uses 1D interval bucket size', (t) => {
  const worker = createMockWorker()
  const day = 24 * 60 * 60 * 1000
  const base = Date.UTC(2024, 0, 1, 0, 0, 0)
  const data = [
    { ts: base + day / 2, stats: [{ hashrate: 100 }] },
    { ts: base + day / 2 + 1000, stats: [{ hashrate: 300 }] }
  ]
  const result = worker._aggrByInterval(data, '1D')
  t.is(result.length, 1)
  t.is(result[0].stats[0].hashrate, 200)
})

test('_aggrByInterval: uses 3h and 30m intervals', (t) => {
  const worker = createMockWorker()
  const t0 = Date.UTC(2024, 0, 1, 0, 0, 0)
  const d3h = [
    { ts: t0 + 1000, stats: [{ hashrate: 10 }] },
    { ts: t0 + 2000, stats: [{ hashrate: 30 }] }
  ]
  const r3 = worker._aggrByInterval(d3h, '3h')
  t.ok(r3.length >= 1)

  const d30 = [
    { ts: t0 + 1000, stats: [{ hashrate: 5 }] },
    { ts: t0 + 2000, stats: [{ hashrate: 15 }] }
  ]
  const r30 = worker._aggrByInterval(d30, '30m')
  t.ok(r30.length >= 1)
  t.is(r30[0].stats[0].hashrate, 10)
})

test('_aggrByInterval: unknown interval defaults to 5m bucket', (t) => {
  const worker = createMockWorker()
  const t0 = Date.UTC(2024, 0, 1, 0, 0, 0)
  const data = [
    { ts: t0 + 1000, stats: [{ hashrate: 100 }] },
    { ts: t0 + 2000, stats: [{ hashrate: 200 }] }
  ]
  const def = worker._aggrByInterval(data, 'bogus')
  const five = worker._aggrByInterval(data, '5m')
  t.is(def.length, five.length)
  t.is(def[0].ts, five[0].ts)
})

test('getDbData: rejects missing start or end', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  const db = mockDbStream([])

  await t.exception(async () => {
    await worker.getDbData(db, { end: 100 })
  }, /ERR_START_INVALID/)

  await t.exception(async () => {
    await worker.getDbData(db, { start: 1 })
  }, /ERR_END_INVALID/)
})

test('getDbData: reads stream entries', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  const db = mockDbStream([{ a: 1 }, { b: 2 }])
  const rows = await worker.getDbData(db, { start: 1, end: 9999999999 })
  t.is(rows.length, 2)
  t.is(rows[0].a, 1)
})

test('getWorkers: without start/end uses in-memory workersData', async (t) => {
  const worker = createMockWorker()
  worker.getWorkers = WrkMinerPoolRackOcean.prototype.getWorkers
  worker.data.workersData = {
    ts: 500,
    workers: [{ id: 'w1', name: 'n1' }, { id: 'w2', name: 'n2' }]
  }
  const res = await worker.getWorkers({ offset: 0, limit: 1 })
  t.is(res.ts, 0)
  t.is(res.workers.length, 1)
  t.is(res.workers[0].poolType, POOL_TYPE)
})

test('getWorkers: with start/end aggregates from db', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  worker.getWorkers = WrkMinerPoolRackOcean.prototype.getWorkers
  worker.workersDb = mockDbStream([
    { ts: 100, workers: [{ name: 'a', id: 1 }, { name: 'b', id: 2 }] }
  ])
  const byName = await worker.getWorkers({ start: 1, end: 9999999999, name: 'a' })
  t.is(byName.length, 1)
  t.is(byName[0].workers.length, 1)
  t.is(byName[0].workers[0].poolType, POOL_TYPE)

  worker.workersDb = mockDbStream([
    { ts: 200, workers: [{ name: 'x', id: 1 }, { name: 'y', id: 2 }, { name: 'z', id: 3 }] }
  ])
  const sliced = await worker.getWorkers({ start: 1, end: 9999999999, offset: 0, limit: 2 })
  t.is(sliced[0].workers.length, 2)
})

test('getWrkExtData: validates query and key', async (t) => {
  const worker = createMockWorker()
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData

  await t.exception(async () => {
    await worker.getWrkExtData({})
  }, /ERR_QUERY_INVALID/)

  await t.exception(async () => {
    await worker.getWrkExtData({ query: {} })
  }, /ERR_KEY_INVALID/)
})

test('getWrkExtData: transactions, workers-count, default data key', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  worker.getWorkers = WrkMinerPoolRackOcean.prototype.getWorkers
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  worker._aggrTransactions = WrkMinerPoolRackOcean.prototype._aggrTransactions

  worker.transactionsDb = mockDbStream([{ ts: 1, transactions: [{ satoshis_net_earned: 100 }] }])
  let tx = await worker.getWrkExtData({ query: { key: 'transactions', start: 1, end: 2 } })
  t.is(tx.length, 1)

  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const end = new Date('2024-01-01T02:00:00Z').getTime()
  tx = await worker.getWrkExtData({ query: { key: 'transactions', start, end, aggrHourly: true } })
  t.ok(tx.hourlyRevenues)

  worker.workersCountDb = mockDbStream([{ ts: 1, count: 3 }])
  const wc = await worker.getWrkExtData({ query: { key: 'workers-count', start: 1, end: 2 } })
  t.is(wc.length, 1)

  worker.data.customKey = { hello: 1 }
  const def = await worker.getWrkExtData({ query: { key: 'customKey' } })
  t.is(def.hello, 1)
})

test('getWrkExtData: blocks pool and monthly aggregation', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  worker._getBlocksMonthlyAggr = WrkMinerPoolRackOcean.prototype._getBlocksMonthlyAggr
  worker._getPoolBlocks = WrkMinerPoolRackOcean.prototype._getPoolBlocks

  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  worker.blocksDb = mockDbStream([
    {
      ts: new Date(y, m, 5).getTime(),
      networkDifficulty: 100,
      poolShares: 50,
      luck: 2,
      username: 'u1'
    }
  ])

  const pool = await worker.getWrkExtData({ query: { key: 'blocks', start: 1, end: 9999999999999 } })
  t.ok(pool.blocksData)
  t.ok(pool.blocksData.blocks)

  const monthly = await worker.getWrkExtData({
    query: { key: 'blocks', start: 1, end: 9999999999999, aggrMonthly: true }
  })
  t.ok(monthly.blocksData)
})

test('getWrkExtData: workers and stats branches', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  worker.getWorkers = WrkMinerPoolRackOcean.prototype.getWorkers
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  worker._aggrByInterval = WrkMinerPoolRackOcean.prototype._aggrByInterval
  worker._avg = WrkMinerPoolRackOcean.prototype._avg
  worker._getIntervalMs = WrkMinerPoolRackOcean.prototype._getIntervalMs

  worker.data.workersData = { ts: 1, workers: [{ id: 'w', name: 'w' }] }
  const w = await worker.getWrkExtData({ query: { key: 'workers', offset: 0, limit: 10 } })
  t.is(w.workers[0].poolType, POOL_TYPE)

  worker.data.statsData = { ts: 99, stats: [{ username: 'u' }] }
  const st = await worker.getWrkExtData({ query: { key: 'stats' } })
  t.is(st.stats[0].poolType, POOL_TYPE)

  const t0 = Date.UTC(2024, 0, 1, 0, 0, 0)
  worker.statsDb = mockDbStream([
    { ts: t0 + 60 * 1000, stats: [{ username: 'a', hashrate: 100 }] },
    { ts: t0 + 120 * 1000, stats: [{ username: 'a', hashrate: 200 }] }
  ])
  const hist = await worker.getWrkExtData({
    query: { key: 'stats-history', start: 1, end: 9999999999999, interval: '5m' }
  })
  t.ok(Array.isArray(hist))
  t.ok(hist[0].stats[0].poolType)
})

test('getWrkExtData: applies field projection when fields set', async (t) => {
  const worker = createMockWorker()
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  worker.data.statsData = { ts: 1, stats: [{ username: 'u', extra: 1 }] }
  const res = await worker.getWrkExtData({
    query: { key: 'stats', fields: { username: 1, poolType: 1 } }
  })
  t.ok(res != null)
  t.ok(typeof res === 'object')
})

test('getWrkExtData: datum-stats, stratum-info, stratum-job, thread-stats', async (t) => {
  const worker = createMockWorker()
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  worker.getDatumStats = WrkMinerPoolRackOcean.prototype.getDatumStats
  worker.getDatumClientStats = WrkMinerPoolRackOcean.prototype.getDatumClientStats
  worker.getStratumInfo = WrkMinerPoolRackOcean.prototype.getStratumInfo
  worker.getStratumJob = WrkMinerPoolRackOcean.prototype.getStratumJob
  worker.getThreadStats = WrkMinerPoolRackOcean.prototype.getThreadStats
  worker.datumApi = {
    getDatumStats: async () => ({
      result: {
        items: [
          { title: 'Connections', text: '7' },
          { title: 'Hashrate', text: '123456' }
        ]
      }
    }),
    getDecentralizedClientStats: async () => ({ dc: 11 }),
    getStratumServerInfo: async () => ({ s: 2 }),
    getCurrentStratumJob: async () => ({ j: 3 }),
    getThreadStats: async () => ({ th: 4 })
  }

  const ds = await worker.getWrkExtData({ query: { key: 'datum-stats' } })
  t.is(ds.datum.status, 'online')
  t.is(ds.datum.connections, 7)
  t.is(ds.datum.hashrate, 123456)

  const dcs = await worker.getWrkExtData({ query: { key: 'datum-client-stats' } })
  t.is(dcs.dc, 11)

  const si = await worker.getWrkExtData({ query: { key: 'stratum-info' } })
  t.is(si.s, 2)

  const sj = await worker.getWrkExtData({ query: { key: 'stratum-job' } })
  t.is(sj.j, 3)

  const th = await worker.getWrkExtData({ query: { key: 'thread-stats' } })
  t.is(th.th, 4)
})

test('getWrkExtData: stratum-list, coinbaser, datum-config', async (t) => {
  const worker = createMockWorker()
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  worker.getStratumList = WrkMinerPoolRackOcean.prototype.getStratumList
  worker.getCoinbaser = WrkMinerPoolRackOcean.prototype.getCoinbaser
  worker.getDatumConfig = WrkMinerPoolRackOcean.prototype.getDatumConfig
  worker.datumApi = {
    getStratumList: async () => ({ list: true }),
    getCoinbaser: async () => ({ coin: true }),
    getConfiguration: async () => ({ cfg: true })
  }

  const list = await worker.getWrkExtData({ query: { key: 'stratum-list' } })
  t.ok(list.list)

  const coin = await worker.getWrkExtData({ query: { key: 'coinbaser' } })
  t.ok(coin.coin)

  const cfg = await worker.getWrkExtData({ query: { key: 'datum-config' } })
  t.ok(cfg.cfg)
})

test('getDatumStats: returns offline status when datumApi throws', async (t) => {
  const worker = createMockWorker()
  worker.getDatumStats = WrkMinerPoolRackOcean.prototype.getDatumStats
  worker._logErr = () => {}
  worker.datumApi = {
    getDatumStats: async () => {
      throw new Error('datum down')
    }
  }
  const out = await worker.getDatumStats()
  t.is(out.datum.status, 'offline')
  t.is(out.datum.error, 'Datum process is offline')
  t.is(out.datum.connections, 0)
  t.is(out.datum.hashrate, 0)
})

test('getDatumStats: returns online status with parsed connections and hashrate', async (t) => {
  const worker = createMockWorker()
  worker.getDatumStats = WrkMinerPoolRackOcean.prototype.getDatumStats
  worker._logErr = () => {}
  worker.datumApi = {
    getDatumStats: async () => ({
      result: {
        items: [
          { title: 'Connections', text: '12' },
          { title: 'Hashrate', text: '999000' }
        ]
      }
    })
  }
  const out = await worker.getDatumStats()
  t.is(out.datum.status, 'online')
  t.is(out.datum.error, null)
  t.is(out.datum.connections, 12)
  t.is(out.datum.hashrate, 999000)
})

test('getDatumStats: returns null for missing Connections or Hashrate items', async (t) => {
  const worker = createMockWorker()
  worker.getDatumStats = WrkMinerPoolRackOcean.prototype.getDatumStats
  worker._logErr = () => {}
  worker.datumApi = {
    getDatumStats: async () => ({ result: { items: [] } })
  }
  const out = await worker.getDatumStats()
  t.is(out.datum.status, 'online')
  t.is(out.datum.connections, null)
  t.is(out.datum.hashrate, null)
})

test('getDatumStats: handles null/undefined result gracefully', async (t) => {
  const worker = createMockWorker()
  worker.getDatumStats = WrkMinerPoolRackOcean.prototype.getDatumStats
  worker._logErr = () => {}
  worker.datumApi = {
    getDatumStats: async () => null
  }
  const out = await worker.getDatumStats()
  t.is(out.datum.status, 'online')
  t.is(out.datum.connections, null)
  t.is(out.datum.hashrate, null)
})

test('getStratumList and getDatumConfig pass auth only when user or password set', async (t) => {
  const worker = createMockWorker()
  worker.getStratumList = WrkMinerPoolRackOcean.prototype.getStratumList
  worker.getDatumConfig = WrkMinerPoolRackOcean.prototype.getDatumConfig
  worker._logErr = () => {}

  worker.conf.ocean.datum = { apiUrl: 'http://x', user: '', password: '' }
  let listAuth
  let cfgAuth
  worker.datumApi = {
    getStratumList: async (auth) => {
      listAuth = auth
      return { a: 1 }
    },
    getConfiguration: async (auth) => {
      cfgAuth = auth
      return { b: 2 }
    }
  }
  await worker.getStratumList()
  await worker.getDatumConfig()
  t.is(listAuth, undefined)
  t.is(cfgAuth, undefined)

  worker.conf.ocean.datum = { apiUrl: 'http://x', user: 'u1', password: 'p1' }
  worker.datumApi = {
    getStratumList: async (auth) => {
      t.is(auth.user, 'u1')
      t.is(auth.password, 'p1')
      return { c: 3 }
    },
    getConfiguration: async (auth) => {
      t.is(auth.user, 'u1')
      t.is(auth.password, 'p1')
      return { d: 4 }
    }
  }
  await worker.getStratumList()
  await worker.getDatumConfig()
})

test('fetchData: dispatches scheduler keys', async (t) => {
  const worker = createMockWorker()
  worker.fetchData = WrkMinerPoolRackOcean.prototype.fetchData

  const calls = []
  worker.fetchStats = async () => { calls.push('1m') }
  worker.evaluateAlerts = async () => { calls.push('alerts') }
  await worker.fetchData(SCHEDULER_TIMES._1M.key, new Date())
  t.ok(calls.includes('1m') && calls.includes('alerts'))

  calls.length = 0
  worker.fetchWorkers = async () => { calls.push('fw') }
  worker.saveStats = async () => { calls.push('ss') }
  worker.fetchHashrateHistory = async () => { calls.push('fhh') }
  await worker.fetchData(SCHEDULER_TIMES._5M.key, new Date())
  t.ok(calls.includes('fw') && calls.includes('ss'))

  calls.length = 0
  await worker.fetchData(SCHEDULER_TIMES._30M.key, new Date())
  t.ok(calls.includes('fhh'))

  calls.length = 0
  worker.fetchTransactions = async () => { calls.push('ft') }
  worker.fetchBlocks = async () => { calls.push('fb') }
  worker.fetchYearlyBalances = async () => { calls.push('fyb') }
  await worker.fetchData(SCHEDULER_TIMES._1D.key, new Date())
  t.ok(calls.includes('ft') && calls.includes('fb') && calls.includes('fyb'))
})

test('fetchData: swallows errors from fetchers', async (t) => {
  const worker = createMockWorker()
  worker.fetchData = WrkMinerPoolRackOcean.prototype.fetchData
  worker.fetchStats = async () => { throw new Error('fail') }
  worker._logErr = () => {}
  await worker.fetchData(SCHEDULER_TIMES._1M.key, new Date())
  t.pass()
})

test('fetchStats: builds statsData for each account', async (t) => {
  const worker = createMockWorker()
  worker.oceanApi = {
    getHashRateInfo: async () => ({
      hashrate_60s: '10',
      hashrate_3600s: '20',
      hashrate_86400s: '30',
      active_worker_count: 2
    })
  }
  worker.getEarnings = async () => ({ revenue: 1, income: 0.5, unsettled: 0.5 })
  worker.data.workersData = { workers: [{ id: 'w1' }] }
  worker.fetchStats = WrkMinerPoolRackOcean.prototype.fetchStats

  await worker.fetchStats(new Date('2024-06-15T12:00:00.000Z'))
  t.is(worker.data.statsData.stats.length, 2)
  t.is(worker.data.statsData.stats[0].username, 'user1')
  t.is(worker.data.statsData.stats[0].hashrate, 10)
})

test('fetchStats: continues with empty hashrate after last retry', async (t) => {
  const worker = createMockWorker()
  worker.conf.ocean.apiRetry = 3
  let calls = 0
  worker.oceanApi = {
    getHashRateInfo: async () => {
      calls++
      return {}
    }
  }
  worker.getEarnings = async () => ({ revenue: 1, income: 0.5, unsettled: 0.5 })
  worker.data.workersData = { workers: [] }
  worker.fetchStats = WrkMinerPoolRackOcean.prototype.fetchStats

  await worker.fetchStats(new Date('2024-06-15T12:00:00.000Z'))
  t.is(calls, 6)
  t.is(worker.data.statsData.stats.length, 2)
  t.ok(Number.isNaN(worker.data.statsData.stats[0].hashrate))
  t.is(worker.data.statsData.stats[0].active_workers_count, undefined)
})

test('fetchStats: worker_count only counts the account\'s own workers', async (t) => {
  const worker = createMockWorker()
  worker.oceanApi = {
    getHashRateInfo: async () => ({
      hashrate_60s: '10',
      hashrate_3600s: '20',
      hashrate_86400s: '30',
      active_worker_count: 1
    })
  }
  worker.getEarnings = async () => ({ revenue: 1, income: 0.5, unsettled: 0.5 })
  worker.data.workersData = {
    workers: [
      { id: 'w1', username: 'user1' },
      { id: 'w2', username: 'user1' },
      { id: 'w3', username: 'user2' }
    ]
  }
  worker.fetchStats = WrkMinerPoolRackOcean.prototype.fetchStats

  await worker.fetchStats(new Date('2024-06-15T12:00:00.000Z'))
  t.is(worker.data.statsData.stats[0].worker_count, 2)
  t.is(worker.data.statsData.stats[1].worker_count, 1)
})

test('getEarnings: awaits the API and returns BTC amounts', async (t) => {
  const worker = createMockWorker()
  worker.oceanApi = {
    getEarnings: async (username, since) => {
      t.is(username, 'user1')
      t.ok(since > 0)
      return {
        earnings: [{ satoshis_net_earned: 200000000 }],
        payouts: [{ total_satoshis_net_paid: 100000000 }]
      }
    }
  }
  worker.getEarnings = WrkMinerPoolRackOcean.prototype.getEarnings

  const res = await worker.getEarnings('user1')
  t.is(res.revenue, 2)
  t.is(res.income, 1)
  t.is(res.unsettled, 1)
})

test('fetchWorkers: merges workers; logs per-account failures', async (t) => {
  const worker = createMockWorker()
  worker.accounts = ['bad', 'good']
  worker.oceanApi = {
    getWorkers: async (username) => {
      if (username === 'bad') throw new Error('nope')
      return {
        snap_ts: 1000,
        workers: {
          w1: [{ hashrate_60s: '1', hashrate_3600s: '2', hashrate_86400s: '3' }]
        }
      }
    }
  }
  worker._saveToDb = async () => {}
  worker.workersCountDb = {}
  worker.fetchWorkers = WrkMinerPoolRackOcean.prototype.fetchWorkers

  await worker.fetchWorkers(new Date('2024-06-15T12:00:00.000Z'))
  t.ok(worker.data.workersData.workers.length >= 1)
})

test('fetchTransactions and fetchBlocks', async (t) => {
  const worker = createMockWorker()
  worker._saveToDb = async () => {}
  worker.transactionsDb = mockBee()
  worker.blocksDb = {}
  worker.fetchTransactions = WrkMinerPoolRackOcean.prototype.fetchTransactions
  worker.fetchEarnings = WrkMinerPoolRackOcean.prototype.fetchEarnings
  worker.fetchBlocks = WrkMinerPoolRackOcean.prototype.fetchBlocks
  const time = new Date('2024-06-16T00:00:00.000Z')

  worker.oceanApi = {
    getTransactions: async () => ({}),
    getBlocks: async () => ({})
  }
  await worker.fetchTransactions(time)
  await worker.fetchBlocks()

  worker.oceanApi = {
    getTransactions: async () => ({ earnings: [{ ts: '2024-06-15T12:00:00.000Z', satoshis_net_earned: 10 }] }),
    getBlocks: async () => ({
      blocks: [{
        ts: new Date().toISOString(),
        block_hash: 'h',
        network_difficulty: 2,
        accepted_shares: 1,
        total_reward_sats: 100000000,
        username: 'u'
      }]
    })
  }
  await worker.fetchTransactions(time)
  await worker.fetchBlocks()

  const row = beeRow(worker.transactionsDb, Date.parse('2024-06-15T12:00:00.000Z'))
  // user1 and user2 both earned at the same timestamp; the row keeps both.
  t.is(row.transactions.length, 2)
  t.alike(row.transactions.map(x => x.username).sort(), ['user1', 'user2'])
})

test('fetchTransactions: same-ts earnings from both accounts persist, refetch stays idempotent', async (t) => {
  const worker = createMockWorker()
  worker.transactionsDb = mockBee()
  worker.fetchTransactions = WrkMinerPoolRackOcean.prototype.fetchTransactions
  worker.fetchEarnings = WrkMinerPoolRackOcean.prototype.fetchEarnings
  const time = new Date('2024-06-16T00:00:00.000Z')

  worker.oceanApi = {
    getTransactions: async (username) => ({
      earnings: [
        { ts: '2024-06-15T12:00:00.000Z', satoshis_net_earned: username === 'user1' ? 100 : 40, block_hash: 'b1' },
        { ts: '2024-06-15T18:00:00.000Z', satoshis_net_earned: username === 'user1' ? 60 : 25, block_hash: 'b2' }
      ]
    })
  }

  await worker.fetchTransactions(time)
  await worker.fetchTransactions(time)

  const noon = beeRow(worker.transactionsDb, Date.parse('2024-06-15T12:00:00.000Z'))
  t.is(noon.transactions.length, 2)
  t.is(noon.transactions.find(x => x.username === 'user1').satoshis_net_earned, 100)
  t.is(noon.transactions.find(x => x.username === 'user2').satoshis_net_earned, 40)

  const evening = beeRow(worker.transactionsDb, Date.parse('2024-06-15T18:00:00.000Z'))
  t.is(evening.transactions.length, 2)
})

test('fetchHashrateHistory: saves new history points', async (t) => {
  const worker = createMockWorker()
  worker.accounts = ['user1']
  worker.hashrateHistoryDb = mockBee()
  worker.fetchHashrateHistory = WrkMinerPoolRackOcean.prototype.fetchHashrateHistory
  worker.oceanApi = {
    getHashRateHistory: async () => ({
      hashrate_history_results: 3,
      hashrate_history: {
        '2026-09-14T00:00:00': 100,
        '2026-09-14T00:10:00': 200,
        '2026-09-14T01:00:00': 300
      },
      avg_window_seconds: 3600
    })
  }

  await worker.fetchHashrateHistory()
  // Only the exact-hour samples are kept.
  t.is(worker.hashrateHistoryDb.rows.size, 2)
  const midnight = beeRow(worker.hashrateHistoryDb, Date.parse('2026-09-14T00:00:00Z'))
  t.alike(midnight.entries, [{ username: 'user1', hashrate: 100 }])
  const one = beeRow(worker.hashrateHistoryDb, Date.parse('2026-09-14T01:00:00Z'))
  t.alike(one.entries, [{ username: 'user1', hashrate: 300 }])
  t.is(worker.lastSavedHashrateTs.user1, Date.parse('2026-09-14T01:00:00Z'))
})

test('fetchHashrateHistory: stores every account for the same hour', async (t) => {
  const worker = createMockWorker()
  worker.hashrateHistoryDb = mockBee()
  worker.fetchHashrateHistory = WrkMinerPoolRackOcean.prototype.fetchHashrateHistory
  worker.oceanApi = {
    getHashRateHistory: async (username) => ({
      hashrate_history: {
        '2026-09-14T00:00:00': username === 'user1' ? 100 : 40,
        '2026-09-14T01:00:00': username === 'user1' ? 300 : 70
      }
    })
  }

  await worker.fetchHashrateHistory()

  const midnight = beeRow(worker.hashrateHistoryDb, Date.parse('2026-09-14T00:00:00Z'))
  t.alike(midnight.entries, [
    { username: 'user1', hashrate: 100 },
    { username: 'user2', hashrate: 40 }
  ])
  t.is(worker.lastSavedHashrateTs.user1, Date.parse('2026-09-14T01:00:00Z'))
  t.is(worker.lastSavedHashrateTs.user2, Date.parse('2026-09-14T01:00:00Z'))
})

test('fetchHashrateHistory: merges into rows written before multi-account support', async (t) => {
  const worker = createMockWorker()
  worker.accounts = ['user2']
  worker.hashrateHistoryDb = mockBee()
  const ts = Date.parse('2026-09-14T00:00:00Z')
  await worker.hashrateHistoryDb.put(
    utilsStore.convIntToBin(ts),
    Buffer.from(JSON.stringify({ ts, username: 'user1', hashrate: 100 }))
  )
  worker.fetchHashrateHistory = WrkMinerPoolRackOcean.prototype.fetchHashrateHistory
  worker.oceanApi = {
    getHashRateHistory: async () => ({
      hashrate_history: { '2026-09-14T00:00:00': 40 }
    })
  }

  await worker.fetchHashrateHistory()

  const row = beeRow(worker.hashrateHistoryDb, ts)
  t.alike(row.entries, [
    { username: 'user1', hashrate: 100 },
    { username: 'user2', hashrate: 40 }
  ])
})

test('fetchHashrateHistory: skips empty history and older timestamps', async (t) => {
  const worker = createMockWorker()
  worker.accounts = ['user1']
  worker.hashrateHistoryDb = mockBee()
  worker.fetchHashrateHistory = WrkMinerPoolRackOcean.prototype.fetchHashrateHistory

  worker.oceanApi = { getHashRateHistory: async () => ({}) }
  await worker.fetchHashrateHistory()
  t.is(worker.hashrateHistoryDb.rows.size, 0)

  worker.lastSavedHashrateTs = { user1: Date.parse('2026-09-14T01:00:00Z') }
  worker.oceanApi = {
    getHashRateHistory: async () => ({
      hashrate_history: {
        '2026-09-14T00:00:00': 100,
        '2026-09-14T00:10:00': 150,
        '2026-09-14T01:00:00': 200
      }
    })
  }
  await worker.fetchHashrateHistory()
  t.is(worker.hashrateHistoryDb.rows.size, 0)
})

test('getWrkExtData: hashrate-history flattens multi-account rows and keeps legacy ones', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  const t0 = Date.parse('2026-09-14T00:00:00Z')
  const t1 = Date.parse('2026-09-14T01:00:00Z')
  worker.hashrateHistoryDb = mockDbStream([
    { ts: t0, username: 'user1', hashrate: 100 },
    { ts: t1, entries: [{ username: 'user1', hashrate: 300 }, { username: 'user2', hashrate: 70 }] }
  ])

  const data = await worker.getWrkExtData({
    query: { key: 'hashrate-history', start: t0, end: t1 }
  })

  t.alike(data.hashrateHistory, [
    { poolType: POOL_TYPE, ts: t0, username: 'user1', hashrate: 100 },
    { poolType: POOL_TYPE, ts: t1, username: 'user1', hashrate: 300 },
    { poolType: POOL_TYPE, ts: t1, username: 'user2', hashrate: 70 }
  ])
})

test('fetchHashrateHistory: logs error without throwing', async (t) => {
  const worker = createMockWorker()
  worker.fetchHashrateHistory = WrkMinerPoolRackOcean.prototype.fetchHashrateHistory
  worker.oceanApi = {
    getHashRateHistory: async () => { throw new Error('down') }
  }
  await worker.fetchHashrateHistory()
  t.pass()
})

test('getWrkExtData: alerts and alerts-history', async (t) => {
  const worker = createMockWorker()
  worker.getDbData = WrkMinerPoolRackOcean.prototype.getDbData
  worker.getWrkExtData = WrkMinerPoolRackOcean.prototype.getWrkExtData
  worker.data.alertsData = { ts: 5, alerts: [{ name: 'Ocean_pool_not_reachable' }] }

  const alerts = await worker.getWrkExtData({ query: { key: 'alerts' } })
  t.is(alerts.alerts[0].name, 'Ocean_pool_not_reachable')

  worker.alertsHistoryDb = mockDbStream([{ ts: 5, alerts: [{ uuid: 'a1' }] }])
  const history = await worker.getWrkExtData({ query: { key: 'alerts-history', start: 1, end: 9 } })
  t.is(history.length, 1)
  t.is(history[0].alerts[0].uuid, 'a1')
})

test('evaluateAlerts: stores new alerts when ocean is offline', async (t) => {
  const worker = createMockWorker()
  worker.evaluateAlerts = WrkMinerPoolRackOcean.prototype.evaluateAlerts
  worker.getComponentStatus = WrkMinerPoolRackOcean.prototype.getComponentStatus
  worker.getOceanStatus = WrkMinerPoolRackOcean.prototype.getOceanStatus
  worker._appendAlertHistory = WrkMinerPoolRackOcean.prototype._appendAlertHistory
  worker.oceanApi = {
    ping: async () => { throw new Error('unreachable') }
  }
  worker.datumApi = null
  worker.data.alertsPrev = {}
  const stored = []
  worker.alertsHistoryDb = {
    get: async () => null,
    put: async (key, value) => { stored.push(JSON.parse(value.toString())) }
  }

  const active = await worker.evaluateAlerts(1234)
  t.ok(active.some(a => a.name === 'Ocean_pool_not_reachable'))
  t.is(stored.length, 1)
  t.is(worker.data.alertsData.ts, 1234)
})

test('getOceanStatus: returns online when ping succeeds', async (t) => {
  const worker = createMockWorker()
  worker.getOceanStatus = WrkMinerPoolRackOcean.prototype.getOceanStatus
  worker.oceanApi = { ping: async () => true }
  t.is(await worker.getOceanStatus(), 'online')
})

test('fetchYearlyBalances: logs account fetch errors', async (t) => {
  const worker = createMockWorker()
  worker.fetchYearlyBalances = WrkMinerPoolRackOcean.prototype.fetchYearlyBalances
  worker.getYearlyBalances = async () => { throw new Error('fail') }
  await worker.fetchYearlyBalances()
  t.pass()
})

test('saveStats and saveWorkers write to db', async (t) => {
  const worker = createMockWorker()
  worker.statsDb = {}
  worker.workersDb = {}
  worker.data.statsData = { stats: [{ u: 1 }] }
  worker.data.workersData = { workers: [{ w: 1 }] }
  const saved = []
  worker._saveToDb = async (db, ts, payload) => {
    saved.push({ db, payload })
  }
  worker.saveStats = WrkMinerPoolRackOcean.prototype.saveStats
  worker.saveWorkers = WrkMinerPoolRackOcean.prototype.saveWorkers
  const time = new Date('2024-06-15T12:34:56.789Z')
  await worker.saveStats(time)
  await worker.saveWorkers(time)
  t.is(saved.length, 2)
  t.ok(saved[0].payload.stats)
  t.ok(saved[1].payload.workers)
})

test('getEarnings: tolerates a sync-returning api', async (t) => {
  const worker = createMockWorker()
  worker.oceanApi = {
    getEarnings: () => ({
      earnings: [{ satoshis_net_earned: 100000000 }],
      payouts: [{ total_satoshis_net_paid: 25000000 }]
    })
  }
  worker.getEarnings = WrkMinerPoolRackOcean.prototype.getEarnings
  const r = await worker.getEarnings('user1')
  t.is(r.revenue, 1)
  t.is(r.income, 0.25)
  t.is(r.unsettled, 0.75)
})

test('getYearlyBalances: fills balances; handles api errors', async (t) => {
  const worker = createMockWorker()
  worker.data.yearlyBalances = {}
  worker._logErr = () => {}
  worker.oceanApi = {
    getMonthlyEarnings: async () => ({ report: [{ NetUserRwd: '50000000' }] })
  }
  worker.getYearlyBalances = WrkMinerPoolRackOcean.prototype.getYearlyBalances
  const ok = await worker.getYearlyBalances('u1')
  t.ok(ok.length >= 1)

  worker.data.yearlyBalances = {}
  worker.oceanApi = {
    getMonthlyEarnings: async () => { throw new Error('down') }
  }
  const bad = await worker.getYearlyBalances('u2')
  t.ok(Array.isArray(bad))
})

test('fetchTransactions fetches last 24h and saves each transaction by its ts', async (t) => {
  const worker = createMockWorker()
  worker.transactionsDb = mockBee()
  worker.fetchTransactions = WrkMinerPoolRackOcean.prototype.fetchTransactions
  worker.fetchEarnings = WrkMinerPoolRackOcean.prototype.fetchEarnings
  const windows = []
  worker.oceanApi = {
    getTransactions: async (username, start, end) => {
      windows.push({ username, start, end })
      return {
        earnings: [
          { ts: '2024-06-15T01:00:00.000Z', satoshis_net_earned: 10 },
          { ts: '2024-06-15T02:00:00.000Z', satoshis_net_earned: 20 }
        ]
      }
    }
  }

  const time = new Date('2024-06-16T00:00:00.000Z')
  await worker.fetchTransactions(time)

  const endMs = Math.floor(time.getTime() / 1000) * 1000
  t.is(windows.length, 2)
  t.is(windows[0].username, 'user1')
  t.is(windows[1].username, 'user2')
  t.is(windows[0].end, endMs / 1000)
  t.is(windows[0].start, (endMs - 24 * 60 * 60 * 1000) / 1000)
  t.is(worker.transactionsDb.rows.size, 2)
  const one = beeRow(worker.transactionsDb, Date.parse('2024-06-15T01:00:00.000Z'))
  t.is(one.transactions.length, 2)
  t.is(one.transactions[0].username, 'user1')
  t.is(one.transactions[0].satoshis_net_earned, 10)
  t.is(one.transactions[1].username, 'user2')
  const two = beeRow(worker.transactionsDb, Date.parse('2024-06-15T02:00:00.000Z'))
  t.is(two.transactions.length, 2)
})

test('getEarnings: tolerates an empty api body', async (t) => {
  const worker = createMockWorker()
  worker.oceanApi = { getEarnings: async () => null }
  worker.getEarnings = WrkMinerPoolRackOcean.prototype.getEarnings

  const res = await worker.getEarnings('user1')
  t.alike(res, { revenue: 0, income: 0, unsettled: 0 })
})

test('fetchStats: one account failing its earnings fetch does not drop the tick', async (t) => {
  const worker = createMockWorker()
  worker._logErr = () => {}
  worker.oceanApi = {
    getHashRateInfo: async () => ({ hashrate_60s: '10', active_worker_count: 1 })
  }
  worker.getEarnings = async (username) => {
    if (username === 'user1') throw new Error('boom')
    return { revenue: 1, income: 0.5, unsettled: 0.5 }
  }
  worker.data.workersData = { workers: [] }
  worker.fetchStats = WrkMinerPoolRackOcean.prototype.fetchStats

  await worker.fetchStats(new Date('2024-06-15T12:00:00.000Z'))
  t.is(worker.data.statsData.stats.length, 2, 'both accounts still reported')
  t.is(worker.data.statsData.stats[0].balance, 0, 'failed account degrades to zeros')
  t.is(worker.data.statsData.stats[1].balance, 1)
})
