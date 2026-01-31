'use strict'

const async = require('async')
const TetherWrkBase = require('tether-wrk-base/workers/base.wrk.tether')
const { OceanMinerPoolApi } = require('./lib/ocean.minerpool.api')
const { getWorkersStats, getTimeRanges, convertMsToSeconds, isCurrentMonth, getMonthlyDateRanges } = require('./lib/utils')
const { BTC_SATS, SCHEDULER_TIMES, POOL_TYPE, MINUTE_MS, HOUR_MS, HOURS_24_MS } = require('./lib/constants')
const utilsStore = require('hp-svc-facs-store/utils')
const gLibUtilBase = require('lib-js-util-base')
const mingo = require('mingo')

class WrkMinerPoolRackOcean extends TetherWrkBase {
  constructor (conf, ctx) {
    super(conf, ctx)

    if (!ctx.rack) {
      throw new Error('ERR_PROC_RACK_UNDEFINED')
    }

    this.prefix = `${this.wtype}-${ctx.rack}`
    this.init()
    this.start()

    this.data = {
      statsData: {},
      workersData: { ts: 0, workers: [] },
      yearlyBalances: {}
    }
  }

  init () {
    super.init()

    this.loadConf('ocean', 'ocean')
    this.accounts = this.conf.ocean.accounts

    this.setInitFacs([
      ['fac', 'bfx-facs-scheduler', '0', 'ocean', {}, -10],
      ['fac', 'hp-svc-facs-store', 's1', 's1', {
        storePrimaryKey: this.ctx.storePrimaryKey,
        storeDir: `store/${this.ctx.rack}-db`
      }, 0],
      ['fac', 'bfx-facs-http', '0', '0', {
        baseUrl: this.conf.ocean.apiUrl,
        timeout: 30 * 1000
      }, 0]
    ])
  }

  _start (cb) {
    async.series([
      (next) => { super._start(next) },
      async () => {
        this.net_r0.rpcServer.respond('getWrkExtData', async (req) => {
          return await this.net_r0.handleReply('getWrkExtData', req)
        })

        const db = await this.store_s1.getBee(
          { name: 'ocean' },
          { keyEncoding: 'binary' }
        )
        await db.ready()
        this.blocksDb = db.sub('blocks')
        this.transactionsDb = db.sub('transactions')
        this.workersCountDb = db.sub('workers-count')
        this.statsDb = db.sub('stats')
        this.workersDb = db.sub('workers')

        this.oceanApi = new OceanMinerPoolApi(this.http_0)

        for (const { time, key } of Object.values(SCHEDULER_TIMES)) {
          this.scheduler_ocean.add(key, (fireTime) => {
            this.fetchData(key, fireTime)
          }, time)
        }
      }
    ], cb)
  }

  async fetchData (key, time) {
    try {
      switch (key) {
        case SCHEDULER_TIMES._1M.key:
          await this.fetchStats(time)
          break
        case SCHEDULER_TIMES._5M.key:
          await this.fetchWorkers(time)
          await this.saveStats(time)
          break
        case SCHEDULER_TIMES._1D.key:
          await this.fetchTransactions()
          await this.fetchBlocks()
          await this.saveWorkers(time)
          break
      }
    } catch (e) {
      this._logErr('ERR_DATA_FETCH', e)
    }
  }

  async _saveToDb (db, ts, data) {
    await db.put(utilsStore.convIntToBin(ts), Buffer.from(JSON.stringify(data)))
  }

  _logErr (msg, err) {
    console.error(new Date().toISOString(), msg, err)
  }

  async fetchStats (time) {
    const stats = []
    for (const username of this.accounts) {
      const earnings = await this.getEarnings(username)
      const hashRate = await this.oceanApi.getHashRateInfo(username)
      const yearlyBalances = await this.getYearlyBalances(username)

      stats.push({
        username,
        timestamp: Date.now(),
        balance: earnings.revenue,
        unsettled: earnings.unsettled,
        revenue_24h: earnings.revenue,
        estimated_today_income: earnings.income,
        hashrate: +hashRate.hashrate_60s,
        hashrate_1h: +hashRate.hashrate_3600s,
        hashrate_24h: +hashRate.hashrate_86400s,
        hashrate_stale_1h: 0,
        hashrate_stale_24h: 0,
        worker_count: this.data.workersData.workers.length,
        active_workers_count: hashRate.active_worker_count,
        yearlyBalances
      })
    }

    this.data.statsData = { ts: Math.floor(time.getTime() / 1000) * 1000, stats }
  }

  async saveStats (time) {
    const ts = Math.floor(time.getTime() / 1000) * 1000
    await this._saveToDb(this.statsDb, ts, { ts, stats: this.data.statsData.stats })
  }

  async saveWorkers (time) {
    const ts = Math.floor(time.getTime() / 1000) * 1000
    await this._saveToDb(this.workersDb, ts, { ts, workers: this.data.workersData.workers })
  }

