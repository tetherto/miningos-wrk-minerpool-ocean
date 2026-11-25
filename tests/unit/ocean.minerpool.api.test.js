'use strict'

const test = require('brittle')
const OceanMinerPoolApi = require('../../workers/lib/ocean.minerpool.api')

function createApi (http) {
  return new OceanMinerPoolApi(http, { delayMs: 0 })
}

test('OceanMinerPoolApi: should create instance with http client', (t) => {
  const mockHttp = {
    get: async () => ({ body: { result: {} } })
  }

  const api = createApi(mockHttp)
  t.ok(api)
  t.ok(api._http === mockHttp)
})

test('OceanMinerPoolApi: getHashRateInfo should call correct endpoint', async (t) => {
  const username = 'testuser'
  let calledPath = null

  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { result: { hashrate_60s: 1000 } } }
    }
  }

  const api = createApi(mockHttp)
  const result = await api.getHashRateInfo(username)

  t.is(calledPath, `/v1/user_hashrate/${username}`)
  t.ok(result)
  t.is(result.hashrate_60s, 1000)
})

test('OceanMinerPoolApi: getHashRateInfo flags an account with no active workers', async (t) => {
  const api = createApi({
    get: async () => ({ body: { error: 'No such user or user has no active workers' } })
  })

  t.alike(await api.getHashRateInfo('idleuser'), { inactive: true })
  t.is(await api.getWorkers('idleuser'), undefined)
})

test('OceanMinerPoolApi: getHashRateInfo does not flag other errors as inactive', async (t) => {
  for (const error of ['Internal error', 'No such user', 'user has no active workers', undefined]) {
    const api = createApi({ get: async () => ({ body: { error } }) })
    t.is(await api.getHashRateInfo('user'), undefined)
  }
})

test('OceanMinerPoolApi: getHashRateHistory should call correct endpoint', async (t) => {
  const username = 'testuser'
  const start = '2026-09-14'
  const end = '2026-09-15'
  let calledPath = null

  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return {
        body: {
          result: {
            hashrate_history_results: 1,
            hashrate_history: { '2026-09-14T00:00:00': 1000 },
            avg_window_seconds: 3600
          }
        }
      }
    }
  }

  const api = createApi(mockHttp)
  const result = await api.getHashRateHistory(username, start, end)

  t.is(calledPath, `/v1/history/user_hashrate/${username}/${start}/${end}/3600`)
  t.ok(result)
  t.is(result.hashrate_history_results, 1)
  t.is(result.avg_window_seconds, 3600)
  t.is(result.hashrate_history['2026-09-14T00:00:00'], 1000)
})

test('OceanMinerPoolApi: getWorkers should call correct endpoint', async (t) => {
  const username = 'testuser'
  let calledPath = null

  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { result: { workers: {} } } }
    }
  }

  const api = createApi(mockHttp)
  const result = await api.getWorkers(username)

  t.is(calledPath, `/v1/user_hashrate_full/${username}`)
  t.ok(result)
  t.ok(result.workers)
})

test('OceanMinerPoolApi: getMonthlyEarnings should call correct endpoint', async (t) => {
  const username = 'testuser'
  const month = '2024-1'
  let calledPath = null

  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { result: { report: [] } } }
    }
  }

  const api = createApi(mockHttp)
  const result = await api.getMonthlyEarnings(username, month)

  t.is(calledPath, `/v1/monthly_earnings_report/${username}/${month}`)
  t.ok(result)
  t.ok(result.report)
})

test('OceanMinerPoolApi: getTransactions should call correct endpoint', async (t) => {
  const username = 'testuser'
  const start = 1234567890
  const end = 1234654290
  let calledPath = null

  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { result: { earnings: [] } } }
    }
  }

  const api = createApi(mockHttp)
  const result = await api.getTransactions(username, start, end)

  t.is(calledPath, `/v1/earnpay/${username}/${start}/${end}`)
  t.ok(result)
})

test('OceanMinerPoolApi: getBlocks should call correct endpoint', async (t) => {
  let calledPath = null

  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { result: { blocks: [] } } }
    }
  }

  const api = createApi(mockHttp)
  const result = await api.getBlocks()

  t.is(calledPath, '/v1/blocks')
  t.ok(result)
  t.ok(result.blocks)
})

test('OceanMinerPoolApi: getEarnings should call correct endpoint', async (t) => {
  const username = 'testuser'
  const startTime = 1234567890
  let calledPath = null

  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { result: { earnings: [] } } }
    }
  }

  const api = createApi(mockHttp)
  const result = await api.getEarnings(username, startTime)

  t.is(calledPath, `/v1/earnpay/${username}/${startTime}`)
  t.ok(result)
})

test('OceanMinerPoolApi: ping should call /v1/blocks and return true', async (t) => {
  let calledPath = null
  const api = createApi({
    get: async (path) => {
      calledPath = path
      return { body: { result: { blocks: [] } } }
    }
  })

  t.is(await api.ping(), true)
  t.is(calledPath, '/v1/blocks')
})

test('OceanMinerPoolApi: _request should return empty object on http error', async (t) => {
  const api = createApi({
    get: async () => { throw new Error('network down') }
  })
  const result = await api.getBlocks()
  t.alike(result, {})
})

test('OceanMinerPoolApi: default delayMs is 5000', (t) => {
  const api = new OceanMinerPoolApi({})
  t.is(api._delayMs, 5000)
})
