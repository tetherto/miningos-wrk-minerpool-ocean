'use strict'

const BTC_SATS = 100000000
const crypto = require('crypto')

function generateMockBlocks (count = 10) {
  const blocks = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const blockTime = now - (i * 2 * 60 * 60 * 1000) // Every 2 hours
    const luck = 80 + randomNumber() * 40 // Between 80% and 120%
    const networkDifficulty = 70000000000000 + randomNumber() * 5000000000000
    const acceptedShares = networkDifficulty / (luck / 100)

    blocks.push({
      block_hash: randomNumber().toString(16).substring(2).padEnd(64, '0'),
      ts: blockTime,
      legacy: false,
      username: 'test',
      workername: `test.worker${Math.floor(randomNumber() * 5) + 1}`,
      solution: randomNumber().toString(16).substring(2).padEnd(160, '0'),
      network_difficulty: networkDifficulty,
      height: 810000 - i,
      generation_txn_hash: randomNumber().toString(16).substring(2).padEnd(64, '0'),
      accepted_shares: acceptedShares,
      subsidy_sats: 625000000,
      txn_fees_sats: Math.floor(0.1 * BTC_SATS + randomNumber() * 0.5 * BTC_SATS),
      total_reward_sats: 625000000 + Math.floor(0.1 * BTC_SATS + randomNumber() * 0.5 * BTC_SATS),
      sharelog_window: Math.floor(networkDifficulty * 8)
    })
  }

  return blocks
}

function generateMockWorkers (username) {
  const workers = {}
  const workerCount = 5 + Math.floor(randomNumber() * 10)

  for (let i = 0; i < workerCount; i++) {
    const workerName = `${username}.worker${i + 1}`
    workers[workerName] = [{
      hashrate_60s: 100000000000000 + randomNumber() * 10000000000000,
      hashrate_3600s: 100000000000000 + randomNumber() * 10000000000000,
      hashrate_86400s: 100000000000000 + randomNumber() * 10000000000000
    }]
  }

  return {
    snap_ts: Date.now() / 1000,
    workers
  }
}

function generateMockTransactions (username, startTime, endTime) {
  const transactions = []
  let currentTime = startTime

  while (currentTime < endTime) {
    transactions.push({
      ts: Math.floor(currentTime / 1000), // Unix timestamp in seconds
      amount_sats: 1000000 + randomNumber() * 5000000, // 0.01 to 0.06 BTC
      type: 'payout',
      status: 'confirmed'
    })
    currentTime += 24 * 60 * 60 * 1000 // Add 1 day
  }

  return transactions
}

function generateUserHashrate (username) {
  const now = Math.floor(Date.now() / 1000)
  const baseHashrate = 100000000000000 // 100 TH/s

  return {
    snap_ts: now,
    hashrate_60s: baseHashrate + randomNumber() * 10000000000000,
    hashrate_300s: baseHashrate + randomNumber() * 10000000000000,
    hashrate_600s: baseHashrate + randomNumber() * 10000000000000,
    hashrate_1800s: baseHashrate + randomNumber() * 10000000000000,
    hashrate_3600s: baseHashrate + randomNumber() * 10000000000000,
    hashrate_43200s: baseHashrate + randomNumber() * 10000000000000,
    hashrate_86400s: baseHashrate + randomNumber() * 10000000000000
  }
}

function randomFloat () {
  return crypto.randomBytes(6).readUIntBE(0, 6) / 2 ** 48
}

function randomNumber (min = 0, max = 1) {
  const number = randomFloat() * (max - min) + min
  return parseFloat(number.toFixed(2))
}

function generateClientStats () {
  let stat = {}
  const acceptedShares = Math.round(randomNumber(100, 2000000))
  const rejectedShares = Math.round(randomNumber(100, 2000000))

  stat = {
    acceptedShares,
    acceptedSharesDiff: acceptedShares * 2,
    rejectedShares,
    rejectedSharesDiff: rejectedShares * 2,
    ready: Math.random() < 0.5,
    poolHost: 'datum-beta1.mine.ocean.xyz',
    poolTag: 'DATUM Gateway',
    MinerTag: 'DATUM User',
    poolMinDiff: Math.round(randomNumber(16384, 1048576)),
    poolPubKey: 'f21f2f0ef0aa1970468f22bad9bb7f4535146f8e4a8f646bebc93da3d89b1406f40d032f09a417d94dc068055df654937922d2c89522e3e8f6f0e649de473003',
    uptime: Math.round(randomNumber(0, 1000000))
  }

  return stat
}

function stratumServerInfo () {
  let stratum = {}
  const thread = Math.round(randomNumber(1, 1024))
  const connections = thread * Math.round(randomNumber(1, 3))

  stratum = {
    activeThread: thread,
    totalConnections: connections,
    totalWorkSubscriptions: connections - Math.round(randomNumber(1, 3)),
    estimatedHashrate: Math.round(randomNumber(1, 50000000))
  }

  return stratum
}

