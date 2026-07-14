---
name: unit-tests
description: 'Expert unit test engineer for MMO FES Function App. Use when: writing unit tests, updating tests for code changes, fixing failing tests, improving code coverage, fixing SonarQube issues.'
license: OGL-UK-3.0
metadata:
  author: mmo-fes
  version: "1.0"
---

# Function App — Unit Tests Skill

Expert in writing and maintaining unit tests for MMO FES Azure Functions.

## When to Use

- Writing unit tests for new or modified functions
- Fixing failing tests after code changes
- Improving code coverage to meet thresholds
- Fixing SonarQube issues or code smells

## Coverage Requirements

- **Branches**: 90%
- **Functions**: 90%
- **Lines**: 90%
- **Statements**: 90%
- Run tests: `npm test`
- Run CI tests: `npm run test:ci`

## Test Framework & Tools

- **Jest** as test runner with jest-junit reporter
- Test files colocated in `__tests__/` or alongside source

## Mocking Patterns

### Azure Function Context

```javascript
const mockContext = {
  log: jest.fn(),
  bindings: {},
  executionContext: { functionName: 'myFunction' },
  operationId: 'test-op-id'
};
```

### Timer Trigger

```javascript
const mockTimer = {
  IsPastDue: false,
  Schedule: { AdjustForDST: true }
};
```

### Config Override

```javascript
const overrideConfig = {
  instrumentationKey: 'test-key',
  apiUrl: 'http://localhost:3000'
};

await func(mockContext, mockTimer, overrideConfig);
```

### setTimeout (Critical for Retry Tests)

```javascript
jest.useFakeTimers();
// trigger retry
jest.advanceTimersByTime(retryDelay);
jest.useRealTimers();
```

### Axios

```javascript
jest.mock('axios');
const mockedAxios = axios;
mockedAxios.put.mockResolvedValue({ status: 200, data: {} });
// For retry tests:
mockedAxios.put
  .mockRejectedValueOnce(new Error('fail'))
  .mockResolvedValueOnce({ status: 200, data: {} });
```

## What to Test

1. **Happy path** — function executes successfully with valid timer/HTTP trigger
2. **IsPastDue** — verify late execution is logged
3. **Retry logic** — verify exponential backoff delays and max retry limit
4. **App Insights** — verify events and requests are tracked
5. **Error handling** — verify errors are caught, logged, and re-thrown appropriately
6. **Config override** — verify `overrideConfig` merges correctly

## SonarQube Issue Resolution

When fixing SonarQube issues, **NEVER modify functionality**. If existing tests fail after a fix, revert it.

## Workflow

1. Identify the function(s) that need tests
2. Create mock context, timer, and config
3. Write tests following Arrange/Act/Assert pattern
4. Run `npm test` and check coverage output
5. If coverage below thresholds, add targeted tests for uncovered branches
6. Check problems tab for SonarQube issues
