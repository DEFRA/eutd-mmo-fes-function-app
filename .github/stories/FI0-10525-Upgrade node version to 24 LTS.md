# Upgrade node version to 24 LTS

## 1. Goals and Constraints

- Upgrade runtime from Node.js 22 to Node.js 24.
- Keep:
  - Azure Functions v4
  - Existing retry patterns and MongoDB usage
  - Existing Application Insights integration
  - Jest test setup and coverage thresholds
- Constraint: **Where possible, avoid Node module/package version upgrades.**

You will mainly change:

- Node.js version locally (nvm / Volta / asdf / dev container / CI image).
- Node.js version in Azure Functions configuration.
- Any minimal code changes required by Node 24 (if strictness changes surface issues).

---

## 2. Pre‑upgrade Preparation

Tasks:

1. **Document current state**
   - Record:
     - Current Node.js version (22.x) locally and in CI.
     - Azure Function App settings: Node version, plan, OS, region.
     - Current environment variable configuration (App Settings export, `local.settings.json`).
   - Save a copy of:
     - `package.json`
     - `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`.
2. **Freeze dependencies**
   - Ensure **no** package upgrades happen unintentionally:
     - If you use `^` or `~` ranges, run `npm ci` (or lockfile-based install) so CI and local dev are reproducible.
     - Commit the lockfile to guarantee the same versions under Node 24.
   - Add explicit instruction in your team docs/PR template:
     - “For the Node 24 upgrade, **do not upgrade npm packages** unless a Node 24 compatibility issue is proven and documented.”
3. **Baseline tests \& metrics**
   - Run the full Jest test suite on Node 22:
     - Save coverage report (HTML + summary).
   - Trigger a non‑production run of the Functions app, capturing:
     - Application Insights traces and failures.
     - MongoDB performance for typical operations.
   - This gives you a **before** snapshot for comparison after the upgrade.

---

## 3. Local Environment Upgrade

Tasks:

1. **Install Node.js 24 locally**
   - Using your version manager (example with nvm):
     - `nvm install 24`
     - `nvm use 24`
   - Do **not** run `npm update` or change dependency versions.
2. **Pin Node version in the repo**
   - Add/update `.nvmrc` or equivalent:
     - `.nvmrc` content: `24`

- Add/update `.npmrc` to enforce Node engine checks for installs:

```ini
engine-strict=true
node-version=24.0.0
```

- If you have an `engines` field in `package.json`, update it:

```json
"engines": {
  "node": "24.x"
}
```

    - Note in docs: “Node 24 is required; other versions are not supported.”
    - Validate behaviour with `npm ci` on Node 24 (success) and a non-supported Node major (fails due to `engine-strict=true`).

3. **Verify install without package changes**
   - Delete `node_modules` locally.
   - Run `npm ci` (or equivalent) to reinstall from the lockfile with **existing** versions.
   - Confirm:
     - No `package.json` changes.
     - No lockfile changes.
4. **Run test suite on Node 24 locally**
   - Run:
     - `npm test` / `npx jest`.
   - Fix **only** issues directly related to Node 24 behaviour (e.g., stricter argument validation, timing differences).
   - Do not introduce library upgrades as a first resort; prefer:
     - Adjusting tests for more robust timing.
     - Minor code changes (e.g., avoiding deprecated APIs).

---

## 4. Code Review and Adjustments (Node 24 behaviour)

Tasks (without changing dependency versions unless required):

1. **Check for runtime/deprecation warnings**
   - Start your Azure Functions host locally under Node 24:
     - `func start` (or your normal command).
   - Watch the console for:
     - Deprecation warnings.
     - Strict validation errors (e.g., fs, timers, Buffer, URL APIs).
   - Fix issues by code changes, not package upgrades, where possible.
2. **Retry patterns \& timers**
   - Inspect any custom retry code using:
     - `setTimeout`, `setInterval`, `setImmediate`, `process.nextTick`.
   - Confirm:
     - No assumptions on timer resolution that might break due to subtle changes in Node 24.
   - Consider:
     - Ensuring retry code handles unexpected error types gracefully (Node 24 may throw earlier for invalid args).