  async fetchWorkers (time) {
    let workers = []
    for (const username of this.accounts) {
      try {
        const accountWorkers = getWorkersStats(await this.oceanApi.getWorkers(username), username)
        workers = workers.concat(accountWorkers)
      } catch (e) {
        this._logErr(`ERR_WORKERS_FETCH ${username}`, e)
      }
    }

    const ts = Math.floor(time.getTime() / 1000) * 1000
    this.data.workersData = { ts, workers }
    await this._saveToDb(this.workersCountDb, ts, { ts, count: workers.length })
  }

  async fetchTransactions () {
    let transactions = []
    const ts = new Date().setHours(0, 0, 0, 0)
    const start = convertMsToSeconds(ts)
    const end = convertMsToSeconds(Date.now())
    for (const username of this.accounts) {
      let dailyTransactions = await this.oceanApi.getTransactions(username, start, end)
      dailyTransactions = dailyTransactions.earnings?.map(t => ({ username, ...t }))
      transactions = transactions.concat(dailyTransactions)
    }

    await this._saveToDb(this.transactionsDb, ts, { ts, transactions })
  }

  async fetchBlocks () {
    const resp = await this.oceanApi.getBlocks()
    if (!resp?.blocks) return

    for (const block of resp.blocks) {
      const ts = new Date(block.ts).getTime()
      await this._saveToDb(this.blocksDb, ts, {
        ts,
        blockId: block.block_hash,
        networkDifficulty: block.network_difficulty,
        poolShares: block.accepted_shares,
        earnings: block.total_reward_sats / BTC_SATS,
        luck: block.network_difficulty / block.accepted_shares,
        luckEarnings100Percent: (block.total_reward_sats / BTC_SATS) / (block.network_difficulty / block.accepted_shares),
        username: block.username
      })
    }
  }

  _getBlocksMonthlyAggr (blocks) {
    const monthlyDateRanges = getMonthlyDateRanges(12)
    const aggrData = blocks.reduce((aggr, block) => {
      const ts = new Date(block.ts)
      for (const { key } of Object.values(monthlyDateRanges)) {
        if (!aggr[key]) aggr[key] = { size: 0, totalDifficulty: 0, totalShares: 0, totalBlocksLuck: 0 }
        if (key === `${ts.getFullYear()}-${ts.getMonth() + 1}`) {
          aggr[key].totalDifficulty += block.networkDifficulty
          aggr[key].totalShares += block.poolShares
          aggr[key].totalBlocksLuck += block.luck
          aggr[key].size++
        }
      }
      return aggr
    }, {})

    const blocksData = {}
    for (const [key, block] of Object.entries(aggrData)) {
      blocksData[key] = {
        poolLuck: block.totalShares > 0 ? (block.totalDifficulty / block.totalShares) * 100 : 0,
        siteLuck: block.size > 0 ? (block.totalBlocksLuck / block.size) * 100 : 0
      }
    }

    return { ts: Date.now(), blocksData }
  }

  _getPoolBlocks (blocks) {
    const blocksData = { blocks, allBlocksLuck: 0, adjustedLuck: 0 }

    const { totalDifficulty, totalShares, totalBlocksLuck } = blocks.reduce((aggr, block) => {
      aggr.totalDifficulty += block.networkDifficulty
      aggr.totalShares += block.poolShares
      aggr.totalBlocksLuck += block.luck
      return aggr
    }, { totalDifficulty: 0, totalShares: 0, totalBlocksLuck: 0 })

    blocksData.allBlocksLuck = totalShares > 0 ? (totalDifficulty / totalShares) * 100 : 0
    blocksData.adjustedLuck = (totalBlocksLuck / blocks.length) * 100

    return { ts: Date.now(), blocksData }
  }

  _aggrTransactions (data, { start, end }) {
    // aggr hourly revenue
    const totalRevenue = data.reduce((total, log) => {
      log.transactions?.forEach((transaction) => {
        total += transaction.satoshis_net_earned
      })
      return total
    }, 0)
    const tsRange = getTimeRanges(start, end)
    const hourlyRevenues = []
    if (!tsRange.length) return { ts: Date.now(), hourlyRevenues }
    const hourlyAvgRevenue = (totalRevenue / tsRange.length) / BTC_SATS
    tsRange.forEach(({ end }) => {
      hourlyRevenues.push({ ts: end, revenue: hourlyAvgRevenue })
    })

    return { ts: Date.now(), hourlyRevenues }
  }

  _getIntervalMs (interval) {
    switch (interval) {
      case '1D':
        return HOURS_24_MS
      case '3h':
        return 3 * HOUR_MS
      case '30m':
        return 30 * MINUTE_MS
      case '5m':
      default:
        return 5 * MINUTE_MS
    }
  }

  _avg (avg, value, count) {
    return (avg * (count - 1) + value) / count
  }

