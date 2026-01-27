'use strict'

const test = require('brittle')
const Module = require('module')

const originalRequire = Module.prototype.require
const mockUtilsStore = {
  convIntToBin: (num) => {
    const buffer = Buffer.allocUnsafe(8)
    buffer.writeBigUInt64BE(BigInt(num), 0)
    return buffer
  }
}

let mockLogInstance = null
const mockWrkFunLogs = {
  getBeeTimeLog: async function (logKey, offset, create) {
    return mockLogInstance
  },
  releaseBeeTimeLog: async function (log) {
    return Promise.resolve()
  }
}

Module.prototype.require = function (id) {
  if (id === 'hp-svc-facs-store/utils') {
    return mockUtilsStore
  }
  if (id === 'miningos-tpl-wrk-minerpool/workers/lib/wrk-fun-logs') {
    return mockWrkFunLogs
  }
  return originalRequire.apply(this, arguments)
}

const { saveStats } = require('../../workers/lib/wrk-fun-stats')

Module.prototype.require = originalRequire

test('saveStats: should save stats to log when log exists', async (t) => {
  let putCalled = false
  let savedKey = null
  let savedValue = null

  mockLogInstance = {
    put: async (key, value) => {
      putCalled = true
      savedKey = key
      savedValue = value
      return Promise.resolve()
    }
  }

  const context = {}
  const logKey = 'test-log'
  const dataKey = 1234567890
  const data = { test: 'data' }

  await saveStats.call(context, logKey, dataKey, data)

  t.ok(putCalled, 'put should be called')
  t.ok(savedKey, 'key should be set')
  t.ok(savedValue, 'value should be set')
})

test('saveStats: should return early when log does not exist', async (t) => {
  mockLogInstance = null

  const putCalled = false
  const context = {}
  const logKey = 'test-log'
  const dataKey = 1234567890
  const data = { test: 'data' }

  await saveStats.call(context, logKey, dataKey, data)

  t.not(putCalled, 'put should not be called when log is null')
})

test('saveStats: should convert data to JSON buffer', async (t) => {
  let savedValue = null

  mockLogInstance = {
    put: async (key, value) => {
      savedValue = value
      return Promise.resolve()
    }
  }

  const context = {}
  const logKey = 'test-log'
  const dataKey = 1234567890
  const data = { test: 'data', number: 42 }

  await saveStats.call(context, logKey, dataKey, data)

  t.ok(savedValue instanceof Buffer, 'value should be a Buffer')
  const parsed = JSON.parse(savedValue.toString())
  t.alike(parsed, data, 'parsed data should match original')
})
