'use strict'

const test = require('brittle')
const { OceanMinerPoolApi } = require('../../workers/lib/ocean.minerpool.api')

test('OceanMinerPoolApi: should create instance with http client', (t) => {
  const mockHttp = {
    get: async () => ({ body: { result: {} } })
  }

  const api = new OceanMinerPoolApi(mockHttp)
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

  const api = new OceanMinerPoolApi(mockHttp)
  const result = await api.getHashRateInfo(username)

  t.is(calledPath, `/v1/user_hashrate/${username}`)
  t.ok(result)
  t.is(result.hashrate_60s, 1000)
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

  const api = new OceanMinerPoolApi(mockHttp)
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

  const api = new OceanMinerPoolApi(mockHttp)
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

  const api = new OceanMinerPoolApi(mockHttp)
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

  const api = new OceanMinerPoolApi(mockHttp)
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

  const api = new OceanMinerPoolApi(mockHttp)
  const result = await api.getEarnings(username, startTime)

  t.is(calledPath, `/v1/earnpay/${username}/${startTime}`)
  t.ok(result)
})

test('OceanMinerPoolApi: _request should handle errors', async (t) => {
  const mockHttp = {
    get: async () => {
      throw new Error('Network error')
    }
  }

  const api = new OceanMinerPoolApi(mockHttp)

  try {
    await api.getHashRateInfo('testuser')
    t.fail('Should have thrown an error')
  } catch (err) {
    t.ok(err)
    t.is(err.message, 'Network error')
  }
})
