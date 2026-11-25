'use strict'

const { setTimeout: sleep } = require('timers/promises')

const NO_ACTIVE_WORKERS_ERROR = /^no such user or user has no active workers$/i

class OceanMinerPoolApi {
  constructor (http, { delayMs = 5000 } = {}) {
    this._http = http
    this._delayMs = delayMs
  }

  async _request (apiPath, { flagInactive = false } = {}) {
    if (this._delayMs > 0) await sleep(this._delayMs)
    try {
      const { body: resp } = await this._http.get(apiPath, { encoding: 'json' })
      if (flagInactive && resp.result === undefined && NO_ACTIVE_WORKERS_ERROR.test(resp.error)) {
        return { inactive: true }
      }
      return resp.result
    } catch (e) {
      console.error('ERR_REQUEST_API', e)
    }
    return {}
  }

  // Answers `{ inactive: true }` when Ocean has no active workers for the account.
  async getHashRateInfo (username) {
    return this._request(`/v1/user_hashrate/${username}`, { flagInactive: true })
  }

  async getHashRateHistory (username, start, end) {
    return this._request(`/v1/history/user_hashrate/${username}/${start}/${end}/3600`)
  }

  async getWorkers (username) {
    return this._request(`/v1/user_hashrate_full/${username}`)
  }

  async getMonthlyEarnings (username, month) {
    return this._request(`/v1/monthly_earnings_report/${username}/${month}`)
  }

  async getTransactions (username, start, end) {
    return await this._request(`/v1/earnpay/${username}/${start}/${end}`)
  }

  async getBlocks () {
    return await this._request('/v1/blocks')
  }

  async getEarnings (username, startTime) {
    return await this._request(`/v1/earnpay/${username}/${startTime}`)
  }

  // Reachability probe that lets failures propagate, unlike `_request`.
  async ping () {
    await this._http.get('/v1/blocks', { encoding: 'json' })
    return true
  }
}

module.exports = OceanMinerPoolApi
