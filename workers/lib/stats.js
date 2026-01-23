'use strict'

const libStats = require('miningos-tpl-wrk-minerpool/workers/lib/stats')

libStats.specs.minerpool = {
  ops: {
    ...libStats.specs.minerpool_default.ops
  }
}

module.exports = libStats