  _aggrByInterval (data, interval) {
    const intervalMs = this._getIntervalMs(interval)
    const aggrBuckets = {}

    // Bucket data points by interval
    data.forEach(d => {
      const aggrTimestamp = Math.ceil(d.ts / intervalMs) * intervalMs
      if (!aggrBuckets[aggrTimestamp]) {
        aggrBuckets[aggrTimestamp] = []
      }
      aggrBuckets[aggrTimestamp].push(d)
    })

    // For each bucket, calculate average of hashrate
    return Object.entries(aggrBuckets).map(([ts, items]) => {
      return items.reduce((acc, d, itemIndex) => {
        d.stats = d.stats.map((stat, statsIndex) => {
          const avgHashrate = acc?.stats?.[statsIndex]?.hashrate || 0
          const hashrate = this._avg(avgHashrate, stat.hashrate, itemIndex + 1)
          return { ...stat, hashrate }
        })
        return { ...acc, ...d, ts: Number(ts) }
      }, {})
    })
  }

  async getYearlyBalances (username) {
    // fetch transactions of last 12 months, skip the ones already fetched unless current month
    const yearlyDateRanges = getMonthlyDateRanges(12)
    const balances = this.data.yearlyBalances
    for (const [month, { key }] of Object.entries(yearlyDateRanges)) {
      if (!balances[month] || isCurrentMonth(month)) {
        try {
          const earnings = await this.oceanApi.getMonthlyEarnings(username, key)
          balances[month] = earnings.report.reduce((bal, t) => bal + +t.NetUserRwd, 0) / BTC_SATS
        } catch (e) {
          this._logErr('ERR_BALANCES_FETCH', e)
          balances[month] = 0
        }
      }
    }
    this.data.yearlyBalances = balances
    return Object.entries(balances).map(([month, balance]) => ({ month, balance }))
  }

  async getEarnings (username) {
    let revenue = 0; let income = 0
    const time24HoursAgo = convertMsToSeconds(Date.now() - 24 * 60 * 60 * 1000)
    const data = this.oceanApi.getEarnings(username, time24HoursAgo)

    data.earnings?.forEach(earning => {
      revenue += earning.satoshis_net_earned
    })

    data.payouts?.forEach(pay => {
      income += pay.total_satoshis_net_paid
    })

    return {
      revenue: revenue / BTC_SATS,
      income,
      unsettled: (revenue - income) / BTC_SATS
    }
  }

  async getDbData (db, { start, end, fields = {} }) {
    if (!start) throw new Error('ERR_START_INVALID')
    if (!end) throw new Error('ERR_END_INVALID')

    const query = {
      gte: utilsStore.convIntToBin(start),
      lte: utilsStore.convIntToBin(end)
    }

    const stream = db.createReadStream(query)
    const res = []
    for await (const entry of stream) {
      res.push(JSON.parse(entry.value.toString()))
    }

    return res
  }

  _projection (data, fields = {}) {
    const query = new mingo.Query({})
    if (Array.isArray(data)) return query.find(data, fields).all()
    const cursor = query.find([data], fields)
    return cursor.all()[0]
  }

  filterWorkers (workers, offset, limit) {
    return workers.slice(offset, offset + (Math.min(limit, 100)))
  }

  async getWorkers (query) {
    const { offset = 0, limit = 100, name, start, end } = query
    if (!start || !end) {
      const workersObj = { ts: 0, workers: this.filterWorkers(this.data.workersData.workers, offset, limit) }
      workersObj.workers = this.appendPoolType(workersObj.workers)
      return workersObj
    }
    const data = await this.getDbData(this.workersDb, query)
    return data.reduce((aggr, obj) => {
      let workersObj
      if (name) workersObj = { ts: obj.ts, workers: obj.workers.filter(w => w.name === name) }
      else workersObj = { ts: obj.ts, workers: this.filterWorkers(obj.workers, offset, limit) }
      workersObj.workers = this.appendPoolType(workersObj.workers)
      aggr = aggr.concat(workersObj)
      return aggr
    }, [])
  }

  appendPoolType (data) {
    return data.map(d => ({ poolType: POOL_TYPE, ...d }))
  }

  async getWrkExtData (req) {
    const { query } = req
    if (!query) throw new Error('ERR_QUERY_INVALID')

    const { key } = query
    if (!key) throw new Error('ERR_KEY_INVALID')

    let data
    switch (key) {
      case 'transactions':
        data = await this.getDbData(this.transactionsDb, query)
        if (query.aggrHourly) data = this._aggrTransactions(data, query)
        break
      case 'blocks':
        data = await this.getDbData(this.blocksDb, query)
        if (query.aggrMonthly) data = this._getBlocksMonthlyAggr(data)
        else data = this._getPoolBlocks(data)
        break
      case 'workers-count':
        data = await this.getDbData(this.workersCountDb, query)
        break
      case 'workers':
        data = await this.getWorkers(query)
        break
      case 'stats':
        data = this.data.statsData
        if (data.stats) data.stats = this.appendPoolType(data.stats)
        break
      case 'stats-history':
        data = await this.getDbData(this.statsDb, query)
        if (query.interval) data = this._aggrByInterval(data, query.interval)
        data.forEach(d => { if (d.stats) d.stats = this.appendPoolType(d.stats) })
        break
      default:
        data = this.data[key]
        break
    }

    if (!gLibUtilBase.isEmpty(query.fields)) return this._projection(data, query.fields)
    return data
  }
}

module.exports = WrkMinerPoolRackOcean
