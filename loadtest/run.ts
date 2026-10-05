import express from 'express';
import axios from 'axios';
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const PORT = 4001;
const SITES = 100;
const DURATION_MS = 60000; // 1 minute default for quick test
const args = process.argv.slice(2);
const durationIdx = args.indexOf('--duration');
const duration = durationIdx > -1 ? parseInt(args[durationIdx + 1]) * 60000 : DURATION_MS;

const app = express();
const siteData: Record<number, any[]> = {};
let publishedStats = { total: 0, byType: {} as Record<string, number> };

// Init sites
for (let i = 0; i < SITES; i++) {
  siteData[i] = [];
}

function publish(siteId: number) {
  const type = siteId % 4 === 0 ? 'rss' : siteId % 4 === 1 ? 'sitemap' : siteId % 4 === 2 ? 'page' : 'mixed';
  const article = {
    id: uuidv4(),
    title: `LoadTest Article ${Date.now()}`,
    url: `http://localhost:${PORT}/site-${siteId}/article/${uuidv4()}`,
    published: new Date().toISOString()
  };
  siteData[siteId].unshift(article);
  publishedStats.total++;
  publishedStats.byType[type] = (publishedStats.byType[type] || 0) + 1;
}

// Routes
for (let i = 0; i < SITES; i++) {
  const type = i % 4; // 0=RSS, 1=Sitemap, 2=Page, 3=Flaky/Slow RSS
  
  if (type === 0 || type === 3) {
    app.get(`/site-${i}/feed`, (req, res) => {
      const delay = type === 3 ? (Math.random() > 0.5 ? 5000 : 0) : 0;
      if (type === 3 && Math.random() < 0.2) return res.status(500).send('Error');
      
      setTimeout(() => {
        const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
          ${siteData[i].map(a => `<item><title>${a.title}</title><link>${a.url}</link><pubDate>${a.published}</pubDate></item>`).join('')}
        </channel></rss>`;
        res.type('application/xml').send(rss);
      }, delay);
    });
  } else if (type === 1) {
    app.get(`/site-${i}/robots.txt`, (req, res) => res.type('text/plain').send(`Sitemap: http://localhost:${PORT}/site-${i}/sitemap.xml`));
    app.get(`/site-${i}/sitemap.xml`, (req, res) => {
      const sm = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${siteData[i].map(a => `<url><loc>${a.url}</loc><lastmod>${a.published}</lastmod></url>`).join('')}
      </urlset>`;
      res.type('application/xml').send(sm);
    });
  } else {
    app.get(`/site-${i}`, (req, res) => {
      const html = `<html><body>
        ${siteData[i].map(a => `<div><a href="${a.url}">${a.title}</a><time datetime="${a.published}"></time></div>`).join('')}
      </body></html>`;
      res.send(html);
    });
  }
}

async function run() {
  console.log(`Starting mock internet with ${SITES} sites on port ${PORT}...`);
  const server = app.listen(PORT);

  // Start app
  const npx = /^win/.test(process.platform) ? 'npx.cmd' : 'npx';
  const mainApp = spawn(npx, ['tsx', 'src/main.ts', '--no-worker'], { stdio: 'inherit', shell: true });
  const workerApp = spawn(npx, ['tsx', 'src/worker-main.ts'], { stdio: 'inherit', shell: true });
  
  console.log('Waiting for apps to start...');
  await new Promise(r => setTimeout(r, 10000));

  // Seed
  const competitors = [];
  for (let i = 0; i < SITES; i++) {
    competitors.push({ name: `Site ${i}`, url: `http://localhost:${PORT}/site-${i}` });
  }
  
  console.log('Importing competitors...');
  await axios.post('http://localhost:3000/api/competitors/bulk-import', { competitors });

  console.log('Baselining...');
  await new Promise(r => setTimeout(r, 10000));

  console.log(`Running load test for ${duration / 1000}s...`);
  
  const publisher = setInterval(() => {
    // Publish to a random site every 2s
    publish(Math.floor(Math.random() * SITES));
  }, 2000);

  await new Promise(r => setTimeout(r, duration));
  clearInterval(publisher);

  console.log('Waiting for last detections...');
  await new Promise(r => setTimeout(r, 10000));

  // Fetch results
  const stats = (await axios.get('http://localhost:3000/api/stats/overview')).data;
  
  server.close();
  mainApp.kill();
  workerApp.kill();

  if (!existsSync('reports')) mkdirSync('reports');
  const report = `
# Load Test Report
Duration: ${duration / 1000}s
Sites Monitored: ${SITES}
Articles Published: ${publishedStats.total}
Articles Detected: ${stats.articles.total}

## Detection Delays
- Average: ${stats.articles.avgDelayFormatted}
- Fastest: ${stats.articles.minDelayFormatted}
- Slowest: ${stats.articles.maxDelayFormatted}
- Within 5 min: ${stats.articles.within5minPct}%

## System Metrics
- Total Checks: ${stats.checks.total}
- Failed Checks: ${stats.checks.failed}
- Timeouts: ${stats.checks.timeouts}
- Checks/min: ${stats.checks.checksPerMinute}
  `;

  writeFileSync('reports/loadtest-report.md', report);
  writeFileSync('reports/loadtest-report.json', JSON.stringify({ published: publishedStats, stats }, null, 2));
  console.log('Load test complete. Report saved to reports/loadtest-report.md');
  process.exit(0);
}

run().catch(console.error);
