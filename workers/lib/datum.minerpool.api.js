'use strict'

const DigestClient = require('digest-fetch').default

class DatumApi {
  constructor (http, creds = {}) {
    this._http = http
    if (creds.user && creds.password) {
      this.client = new DigestClient(creds.user, creds.password, { algorithm: 'SHA-256' })
    }
  }

  async _request (apiPath, auth = false) {
    let resp
    if (auth) {
      if (!this.client) {
        throw new Error('ERR_DATUM_CREDENTIALS_MISSING')
      }
      const url = apiPath.includes('://') ? apiPath : `${this._http.baseUrl}/${apiPath.replace(/^\//, '')}`
      const response = await this.client.fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      resp = await response.json()
    } else {
      const { body } = await this._http.get(apiPath, { encoding: 'json' })
      resp = body
    }
    return resp
  }

  async getDatumStats () {
    return await this._request('/umbrel-api')
  }

  async getDecentralizedClientStats () {
    return await this._request('/v1/decentralized_client_stats')
  }

  async getStratumServerInfo () {
    return await this._request('/v1/stratum_server_info')
  }

  async getCurrentStratumJob () {
    return await this._request('/v1/current_stratum_job')
  }

  async getCoinbaser () {
    return await this._request('/v1/coinbaser')
  }

  async getThreadStats () {
    return await this._request('/v1/thread_stats')
  }

  async getStratumList () {
    return await this._request('/v1/stratum_client_list', true)
  }

  async getConfiguration () {
    return await this._request('/v1/configuration', true)
  }
}

module.exports = DatumApi
