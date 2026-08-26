---
name: develop
description: 'Expert Azure Functions (Node.js) developer for MMO FES Function App. Use when: implementing features, fixing bugs, refactoring code, researching codebase, planning solutions. Covers timer/HTTP triggers, retry patterns, App Insights integration.'
license: OGL-UK-3.0
metadata:
  author: mmo-fes
  version: "1.0"
---

# Function App — Developer Skill

Expert software engineer for the MMO FES Azure Function App. Reads the codebase, researches, plans, reasons, writes production-ready code following Azure Functions conventions.

## Working framework alignment

This skill supports the **§4 working framework** in [copilot-instructions.md](../../copilot-instructions.md) — it does not replace it. Triage first:

- **Trivial** change: light Read → Implement → Test → Summarise.
- **Standard** work (a normal fix or small enhancement with no new trigger, external integration, or security surface): a lightweight inline plan (authored by the Developer, no heavyweight Planner) plus user approval before implementation.
- **Complex** work (new trigger, retry/backoff change, App Insights instrumentation change, MongoDB batch-operation change, a security surface): full planning and user approval — normally via the [Orchestrator](../../agents/function-app-orchestrator.agent.md) and [Planner](../../agents/function-app-planner.agent.md) agents.

Use the [deep-research-defra-alignment](../deep-research-defra-alignment/SKILL.md) skill for the single, risk-scoped Research pass when something is genuinely uncertain.

## When to Use

- Implementing or modifying timer/HTTP triggered functions
- Working on retry logic or error handling
- Integrating with Application Insights
- Refactoring or restructuring function code
- Any production code writing task

## Workflow

### Before Making Changes

1. Search codebase for similar function patterns
2. Check existing tests to understand expected behavior
3. Review `function.json` trigger configuration
4. Understand the retry and backoff patterns in use

### During Implementation

1. Follow all mandatory rules from the auto-loaded instruction files (`azure-functions.instructions.md`, `typescript.instructions.md`)
2. Initialize App Insights BEFORE creating Axios instances — order matters
3. Export functions via `module.exports = func` (Node.js Azure Functions pattern)

### After Implementation

1. Run tests: `npm test`
2. Verify coverage thresholds: 90% branches, functions, lines, statements
3. Check problems panel for any issues
4. Invoke the `/unit-tests` skill to write or update tests

## Project Conventions

### Function Handler Pattern

```javascript
const func = async (context, myTimer, overrideConfig) => {
  context.log(`[COMPONENT][ACTION][STARTED]`, timeNow());
  config = { ...config, ...overrideConfig };
  if (myTimer.IsPastDue)
    context.log('[SCHEDULED-JOBS][COMPONENT][RUNNING-LATE]', timeNow());
  if (config.instrumentationKey)
    appInsights.init(config.instrumentationKey, context);
  // Business logic...
};

module.exports = func;
```

### Retry with Exponential Backoff

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

### App Insights Tracking

```javascript
const trackEvent = (name, properties) => {
  if (appInsightsClient) {
    appInsightsClient.trackEvent({
      name, properties,
      tagOverrides: operationIdOverride
    });
  }
};
```

### Bracketed Logging with Timestamps

```javascript
const timeNow = () => new Date(Date.now()).toISOString();
context.log(`[SCHEDULED-JOBS][LANDING-AND-REPORTING][STARTED]`, timeNow());
```

## Anti-Patterns

> Mandatory rules in the instruction files also apply. The items below are additional anti-patterns specific to this skill:

- Initializing Axios before App Insights — App Insights must be initialized first
- Forgetting `IsPastDue` check on timer triggers
- Using `exports.handler` instead of `module.exports = func`
- Hardcoding retry delay without exponential backoff calculation
