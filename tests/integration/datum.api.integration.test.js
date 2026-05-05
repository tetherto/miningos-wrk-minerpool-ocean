'use strict'

const test = require('brittle')
const { createServer } = require('../../mock/server')
const DatumApi = require('../../workers/lib/datum.minerpool.api')
const { setTimeout: sleep } = require('timers/promises')

class MockHttpClient {
  constructor (baseUrl) {
    this.baseUrl = baseUrl
  }

  async get (path, options = {}) {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const body = await response.json()
    return { body }
  }
}

let mockServer = null
let apiClient = null
const TEST_PORT = 8002
const TEST_HOST = '127.0.0.1'
const TEST_BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`

async function waitForServer (url, maxRetries = 20, delay = 200) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${url}/v1/ping`)
      if (response.ok) {
        return true
      }
    } catch (e) {
      // Server not ready yet
    }
    await sleep(delay)
  }
  throw new Error('Server failed to start')
}

async function ensureServer () {
  if (!mockServer) {
    mockServer = createServer({
      port: TEST_PORT,
      host: TEST_HOST,
      delay: 0,
      error: false
    })

    await waitForServer(TEST_BASE_URL, 20, 300)

    const httpClient = new MockHttpClient(TEST_BASE_URL)
    apiClient = new DatumApi(httpClient)
  }
  return { mockServer, apiClient }
}

test('setup: start mock server for Datum', { hook: true }, async (t) => {
  await ensureServer()

  const checkResponse = await fetch(`${TEST_BASE_URL}/v1/ping`)
  t.is(await checkResponse.text(), 'PONG', 'Server should respond to ping')

  t.teardown(async () => {
    if (mockServer) {
      try {
        if (mockServer.app && mockServer.app.server) {
          await mockServer.stop()
          await sleep(200)
        }
      } catch (e) {
        try {
          if (mockServer.app && mockServer.app.server) {
            mockServer.app.server.close()
          }
        } catch (e2) {
          // Ignore
        }
      }
      mockServer = null
      apiClient = null
    }
  })

  t.pass('Mock server started for Datum API')
})

test('integration: getDecentralizedClientStats returns mock payload', async (t) => {
  await ensureServer()
  const data = await apiClient.getDecentralizedClientStats()

  t.ok(data.result)
  const stats = data.result
  t.ok(typeof stats.acceptedShares === 'number')
  t.ok(typeof stats.rejectedShares === 'number')
  t.ok(typeof stats.poolMinDiff === 'number')
  t.ok(stats.poolHost)
})

test('integration: getStratumServerInfo returns mock payload', async (t) => {
  await ensureServer()
  const data = await apiClient.getStratumServerInfo()

  t.ok(data.result)
  const info = data.result
  t.ok(typeof info.activeThread === 'number')
  t.ok(typeof info.totalConnections === 'number')
  t.ok(typeof info.estimatedHashrate === 'number')
})

test('integration: getCurrentStratumJob returns mock payload', async (t) => {
  await ensureServer()
  const data = await apiClient.getCurrentStratumJob()

  t.ok(data.result)
  const job = data.result
  t.ok(typeof job.block_height === 'number')
  t.ok(job.previous_block)
  t.ok(job.bits)
})

test('integration: getCoinbaser returns mock payload', async (t) => {
  await ensureServer()
  const data = await apiClient.getCoinbaser()

  t.ok(data.result)
  t.ok('OP_RETURN' in data.result)
})

test('integration: getThreadStats returns mock payload', async (t) => {
  await ensureServer()
  const data = await apiClient.getThreadStats()

  t.ok(data.result)
  const keys = Object.keys(data.result)
  t.ok(keys.length > 0)
  const first = data.result[keys[0]]
  t.ok(typeof first === 'object')
})

test('integration: getStratumList without auth throws missing credentials', async (t) => {
  await ensureServer()
  await t.exception(
    apiClient.getStratumList(),
    /ERR_DATUM_CREDENTIALS_MISSING/
  )
})

test('integration: getConfiguration without auth throws missing credentials', async (t) => {
  await ensureServer()
  await t.exception(
    apiClient.getConfiguration(),
    /ERR_DATUM_CREDENTIALS_MISSING/
  )
})

test('integration: concurrent Datum reads', async (t) => {
  await ensureServer()
  const results = await Promise.all([
    apiClient.getDecentralizedClientStats(),
    apiClient.getStratumServerInfo(),
    apiClient.getThreadStats()
  ])

  t.is(results.length, 3)
  t.ok(results[0].result)
  t.ok(results[1].result)
  t.ok(results[2].result)
})

test('teardown: stop mock server (Datum)', { hook: true }, async (t) => {
  if (mockServer) {
    try {
      if (mockServer.app && mockServer.app.server) {
        const stopPromise = mockServer.stop()
        const timeoutPromise = sleep(1000).then(() => {
          if (mockServer && mockServer.app && mockServer.app.server) {
            try {
              mockServer.app.server.close(() => {})
            } catch (e) {
              // Ignore
            }
          }
        })
        await Promise.race([stopPromise, timeoutPromise])
      }
    } catch (e) {
      try {
        if (mockServer && mockServer.app && mockServer.app.server) {
          mockServer.app.server.close(() => {})
        }
      } catch (e2) {
        // Ignore
      }
    }
    mockServer = null
    apiClient = null
  }
  t.pass('Mock server cleaned up (Datum)')
})
