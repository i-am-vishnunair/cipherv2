# PLAN.md — Competitor Blog Spy & Real-Time Content Monitoring System

## Architecture Decisions

1. **Monorepo structure** — single `package.json`, TypeScript compiled with `tsx` for dev, `tsc` for production.
2. **SQLite via better-sqlite3** in WAL mode — zero-config, fast, portable. DB layer uses a repository pattern so Postgres swap is trivial.
3. **Express server** serves both the REST API and the static dashboard (vanilla JS + Tailwind CDN). SSE endpoint for live updates.
4. **Worker runs in-process** by default (`npm run dev` starts both), but can be started separately (`npm run worker`).
5. **Demo sites** are a separate Express app on port 4000+ that simulates 8 different competitor websites.
6. **Load test** spins up a mock-internet server with 100 virtual sites on a single port using path-based routing.

## Module Build Order

### Phase 1: Foundation
- [x] Project scaffold (package.json, tsconfig, directory structure)
- [x] Database schema & migration runner
- [x] Core types & validation (Zod schemas)
- [x] Logger (pino)
- [x] Configuration system

### Phase 2: Core Engine
- [x] URL normalization & deduplication utilities
- [x] HTTP client with timeouts, conditional GET, retries
- [x] Strategy interface & base class
- [x] RSS/Atom feed strategy
- [x] Sitemap strategy
- [x] Direct page monitoring strategy
- [x] Bonus strategies (WordPress REST API, JSON Feed)
- [x] Website analyzer (auto-discovery)
- [x] Content capture (Readability + fallbacks)

### Phase 3: Monitoring Engine
- [x] Scheduler with priority queue
- [x] Worker pool with concurrency control (global + per-host)
- [x] Circuit breaker & exponential backoff
- [x] Adaptive polling intervals
- [x] Monitoring loop & check recording

### Phase 4: API & Dashboard
- [x] REST API (competitors CRUD, articles, checks, settings)
- [x] SSE endpoint for live updates
- [x] Dashboard pages (Overview, Competitors, Articles, Checks, Performance, Settings)
- [x] Notifications system

### Phase 5: Demo & Testing
- [x] Demo sites (A–H)
- [x] Demo runner (`npm run demo`)
- [x] Unit & integration tests
- [x] Load test (100 sites)
- [x] Benchmark script

### Phase 6: Documentation & Reports
- [x] README.md
- [x] docs/ARCHITECTURE.md
- [x] docs/API.md
- [x] docs/TESTING.md
- [x] docs/DEMO_SCRIPT.md
- [x] reports/ (generated from actual runs)
- [x] config/ files
- [x] .env.example
