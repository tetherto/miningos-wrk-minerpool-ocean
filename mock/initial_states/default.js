'use strict'

const {
  generateMockBlocks,
  generateMockWorkers,
  generateMockTransactions,
  generateClientStats,
  stratumServerInfo,
  currentStratumJob,
  coinbaser,
  threadStats,
  stratumClientList,
  configuration
} = require('./utils')

module.exports = function (CTX) {
  const state = {
    blocks: generateMockBlocks(10),
    workers: generateMockWorkers('test'),
    transactions: generateMockTransactions('test', Date.now() - 7 * 24 * 60 * 60 * 1000, Date.now()),
    hashrate: {
      hashrate_1m: 100000000000000,
      hashrate_5m: 100000000000000,
      hashrate_30m: 100000000000000,
      hashrate_1h: 100000000000000,
      hashrate_1d: 100000000000000,
      workers: 50
    },
    decentralized_client_stats: generateClientStats(),
    stratum_server_info: stratumServerInfo(),
    current_stratum_job: currentStratumJob(),
    coinbaser: coinbaser(),
    thread_stats: threadStats(),
    stratum_client_list: stratumClientList(),
    configuration: configuration()
  }

  const initialState = JSON.parse(JSON.stringify(state))

  function cleanup () {
    Object.assign(state, initialState)
    return state
  }

  return { state, cleanup }
}
