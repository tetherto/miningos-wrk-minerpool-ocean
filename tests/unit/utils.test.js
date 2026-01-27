'use strict'

const test = require('brittle')
const {
  getWorkersStats,
  getMonthlyDateRanges,
  isCurrentMonth,
  convertMsToSeconds,
  getTimeRanges
} = require('../../workers/lib/utils')

test('getWorkersStats: should transform worker data correctly', (t) => {
  const worker1Obj = {
    hashrate_60s: 1000,
    hashrate_3600s: 950,
    hashrate_86400s: 900
  }
  const worker2Obj = {
    hashrate_60s: 0,
    hashrate_3600s: 0,
    hashrate_86400s: 0
  }

  const data = {
    workers: {
      worker1: [worker1Obj],
      worker2: [worker2Obj]
    },
    snap_ts: 1234567890
  }
  const username = 'testuser'

  const result = getWorkersStats(data, username)

  t.is(result.length, 2)
  t.is(result[0].username, 'testuser')
  t.is(result[0].id, 'worker1')
  t.is(result[0].name, 'worker1')
  t.is(result[0].online, 1)
  t.is(result[0].hashrate, 1000)
  t.is(result[0].hashrate_1h, 950)
  t.is(result[0].hashrate_24h, 900)
  t.is(result[0].last_updated, 1234567890)
  t.is(result[0].hashrate_stale_1h, 0)
  t.is(result[0].hashrate_stale_24h, 0)

  t.is(result[1].online, 0)
  t.is(result[1].hashrate, 0)
})

test('getWorkersStats: should handle empty workers object', (t) => {
  const data = {
    workers: {},
    snap_ts: '1234567890'
  }
  const username = 'testuser'

  const result = getWorkersStats(data, username)

  t.is(result.length, 0)
})

test('getMonthlyDateRanges: should generate correct date ranges', (t) => {
  const months = 3
  const result = getMonthlyDateRanges(months)

  t.ok(Object.keys(result).length === 3)

  const today = new Date()
  const currentMonth = today.getMonth() + 1
  const currentYear = today.getFullYear()

  const currentKey = `${currentMonth}-${currentYear}`
  t.ok(result[currentKey])
  t.is(result[currentKey].key, `${currentYear}-${currentMonth}`)
})

test('getMonthlyDateRanges: should handle zero months', (t) => {
  const result = getMonthlyDateRanges(0)
  t.is(Object.keys(result).length, 0)
})

test('getMonthlyDateRanges: should handle 12 months', (t) => {
  const result = getMonthlyDateRanges(12)
  t.is(Object.keys(result).length, 12)
})

test('isCurrentMonth: should return true for current month', (t) => {
  const today = new Date()
  const currentMonth = `${today.getMonth() + 1}-${today.getFullYear()}`

  t.ok(isCurrentMonth(currentMonth))
})

test('isCurrentMonth: should return false for previous month', (t) => {
  const today = new Date()
  const prevMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
  const prevMonthStr = `${prevMonth}-${prevYear}`

  t.not(isCurrentMonth(prevMonthStr))
})

test('convertMsToSeconds: should convert milliseconds to seconds', (t) => {
  t.is(convertMsToSeconds(1000), 1)
  t.is(convertMsToSeconds(5000), 5)
  t.is(convertMsToSeconds(60000), 60)
  t.is(convertMsToSeconds(1234567), 1234)
})

test('convertMsToSeconds: should floor the result', (t) => {
  t.is(convertMsToSeconds(1999), 1)
  t.is(convertMsToSeconds(1500), 1)
})

test('getTimeRanges: should return empty array when start >= end', (t) => {
  const start = 1000
  const end = 1000
  t.alike(getTimeRanges(start, end), [])

  const start2 = 2000
  const end2 = 1000
  t.alike(getTimeRanges(start2, end2), [])
})

test('getTimeRanges: should generate hourly ranges correctly', (t) => {
  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const end = new Date('2024-01-01T02:00:00Z').getTime()
  const ranges = getTimeRanges(start, end, true)

  t.ok(ranges.length > 0)
  t.ok(ranges[0].start >= start)
  t.ok(ranges[0].end > ranges[0].start)
})

test('getTimeRanges: should generate daily ranges correctly', (t) => {
  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const end = new Date('2024-01-03T00:00:00Z').getTime()
  const ranges = getTimeRanges(start, end, false)

  t.ok(ranges.length > 0)
  t.ok(ranges[0].start >= start)
  t.ok(ranges[0].end > ranges[0].start)
})

test('getTimeRanges: should default to hourly when isHourly not specified', (t) => {
  const start = new Date('2024-01-01T00:00:00Z').getTime()
  const end = new Date('2024-01-01T01:00:00Z').getTime()
  const ranges = getTimeRanges(start, end)

  t.ok(ranges.length > 0)
})
