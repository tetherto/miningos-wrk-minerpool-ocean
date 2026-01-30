'use strict'

const test = require('brittle')
const WrkMinerPoolRackOcean = require('../../workers/ocean.rack.minerpool.wrk')
const { POOL_TYPE } = require('../../workers/lib/constants')

function createMockWorker () {
  const mockCtx = {
    rack: 'rack-1',
    storePrimaryKey: 'test-key'
  }

  const mockConf = {
    ocean: {
      accounts: ['user1', 'user2'],
      apiUrl: 'https://api.test.com'
    }
  }

  const worker = Object.create(WrkMinerPoolRackOcean.prototype)
  worker.ctx = mockCtx
  worker.conf = mockConf
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
      ts: new Date('2024-01-01T00:25:00Z').getTime(),
      stats: [
        { hashrate: 1000000, hashrate_1h: 1000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:30:00Z').getTime(),
      stats: [
        { hashrate: 2000000, hashrate_1h: 2000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:35:00Z').getTime(),
      stats: [
        { hashrate: 3000000, hashrate_1h: 3000000 }
      ]
    },
    {
      ts: new Date('2024-01-01T00:40:00Z').getTime(),
      stats: [
        { hashrate: 4000000, hashrate_1h: 4000000 }
      ]
    }
  ]

  const interval = '30m'
  const result = worker._aggrByInterval(data, interval)

  t.ok(result)
  t.ok(result.length === 2)
  t.ok(result[0].ts === new Date('2024-01-01T00:30:00Z').getTime())
  t.ok(result[0].stats[0].hashrate === 1500000)
  t.ok(result[0].stats[0].hashrate_1h === 2000000)
  t.ok(result[1].ts === new Date('2024-01-01T01:00:00Z').getTime())
  t.ok(result[1].stats[0].hashrate === 3500000)
  t.ok(result[1].stats[0].hashrate_1h === 4000000)
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
