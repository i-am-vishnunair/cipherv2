# Cipher - Competitor Blog Spy

A platform that continuously monitors competitor websites, auto-discovers how each site publishes content, detects newly published blog/article posts as fast as possible, and records the exact detection delay.

## Requirements
- Node.js 20+

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the fully automated demo:
   ```bash
   npm run demo
   ```
   This will start the demo sites, start the app, seed competitors, publish articles, and show you the dashboard. Open `http://localhost:3000` in your browser.

## Running in Production

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the main app (API + Dashboard + Engine):
   ```bash
   npm run dev
   ```
   Or optionally run the worker separately:
   ```bash
   npm run dev --no-worker
   npm run worker
   ```

## Testing

Run tests:
```bash
npm test
```

Run load test (100 mock sites):
```bash
npm run loadtest
```

Run performance benchmark:
```bash
npm run benchmark
```

## Dashboard
Open `http://localhost:3000` to access the dashboard.
