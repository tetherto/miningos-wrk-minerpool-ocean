'use strict'

const test = require('brittle')
const {
  BTC_SATS,
  HOUR_MS,
  HOURS_24_MS,
  SCHEDULER_TIMES,
  POOL_TYPE
} = require('../../workers/lib/constants')

test('constants: BTC_SATS should be correct', (t) => {
  t.is(BTC_SATS, 100000000)
})

test('constants: HOUR_MS should be correct', (t) => {
  t.is(HOUR_MS, 60 * 60 * 1000)
  t.is(HOUR_MS, 3600000)
})

test('constants: HOURS_24_MS should be correct', (t) => {
  t.is(HOURS_24_MS, 24 * 60 * 60 * 1000)
  t.is(HOURS_24_MS, 86400000)
})

test('constants: POOL_TYPE should be ocean', (t) => {
  t.is(POOL_TYPE, 'ocean')
})

test('constants: SCHEDULER_TIMES should have correct structure', (t) => {
  t.ok(SCHEDULER_TIMES._1M)
  t.ok(SCHEDULER_TIMES._5M)
  t.ok(SCHEDULER_TIMES._1D)

  t.is(SCHEDULER_TIMES._1M.key, '1m')
  t.is(SCHEDULER_TIMES._5M.key, '5m')
  t.is(SCHEDULER_TIMES._1D.key, '1D')

  t.ok(SCHEDULER_TIMES._1M.time)
  t.ok(SCHEDULER_TIMES._5M.time)
  t.ok(SCHEDULER_TIMES._1D.time)
})

test('constants: SCHEDULER_TIMES should have valid cron expressions', (t) => {
  // Basic validation that they contain asterisks (cron pattern)
  t.ok(SCHEDULER_TIMES._1M.time.includes('*'))
  t.ok(SCHEDULER_TIMES._5M.time.includes('*'))
  t.ok(SCHEDULER_TIMES._1D.time.includes('*'))
})
