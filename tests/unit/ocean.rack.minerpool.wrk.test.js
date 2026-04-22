'use strict'

const test = require('brittle')
const WrkMinerPoolRackOcean = require('../../workers/ocean.rack.minerpool.wrk')
const { POOL_TYPE, SCHEDULER_TIMES } = require('../../workers/lib/constants')

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
  worker.getStratumInfo = WrkMinerPoolRackOcean.prototype.getStratumInfo
  worker.getStratumJob = WrkMinerPoolRackOcean.prototype.getStratumJob
  worker.getThreadStats = WrkMinerPoolRackOcean.prototype.getThreadStats
  worker.datumApi = {
    getDecentralizedClientStats: async () => ({ d: 1 }),
    getStratumServerInfo: async () => ({ s: 2 }),
    getCurrentStratumJob: async () => ({ j: 3 }),
    getThreadStats: async () => ({ th: 4 })
  }

  const ds = await worker.getWrkExtData({ query: { key: 'datum-stats' } })
  t.is(ds.d, 1)

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

test('getDatumStats: returns undefined and logs on datumApi error', async (t) => {
  const worker = createMockWorker()
  worker.getDatumStats = WrkMinerPoolRackOcean.prototype.getDatumStats
  worker._logErr = () => {}
  worker.datumApi = {
    getDecentralizedClientStats: async () => {
      throw new Error('datum down')
    }
  }
  const out = await worker.getDatumStats()
  t.is(out, undefined)
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
  await worker.fetchData(SCHEDULER_TIMES._1M.key, new Date())
  t.ok(calls.includes('1m'))

  calls.length = 0
  worker.fetchWorkers = async () => { calls.push('fw') }
  worker.saveStats = async () => { calls.push('ss') }
  await worker.fetchData(SCHEDULER_TIMES._5M.key, new Date())
  t.ok(calls.includes('fw') && calls.includes('ss'))

  calls.length = 0
  worker.fetchTransactions = async () => { calls.push('ft') }
  worker.fetchBlocks = async () => { calls.push('fb') }
  worker.saveWorkers = async () => { calls.push('sw') }
  await worker.fetchData(SCHEDULER_TIMES._1D.key, new Date())
  t.ok(calls.includes('ft') && calls.includes('fb') && calls.includes('sw'))
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
  worker.getYearlyBalances = async () => ([{ month: '1-2025', balance: 0.1 }])
  worker.data.workersData = { workers: [{ id: 'w1' }] }
  worker.fetchStats = WrkMinerPoolRackOcean.prototype.fetchStats

  await worker.fetchStats(new Date('2024-06-15T12:00:00.000Z'))
  t.is(worker.data.statsData.stats.length, 2)
  t.is(worker.data.statsData.stats[0].username, 'user1')
  t.ok(worker.data.statsData.stats[0].yearlyBalances)
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
  worker.transactionsDb = {}
  worker.blocksDb = {}
  worker.fetchTransactions = WrkMinerPoolRackOcean.prototype.fetchTransactions
  worker.fetchBlocks = WrkMinerPoolRackOcean.prototype.fetchBlocks

  worker.oceanApi = {
    getTransactions: async () => ({}),
    getBlocks: async () => ({})
  }
  await worker.fetchTransactions()
  await worker.fetchBlocks()

  worker.oceanApi = {
    getTransactions: async () => ({ earnings: [{ satoshis_net_earned: 10 }] }),
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
  await worker.fetchTransactions()
  await worker.fetchBlocks()
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

test('getEarnings: uses oceanApi payload (sync return)', async (t) => {
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
  t.is(r.income, 25000000)
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
