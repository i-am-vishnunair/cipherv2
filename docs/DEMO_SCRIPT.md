# Demo Script (10 minutes)

**0:00 - Intro & Architecture**
- "Welcome. Today I'll show Cipher, a real-time competitor blog spy system."
- Show the `ARCHITECTURE.md` Mermaid diagrams. Point out the decoupled Worker Engine and the SQLite deduplication safety.

**1:30 - Zero Setup Run**
- "Let's run the fully automated demo."
- In terminal: `npm run demo`
- Explain that this spins up the main API, dashboard, and a Mock Internet of 8 demo sites simultaneously.
- Open `http://localhost:3000`.

**3:00 - The Dashboard & Auto-Analysis**
- Show the Overview KPI grid.
- Go to the **Competitors** tab. Explain how "Site A" through "Site H" were just added by URL.
- Show the "Strategy" column showing how the Analyzer automatically figured out if it should use RSS, Sitemap, or Page scraping.

**4:30 - Live Detection Demo**
- "Let's publish a new article and watch the system detect it in real-time."
- Show the terminal where we trigger the CLI: `npm run demo:publish -- --site A`
- Flip back to the Dashboard. Wait ~10-20 seconds.
- A Toast notification pops up! "New article from Site A".
- Point out the delay (e.g. 15s) and how it's calculated exactly.

**6:00 - Deep Dive on Delays & Methods**
- Go to the **Articles** tab. Show how different methods (RSS vs Page vs Sitemap) have different delays and metadata availability.
- Go to the **Performance** tab to see the aggregate stats of RSS vs Sitemap.

**8:00 - 100 Website Scale Test**
- Kill the demo, run `npm run loadtest`.
- Explain how the worker uses a Priority Queue and Concurrency Pools (Global=20, Per-Host=2).
- Show how the flaky/timeout sites don't block the healthy ones.
- Show the generated `reports/loadtest-report.md`.

**9:30 - Summary**
- Show that 0 duplicates were created thanks to the strict SQLite ON CONFLICT rules.
- Conclude demo.
