# miningos-wrk-minerpool-ocean

Ocean Mining Pool Worker - MiningOS worker implementation for integrating with Ocean.xyz mining pool API.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Starting the Worker](#starting-the-worker)
6. [Architecture](#architecture)
7. [API Endpoints Used](#api-endpoints-used)
8. [Development](#development)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)
11. [Contributing](#contributing)

## Overview

This worker connects to the Ocean mining pool API to collect and monitor mining statistics, including:
- Real-time hashrate monitoring (60s, 1h, 24h intervals)
- Worker status and performance tracking
- Earnings and payout tracking
- Transaction history
- Block statistics and pool luck calculations
- Monthly earnings reports

## Prerequisites

- Node.js >= 20.0
- Valid Ocean account username for production use

## Installation

1. Clone the repository:
```bash
git clone https://github.com/tetherto/miningos-wrk-minerpool-ocean.git
cd miningos-wrk-minerpool-ocean
```

2. Install dependencies:
```bash
npm install
```

3. Setup configuration files:
```bash
bash setup-config.sh
```

## Configuration

### Base Configuration (config/ocean.json)

Configure the Ocean API endpoint:

Development/Staging:
json
{
  "apiUrl": "http://127.0.0.1:8000",
  "accounts":["account-id-1"]
}

Production:
json
{
  "apiUrl": "https://api.ocean.xyz",
  "accounts":["account-id-1"]
}

## Starting the Worker

### Production Mode
```bash
DEBUG="*" node worker.js --wtype wrk-minerpool-rack-ocean --env production --rack rack-1
```

### Development Mode
```bash
DEBUG="*" node worker.js --wtype wrk-minerpool-rack-ocean --env development --rack rack-1
```

### Mock Server (Development)
```bash
DEBUG="*" node mock/server.js
```

## Architecture

### Core Classes

#### `OceanMinerPoolApi` (`workers/lib/ocean.minerpool.api.js`)
Thin API wrapper class that handles:
- API communication with Ocean.xyz endpoints
- Rate limiting (1 second between requests)
- Request formatting and response parsing
- Minimal error handling (HTTP facility handles retries)

#### `WrkMinerPoolRackOcean` (`workers/ocean.rack.minerpool.wrk.js`)
Main worker class extending `TetherWrkBase` that:
- Initializes HTTP facilities for Ocean API communication
- Schedules periodic data collection:
  - Every 1 minute: Fetch stats (hashrate, earnings, balances)
  - Every 5 minutes: Fetch workers and save stats to database
  - Daily: Fetch transactions and blocks
- Implements data aggregation and storage logic
- Manages multiple mining accounts via configuration
- Provides RPC interface for querying collected data

### Statistics Collection

The worker collects and stores various statistics:

1. **Real-time Stats** (every 5 minutes):
   - Worker count and status
   - Hashrate (60s, 1h, 24h averages)
   - Active worker count
   - Daily transactions

2. **Daily Stats**:
   - Block information
   - Network difficulty
   - Pool shares and luck calculations
   - Earnings per block

3. **Monthly Stats**:
   - Aggregated earnings
   - Pool luck percentages
   - Historical performance

### Data Flow

1. Worker connects to Ocean API using configured credentials
2. Periodically fetches mining statistics based on schedules
3. Processes and aggregates data
4. Stores statistics for historical tracking
5. Provides data via RPC interface

## API Endpoints Used

The worker interacts with the following Ocean API endpoints:
- `/v1/earnpay/{username}/{timestamp}` - Earnings and payouts
- `/v1/user_hashrate/{username}` - Current hashrate information
- `/v1/user_hashrate_full/{username}` - Detailed worker statistics
- `/v1/monthly_earnings_report/{username}/{month}` - Monthly earnings
- `/v1/blocks` - Pool block information

## Development

### Running Tests
```bash
npm run lint        # Check code style
npm run lint:fix    # Fix code style issues
npm run test    
```

## Monitoring

Monitor worker activity through debug logs:
- API requests and responses
- Statistics collection cycles
- Worker status updates
- Error messages and stack traces

## Troubleshooting

### Common Issues

1. **Registration fails**
   - Ensure username is valid for production
   - Check network connectivity to API endpoint
   - Verify configuration file syntax

2. **No statistics collected**
   - Confirm worker is running (`DEBUG="*"` shows activity)
   - Check API endpoint configuration
   - Verify thing registration was successful

3. **Rate limit errors**
   - Worker implements 1-second delays between requests
   - Multiple workers may need staggered start times

4. **Missing configuration**
   - Run `setup-config.sh` to create config files
   - Check all required fields are populated

## Contributing

Contributions are welcome and appreciated!
Whether you’re fixing a bug, adding a feature, improving documentation, or suggesting an idea, here’s how you can help:

### How to Contribute

1. **Fork** the repository.
2. **Create a new branch** for your feature or fix:

   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** and commit them with a clear message.
4. **Push** to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```
5. **Open a Pull Request** describing what you changed and why.

### Guidelines

* Follow the existing code style and structure.
* Keep PRs focused—one feature or fix per pull request.
* Provide screenshots or examples if your change affects the UI/UX.
* Update documentation/tests as needed.
