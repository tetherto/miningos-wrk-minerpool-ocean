'use strict'

const test = require('brittle')
const DatumApi = require('../../workers/lib/datum.minerpool.api')

test('DatumApi: should create instance with http client', (t) => {
  const mockHttp = {
    get: async () => ({ body: {} })
  }

  const api = new DatumApi(mockHttp)
  t.ok(api)
  t.is(api._http, mockHttp)
})

test('DatumApi: getDecentralizedClientStats should call correct endpoint', async (t) => {
  let calledPath = null
  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { acceptedShares: 1 } }
    }
  }

  const api = new DatumApi(mockHttp)
  const result = await api.getDecentralizedClientStats()

  t.is(calledPath, '/v1/decentralized_client_stats')
  t.is(result.acceptedShares, 1)
})

test('DatumApi: getStratumServerInfo should call correct endpoint', async (t) => {
  let calledPath = null
  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { activeThread: 4 } }
    }
  }

  const api = new DatumApi(mockHttp)
  const result = await api.getStratumServerInfo()

  t.is(calledPath, '/v1/stratum_server_info')
  t.is(result.activeThread, 4)
})

test('DatumApi: getCurrentStratumJob should call correct endpoint', async (t) => {
  let calledPath = null
  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { block_height: 900000 } }
    }
  }

  const api = new DatumApi(mockHttp)
  const result = await api.getCurrentStratumJob()

  t.is(calledPath, '/v1/current_stratum_job')
  t.is(result.block_height, 900000)
})

test('DatumApi: getCoinbaser should call correct endpoint', async (t) => {
  let calledPath = null
  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { OP_RETURN: 0 } }
    }
  }

  const api = new DatumApi(mockHttp)
  const result = await api.getCoinbaser()

  t.is(calledPath, '/v1/coinbaser')
  t.is(result.OP_RETURN, 0)
})

test('DatumApi: getThreadStats should call correct endpoint', async (t) => {
  let calledPath = null
  const mockHttp = {
    get: async (path) => {
      calledPath = path
      return { body: { 0: { connections: 1 } } }
    }
  }

  const api = new DatumApi(mockHttp)
  const result = await api.getThreadStats()

  t.is(calledPath, '/v1/thread_stats')
  t.ok(result[0])
})

test('DatumApi: getStratumList without auth should throw missing credentials', async (t) => {
  const mockHttp = {
    get: async () => {
      throw new Error('http.get should not be used for authenticated routes')
    }
  }

  const api = new DatumApi(mockHttp)
  await t.exception(
    api.getStratumList(),
    /ERR_DATUM_CREDENTIALS_MISSING/
  )
})

test('DatumApi: getConfiguration without auth should throw missing credentials', async (t) => {
  const mockHttp = {
    get: async () => {
      throw new Error('http.get should not be used for authenticated routes')
    }
  }

  const api = new DatumApi(mockHttp)
  await t.exception(
    api.getConfiguration(),
    /ERR_DATUM_CREDENTIALS_MISSING/
  )
})

test('DatumApi: _request should propagate http errors', async (t) => {
  const mockHttp = {
    get: async () => {
      throw new Error('Network error')
    }
  }

  const api = new DatumApi(mockHttp)

  try {
    await api.getThreadStats()
    t.fail('Should have thrown an error')
  } catch (err) {
    t.ok(err)
    t.is(err.message, 'Network error')
  }
})

test('DatumApi: authenticated _request uses DigestClient with baseUrl', async (t) => {
  const digestPath = require.resolve('digest-fetch')
  const datumPath = require.resolve('../../workers/lib/datum.minerpool.api')
  const prevDigest = require.cache[digestPath]

  let fetchedUrl = null

  class MockDigestClient {
    constructor (user, password, opts) {
      t.is(user, 'myuser')
      t.is(password, 'mypass')
      t.is(opts.algorithm, 'SHA-256')
    }

    async fetch (url) {
      fetchedUrl = url
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ list: 'ok' })
      }
    }
  }

  require.cache[digestPath] = {
    id: digestPath,
    filename: digestPath,
    loaded: true,
    exports: { default: MockDigestClient }
  }
  delete require.cache[datumPath]
  const DatumApiWithMockDigest = require(datumPath)

  try {
    const mockHttp = {
      baseUrl: 'http://datum.example/prefix',
      get: async () => {
        throw new Error('http.get should not be used when auth is set')
      }
    }
    const api = new DatumApiWithMockDigest(mockHttp, { user: 'myuser', password: 'mypass' })
    const result = await api.getStratumList()

    t.is(result.list, 'ok')
    t.is(fetchedUrl, 'http://datum.example/prefix/v1/stratum_client_list')
  } finally {
    require.cache[digestPath] = prevDigest
    delete require.cache[datumPath]
  }
})
