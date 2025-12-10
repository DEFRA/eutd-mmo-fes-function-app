# MMO FES Function App - AI Coding Agent Instructions

## Project Overview
Azure Functions v2 timer-triggered app for DEFRA MMO (Marine Management Organisation). Replaces CRON jobs to orchestrate scheduled tasks for the `mmo-fes-reference-data-reader` service and reconcile certificate data with a business continuity system.

**Two Azure Functions:**
- `mmo-fes-functionapp`: Timer-triggered HTTP orchestrator with retry logic (calls data reader every X hours)
- `mmo-fes-reconciliationapp`: HTTP-triggered MongoDB → Business Continuity API reconciliation

## Architecture & Patterns

### Retry Pattern with Exponential Backoff
Both functions implement custom retry logic with increasing delays:
```javascript
// Pattern: retry(fn, retries, delayFn) where delay = (totalRetries - retriesRemaining) * baseDelay
// Example: 5-min base delay → attempts at 0min, 0min, 5min, 10min, 15min
const calcDelay = (delay, totalRetries) => (retriesRemaining) =>
  (totalRetries - retriesRemaining) * delay;
```

### Config via Environment Variables
All functions load config from env vars with fallback defaults in the module-level `config` object. Use `overrideConfig` parameter in tests:
```javascript
await func(context, myTimer, { retries: 2, retryDelay: 1000 });
```

### Application Insights Integration
Custom correlation with `ai.operation.id` from Azure context. Always initialize AppInsights first, then axios interceptors:
```javascript
appInsights.init(config.instrumentationKey, context);
axiosInterceptors.init(axios);  // Adds duration tracking to responses
```

### HTTPS Agent with Custom CA Bundle
Loads `cabundle.pem` from function directory for custom certificate chains. Located at `${context.executionContext.functionDirectory}/../cabundle.pem`.

## Development Workflow

### Local Development
```bash
# Prerequisites: Azure Functions Core Tools v3+, Azurite storage emulator
npm install
azurite  # Run in separate terminal
func start  # Starts both functions
```

### Testing
```bash
npm test              # Run tests with coverage
npm run test:ci       # CI mode with jest-junit reporter
```

**Test Conventions:**
- Use `jest.spyOn()` for mocking, never reassign `require()`
- Mock MongoDB via `__mocks__/mongodb.js` (configured in `package.json` moduleNameMapper)
- Mock `setTimeout` to execute callbacks immediately: `jest.spyOn(global, 'setTimeout').mockImplementation((callback) => callback())`
- Context structure: `{ log: jest.fn(), executionContext: { functionDirectory: __dirname }, traceContext: {}, operationId: '' }`

**Coverage Requirements (enforced):**
- Branches: 95%, Functions: 95%, Lines: 98%, Statements: 97%

## Project-Specific Conventions

### Logging Format
Structured logs with bracketed tags:
```javascript
context.log('[SCHEDULED-JOBS][LANDING-AND-REPORTING][STARTED]', timeNow());
context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][CONFIG][url: ${url}]`, timeNow());
```

### Function Structure
Every function exports a single async function with signature:
```javascript
const func = async (context, myTimer, overrideConfig) => {
  // 1. Log start, merge overrideConfig
  // 2. Check myTimer.IsPastDue
  // 3. Initialize AppInsights + interceptors
  // 4. Execute main logic with retry pattern
  // 5. Track events and log completion
};
module.exports = func;
```

### Timer vs HTTP Triggers
- `mmo-fes-functionapp`: Timer trigger (`timerTrigger` binding) with `CRONTIME` env var
- `mmo-fes-reconciliationapp`: HTTP trigger (`httpTrigger` + `http` output binding)

## Key Files & Directories

- `mmo-fes-functionapp/index.js`: Main timer function with HTTP retry orchestration
- `mmo-fes-reconciliationapp/index.js`: MongoDB → BC API reconciliation with batch processing
- `src/appInsights.js`: Shared AppInsights wrapper with operation correlation
- `src/axiosInterceptors.js`: Request/response duration tracking using `perf_hooks`
- `__mocks__/mongodb.js`: Jest mock for MongoDB (returns COMPLETE/VOID certificate fixtures)
- `function.json`: Azure Functions binding definitions (timer schedule, HTTP triggers)
- `host.json`: Defines both functions in `functions` array, enables AppInsights live metrics

## CI/CD & Deployment

### GitFlow Branching
**Strictly enforced** - pipelines fail on non-standard branch names:
- `main`: Production releases
- `develop`: Integration branch
- `feature/*`, `epic/*`: Feature development
- `hotfix/*`: Production fixes

### Azure Pipelines
Uses shared template from `mmo-fes-pipeline-common` repo:
```yaml
# azure-pipelines.yml extends shared template
parameters:
  - deployFromFeature: false  # Override to deploy feature branches
  - skipPRE1: false            # Skip PRE1 environment
```

### Docker Build
Node 22 runtime on Azure Functions v4:
```dockerfile
FROM mcr.microsoft.com/azure-functions/node:4-node22
# Includes githash tracking via ARG GIT_HASH
```

## Common Pitfalls

1. **MongoDB Mock Not Applied**: Ensure `moduleNameMapper` in `package.json` points to `__mocks__/mongodb.js`
2. **Axios Import Path**: Use `axios/dist/node/axios.cjs` in Jest moduleNameMapper to avoid ESM issues
3. **Timer Past Due**: Always check `myTimer.IsPastDue` and log when function execution is delayed
4. **CA Bundle Missing**: Functions fail silently if `cabundle.pem` not found; wrap in try-catch
5. **Retry Delay Calculation**: First retry is immediate (delay = 0), subsequent delays increment linearly

## Environment Variables (Per-Function Config)

### mmo-fes-functionapp
- `CRONTIME`: Cron schedule (e.g., `"15 1,12,13 * * *"` = 1am, 12pm, 1pm)
- `DATA_READER_URL`: Target endpoint (default: `http://localhost:9000/v1/jobs/landings`)
- `TIMEOUT_IN_MS`: HTTP timeout (default: 600000 = 10min)
- `NUMBER_OF_RETRIES`: Retry attempts (default: 4)
- `RETRY_DELAY_IN_MS`: Delay increment per retry (default: 300000 = 5min)

### mmo-fes-reconciliationapp
- `DB_NAME`, `DB_CONNECTION_URI`: MongoDB connection
- `BATCH_CERTIFICATES_NUMBER`: Batch size for BC API calls (default: 1000)
- `QUERY_START_DATE`, `QUERY_END_DATE`: Date range for certificate query
- `BUSINESS_CONTINUITY_URL`, `BUSINESS_CONTINUITY_KEY`: BC API credentials

## Node Version Requirements
- **Engine**: Node >=22.0.0 <23.0.0, npm ~10.9.2
- Lock to Node 22 runtime in Dockerfile and local development
