'use strict'

const { HOUR_MS, HOURS_24_MS } = require('./constants')

const getWorkersStats = (data, username) => {
  return Object.entries(data.workers).map(([name, [worker]]) => {
    return {
      username,
      id: name,
      name,
      online: +worker.hashrate_60s === 0 ? 0 : 1,
      last_updated: +data.snap_ts,
      hashrate: +worker.hashrate_60s,
      hashrate_1h: +worker.hashrate_3600s,
      hashrate_24h: +worker.hashrate_86400s,
      hashrate_stale_1h: 0,
      hashrate_stale_24h: 0
    }
  })
}

const getMonthlyDateRanges = (months) => {
  const dateRange = {}
  const today = new Date()
  for (let i = 0; i < months; i++) {
    const startDate = new Date(today.getFullYear(), today.getMonth() - i, 1, 0, 0, 0)
    dateRange[`${startDate.getMonth() + 1}-${startDate.getFullYear()}`] = {
      key: `${startDate.getFullYear()}-${startDate.getMonth() + 1}`
    }
  }

  return dateRange
}

const isCurrentMonth = (month) => {
  return parseInt(month.split('-')[0]) === new Date().getMonth() + 1
}

const convertMsToSeconds = (timestampMs) => {
  return Math.floor(timestampMs / 1000)
}

const getTimeRanges = (start, end, isHourly = true) => {
  if (start >= end) return []

  const ranges = []
  const timeDiff = isHourly ? HOUR_MS : HOURS_24_MS
  let endTime = new Date(start + timeDiff)

  if (isHourly) {
    endTime.setUTCMinutes(0, 0, 0)
  } else {
    endTime.setUTCHours(0, 0, 0, 0)
  }

  endTime = endTime.getTime()
  while (start < end) {
    ranges.push({ start, end: endTime })
    start = endTime
    endTime += timeDiff
  }
  return ranges
}

module.exports = {
  getWorkersStats,
  getMonthlyDateRanges,
  isCurrentMonth,
  convertMsToSeconds,
  getTimeRanges
}
