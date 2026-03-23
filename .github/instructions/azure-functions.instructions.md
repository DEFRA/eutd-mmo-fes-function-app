---
description: 'Azure Functions and Node.js best practices for MMO FES Function Apps'
applyTo: '**/*.{js,ts}'
---

# Azure Functions & Node.js Best Practices for MMO FES

This instructions file applies to all Azure Functions code in the MMO Fish Export Service function apps (mmo-fes-functionapp and mmo-fes-reconciliationapp).

## Core Principles

### 1. Function Handler Pattern
Export an async function that receives `context` and the trigger binding:
```javascript
const func = async (context, myTimer, overrideConfig) => {
  context.log(`[COMPONENT][ACTION][STARTED]`, timeNow());

  // Merge any config overrides (useful for testing)
  config = { ...config, ...overrideConfig };

  // Check if timer is late
  if (myTimer.IsPastDue)
    context.log('[SCHEDULED-JOBS][COMPONENT][RUNNING-LATE]', timeNow());

  // Initialize Application Insights
  if (config.instrumentationKey)
    appInsights.init(config.instrumentationKey, context);

  // Business logic...
};

module.exports = func;
```

### 2. Trigger Configuration (function.json)

**Timer Trigger:**
```json
{
  "bindings": [{
    "name": "myTimer",
    "type": "timerTrigger",
    "direction": "in",
    "schedule": "%CRONTIME%"
  }]
}
```

**HTTP Trigger:**
```json
{
  "bindings": [
    {
      "name": "req",
      "type": "httpTrigger",
      "direction": "in",
      "authLevel": "anonymous"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

### 3. Asynchronous Patterns
- **Always use async/await** - never use callback-style APIs
- **Handle promise rejections** - wrap awaits in try/catch
- **Sequential vs parallel** - use `Promise.all()` for independent operations
- **No blocking operations** - avoid synchronous I/O

## Retry Patterns

### Linear Retry with Delay Calculation
```javascript
const retry = (fn, retries, delayFn) =>
  fn(retries).catch(e =>
    (retries > 0)
      ? wait(delayFn(retries)).then(() => retry(fn, retries - 1, delayFn))
      : Promise.reject(new Error('failed'))
  );

const calcDelay = (delay, totalRetries) => (retriesRemaining) =>
  (totalRetries - retriesRemaining) * delay;
```

### Exponential Backoff
```javascript
async function makeApiCallWithRetry(url, apiName, key, data, maxRetries, retryDelay) {
  let retryCount = 0;
  while (retryCount < maxRetries) {
    try {
      const response = await axios.put(`${url}${apiName}`, data, {
        headers: { 'X-API-KEY': key, 'accept': 'application/json' }
      });
      return response;
    } catch (error) {
      retryCount++;
      if (retryCount >= maxRetries) throw new Error('Max retries exceeded');
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, retryCount) * retryDelay)
      );
    }
  }
}
```

## Application Insights Integration

### Initialization
```javascript
const appInsights = require('applicationinsights');

const init = (instrumentationKey, context) => {
  operationIdOverride = { "ai.operation.id": context.operationId };
  appInsights.setup(instrumentationKey);
  appInsightsClient = appInsights.defaultClient;
};
```

### Tracking Events and Requests
```javascript
const trackEvent = (name, properties) => {
  if (appInsightsClient) {
    appInsightsClient.trackEvent({
      name,
      properties,
      tagOverrides: operationIdOverride
    });
  }
};

const trackRequest = (name, url, response) => {
  if (appInsightsClient) {
    appInsightsClient.trackRequest({
      name,
      url,
      duration: response.duration,
      resultCode: response.status,
      success: response.status === 200,
      tagOverrides: operationIdOverride
    });
  }
};
```

## HTTP Client with Performance Tracking

### Axios Interceptors for Duration Measurement
```javascript
const { performance } = require('perf_hooks');

const requestInterceptor = (config) => {
  config.meta = config.meta || {};
  config.meta.ts = performance.now();
  return config;
};

const responseInterceptor = (response) => {
  response.duration = parseInt(performance.now() - response.config.meta.ts);
  return response;
};
```

## Logging Convention

Use bracketed structured logging with timestamps throughout:
```javascript
const timeNow = () => new Date(Date.now()).toISOString();

context.log(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][STARTED]`, timeNow());
context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][MAKE-API-CALL][ATTEMPT-1]`, timeNow());
context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][ERROR][ATTEMPT-2]`, timeNow());
context.log(`[SCHEDULED-JOBS][BC-RECONCILIATION][DB_NAME][${dbName}]`, timeNow());
```

## MongoDB Patterns

### Connection Management
Always use try/finally to ensure connections are closed:
```javascript
const { MongoClient } = require("mongodb");

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

try {
  await client.connect();
  const database = client.db(config.dbName);
  const collection = database.collection("exportCertificates");

  const documents = (await collection.find(query).toArray()).map((doc) => ({
    certNumber: doc.documentNumber,
    status: doc.status,
    timestamp: doc.status === "COMPLETE" ? doc.createdAt : timeNow()
  }));
} finally {
  await client.close();
}
```

### Date Range Queries
```javascript
const query = {
  createdAt: {
    $gte: startDate,
    $lte: nextDate
  },
  status: { $in: ["COMPLETE", "VOID"] }
};
```

## Array Batching Utility

```javascript
const batchArray = (array, batchSize) => {
  return Array.from(
    { length: Math.ceil(array.length / batchSize) },
    (_, index) => array.slice(index * batchSize, (index + 1) * batchSize)
  );
};
// Usage: const batches = batchArray(documents, 1000);
```

## Environment Configuration

### Centralized Config Object
```javascript
let config = {
  url: process.env.DATA_READER_URL || 'http://localhost:9000/v1/jobs/landings',
  timeoutMS: process.env.TIMEOUT_IN_MS || 600000,
  retries: process.env.NUMBER_OF_RETRIES || 4,
  retryDelay: process.env.RETRY_DELAY_IN_MS || 300000,
  instrumentationKey: process.env.APPINSIGHTS_INSTRUMENTATIONKEY || null,
  dbConnectionUri: process.env.DB_CONNECTION_URI,
  dbName: process.env.DB_NAME
};
```

## Testing Best Practices

### Mock Azure Functions Context
```javascript
describe('func', () => {
  let ctx;
  const timer = { IsPastDue: true };

  beforeEach(() => {
    ctx = {
      log: jest.fn(),
      done: jest.fn(),
      traceContext: { traceparent: 'test123' },
      executionContext: { functionDirectory: __dirname }
    };
  });

  it('should retry on failure', async () => {
    const mockAxios = jest.spyOn(axios, 'post');
    mockAxios
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(null);

    await func(ctx, timer);
    expect(mockAxios).toHaveBeenCalledTimes(2);
  });
});
```

### Coverage Thresholds
Maintain high coverage standards:
- Branches: 90%
- Functions: 90%
- Lines: 90%
- Statements: 90%

## Security Considerations

- Use `authLevel: "anonymous"` only when fronted by API Management or other auth
- Store connection strings and API keys in environment variables
- Use Application Insights for monitoring, never log sensitive data
- Validate all incoming HTTP request payloads
