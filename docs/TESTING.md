# Testing the System

## 1. Load Test (100 Sites)

**Command:** `npm run loadtest`

**How it works:**
1. Spins up an Express mock server (`loadtest/run.ts`) simulating 100 distinct competitor sites on port 4001.
2. Mixes strategies: RSS, Sitemap, Page, and Flaky/Slow.
3. Automatically adds all 100 to the system via bulk-import.
4. Waits for baseline completion.
5. Emits random new articles every 2 seconds.
6. Asserts 0 duplicates and measures concurrency limits.
7. Produces `reports/loadtest-report.md`.

**Answers to architecture questions:**
- **How are 100 websites scheduled?** A priority queue sorted by `next_check_at`. The worker loop wakes up and takes the top N due checks.
- **Does one slow website block others?** No. Global concurrency is 20, and per-host concurrency is 2. A 10-second timeout on a slow site only consumes 1 slot out of 20. The other 19 proceed instantly.
- **How are failed websites retried?** Circuit breaker pattern. Failures increment `consecutive_failures`, triggering exponential backoff polling. At 5 failures, the site goes "Offline" and cools down for 5 minutes.
- **How is duplicate processing avoided?** SQLite `INSERT ... ON CONFLICT(competitor_id, normalized_url) DO NOTHING`. Even if two workers race, the DB enforces uniqueness instantly.

## 2. Performance Benchmark

**Command:** `npm run benchmark`

**How it works:**
Compares the real-world latency of RSS vs Sitemap vs HTML Page parsing, outputting to `reports/performance-report.md`.
