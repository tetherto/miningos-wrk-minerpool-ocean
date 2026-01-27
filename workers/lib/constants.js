'use strict'

const BTC_SATS = 100000000 // satoshis in 1 btc
const HOUR_MS = 60 * 60 * 1000
const HOURS_24_MS = 24 * 60 * 60 * 1000
const POOL_TYPE = 'ocean'

const SCHEDULER_TIMES = {
  _1M: { time: '0 */1 * * * *', key: '1m' },
  _5M: { time: '0 */5 * * * *', key: '5m' },
  _1D: { time: '0 0 0 * * *', key: '1D' }
}

module.exports = {
  BTC_SATS,
  HOUR_MS,
  HOURS_24_MS,
  SCHEDULER_TIMES,
  POOL_TYPE
}