function currentStratumJob () {
  let job = {}

  job = {
    block_height: Math.round(randomNumber(900000, 940000)),
    block_value: Math.round(randomNumber(312500000, 400000000)),
    previous_block: randomNumber().toString(16).substring(2).padEnd(64, '0'),
    block_target: randomNumber().toString(16).substring(2).padEnd(64, '0'),
    witness_commitment: randomNumber().toString(16).substring(2).padEnd(64, '0'),
    block_difficulty: randomNumber(1, 100000000000),
    block_version: {
      int: 536870912,
      hex: '20000000'
    },
    bits: '1701f303',
    time: {
      current: Math.floor(Date.now() / 1000),
      minimum: Math.floor(Date.now() / 1000) - 100000
    },
    limits: {
      size: 4000000,
      weight: 4000000,
      sigops: 80000
    },
    size: Math.round(randomNumber(1, 4000000)),
    weight: Math.round(randomNumber(1, 400000)),
    sigops: Math.round(randomNumber(1, 80000)),
    tx_count: Math.round(randomNumber(1, 2000))
  }

  return job
}

function coinbaser () {
  const coinbase = {}
  const numberOfOutputs = Math.round(randomNumber(1, 50))

  Object.assign(coinbase, { OP_RETURN: 0 })

  for (let i = numberOfOutputs; i > 0; i--) {
    Object.assign(coinbase, { [randomBc1Address()]: Math.round(randomNumber(1, i)) })
  }

  return coinbase
}

function threadStats () {
  const thread = {}
  const numberOfThread = Math.round(randomNumber(1, 20))

  for (let i = 0; i < numberOfThread; i++) {
    const connectionCount = Math.round(randomNumber(1, 30))

    Object.assign(thread, {
      [i]: {
        connection_count: connectionCount,
        subscription_count: connectionCount - Math.round(randomNumber(0, 3)),
        approx_hashrate: randomNumber(1, 50)
      }
    })
  }

  return thread
}

function stratumClientList () {
  const clientList = {}
  const acceptedShares = Math.round(randomNumber(100, 2000000))
  const rejectedShares = Math.round(randomNumber(100, 2000000))
  const numberOfClient = Math.round(randomNumber(1, 20))

  for (let i = 0; i < numberOfClient; i++) {
    const numberOfThread = Math.round(randomNumber(1, 20))

    Object.assign(clientList, { [i]: {} })
    for (let j = 0; j < numberOfThread; j++) {
      Object.assign(clientList[i], {
        [j]: {
          remote_host: '::ffff:192.168.1.' + Math.round(randomNumber(1, 254)).toString(),
          auth_username: randomBc1Address() + '.S' + Math.round(randomNumber(19, 21)).toString(),
          subscribed: Math.random() < 0.5,
          sid: generateRandomString(),
          sid_time: randomNumber(1, 1000000),
          vdiff: 131072,
          accepted_diff: acceptedShares * 2,
          accepted_count: acceptedShares,
          rejected_diff: rejectedShares * 2,
          rejected_count: rejectedShares,
          rejected_percentage: randomNumber(0, 1),
          hash_rate: Math.round(randomNumber(1, 50000000)),
          hash_rate_age: Math.round(randomNumber(1, 50000000)),
          coinbase: randomCoinbaseFingerprint(),
          useragent: ''
        }
      })
    }
  }

  return clientList
}

function configuration () {
  let config = {}

  config = {
    pool_address: randomBc1Address(),
    miner_username_behavior: {
      pool_pass_workers: Math.random() < 0.5,
      pool_pass_full_users: Math.random() < 0.5
    },
    coinbase_tag_secondary: 'DATUM User',
    coinbase_unique_id: Math.floor(randomNumber(1, 65536)),
    reward_sharing: randomRewardSharing(),
    pool: {
      host: 'datum-beta1.mine.ocean.xyz',
      port: 28915,
      pubkey: 'f21f2f0ef0aa1970468f22bad9bb7f4535146f8e4a8f646bebc93da3d89b1406f40d032f09a417d94dc068055df654937922d2c89522e3e8f6f0e649de473003'
    },
    fingerprint_miners: Math.random() < 0.5,
    always_pay_self: Math.random() < 0.5,
    work_update_seconds: Math.floor(randomNumber(1, 120)),
    rpcurl: 'http://localhost:8332',
    rpcuser: 'test',
    rpcpassword: 'test'
  }

  return config
}

function randomBc1Address () {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let addr = 'bc1'
  for (let i = 0; i < 39; i++) {
    addr += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return addr
}

function generateRandomString () {
  let result = ''
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * 8))
  }
  return result
}

function randomCoinbaseFingerprint () {
  const coinbaseList = ['Blank', 'Tiny', 'Default', 'Respect', 'Yuge', 'Antmain2']

  return coinbaseList[Math.round(randomNumber(0, 5))]
}

function randomRewardSharing () {
  const coinbaseList = ['require', 'prefer', 'never']

  return coinbaseList[Math.round(randomNumber(0, 2))]
}

module.exports = {
  generateMockBlocks,
  generateMockWorkers,
  generateMockTransactions,
  generateUserHashrate,
  randomNumber,
  generateClientStats,
  stratumServerInfo,
  currentStratumJob,
  coinbaser,
  threadStats,
  stratumClientList,
  configuration
}