3. **Application Insights integration**
   - Review:
     - Telemetry initialisation (e.g., `applicationinsights.setup(...).start()`).
     - Context propagation across async boundaries.
   - Node 24 continues to improve async context handling; verify:
     - Operation IDs and correlation IDs remain consistent across HTTP handlers, retries, and MongoDB calls.
   - Use the existing `applicationinsights` version unless:
     - You see a **specific** compatibility error or bug that can only be fixed by updating the library.
4. **MongoDB / Cosmos DB API**
   - Run representative test operations under Node 24:
     - Connection creation and disposal (especially across retries).
     - Batch queries.
     - Certificate reconciliation logic.
   - Look for:
     - Unhandled promise rejections (Node 24 may surface them more clearly).
     - Changes in error stack formatting that could affect logging assertions in tests.
5. **Axios and perf_hooks usage**
   - If you rely on `perf_hooks.performance` for request duration in axios interceptors:
     - Confirm timing values match expectations, especially around high‑throughput scenarios.
   - Ensure:
     - Any global interceptors and their error handling still work under Node 24.
     - Tests that assert on timings use tolerant ranges, not exact values.

---

## 5. Azure Functions Configuration Change

Tasks:

1. **Confirm Azure Functions support for Node 24**
   - Check that your Functions runtime (v4) and hosting plan supports Node 24 in your region.
   - If it is still in preview, plan a **staging** rollout first.
2. **Update the Function App stack setting**
   - In Azure:
     - Go to the Function App → Configuration → General Settings.
     - Change the Node runtime stack from 22 to 24.
     - Save and confirm.
   - Alternatively, update via:
     - ARM/Bicep/Terraform or Azure CLI if you manage infra as code.
3. **Deploy with no code changes other than Node version**
   - Deploy the existing code (already validated under Node 24 locally).
   - Ensure:
     - `WEBSITE_NODE_DEFAULT_VERSION` or equivalent app setting is updated to 24.x if used.
4. **Smoke tests in non‑production**
   - Run:
     - Timer trigger: ensure it runs on schedule and logs as expected.
     - HTTP triggers: verify:
       - Status codes.
       - Response bodies.
       - Telemetry entries (correlation IDs, custom properties).
     - MongoDB operations: manual invocation or automated smoke test.

---

## 6. Testing Strategy (CI and Coverage)

Tasks:

1. **Update CI to Node 24**
   - In GitHub Actions / Azure DevOps / other:
     - Change the Node version setup step to 24.x.
   - Ensure tests run with **no** dependency upgrades:
     - Use `npm ci` instead of `npm install` where possible.
2. **Test suite validation**
   - Keep your Jest coverage target (>90%).
   - Pay attention to:
     - Tests that depend on error messages (Node 24 may have slightly different messages).
     - Timing‑sensitive tests (adjust to be less brittle).
3. **Performance regression check**
   - Run load tests or at least modest throughput tests against non‑production:
     - Compare average latency and error rates before vs after.
   - Use Application Insights to:
     - Confirm no new exception patterns appear.
     - Verify retry code does not cause runaway retries or increased failure rates.

---

## 7. Production Rollout Plan

Tasks:

1. **Staged rollout**
   - If you have multiple Function Apps:
     - Upgrade a staging or canary app first.
   - For critical workloads:
     - Consider slot‑based deployment (staging slot running Node 24, then swap when healthy).
2. **Monitoring window**
   - After promoting to production:
     - Monitor Application Insights for:
       - Failure count.
       - Dependency (MongoDB) failure rates.
       - Function execution time and cold start duration.
     - Define clear thresholds for rollback (e.g., error rate above X% for Y minutes).
3. **Rollback strategy**
   - Document a simple rollback:
     - Revert Node runtime from 24 back to 22 in the Function App configuration.
     - Redeploy the last known good build if needed.
   - Because dependencies weren’t upgraded, rollback will primarily be a runtime switch, not a code change.

---

## 8. Explicit “No Package Upgrade” Guideline

Include these instructions in your internal upgrade doc / ticket:

- Do **not** upgrade any npm package versions as part of the Node 24 migration, **unless**:
  - A concrete, reproducible incompatibility with Node 24 is identified.
  - The issue cannot be resolved with minor code changes (e.g., using different APIs or adjusting tests).
- If a package upgrade is necessary:
  - Document:
    - The specific error or incompatibility.
    - The minimal version change required.
    - Impacted modules and tests.
  - Raise a **separate PR** for that package upgrade with focused review.
