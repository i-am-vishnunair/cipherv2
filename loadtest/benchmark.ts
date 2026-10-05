import axios from 'axios';
import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

async function runBenchmark() {
  console.log('Starting Benchmark...');

  // Similar to load test, but focused on method comparison
  const npx = /^win/.test(process.platform) ? 'npx.cmd' : 'npx';
  const demoSites = spawn(npx, ['tsx', 'demo-sites/server.ts'], { stdio: 'inherit', shell: true });
  const app = spawn(npx, ['tsx', 'src/main.ts'], { stdio: 'inherit', shell: true });
  
  await new Promise(r => setTimeout(r, 10000));

  const competitors = [
    { name: 'Site A (Ideal)', url: `http://localhost:4000/site-a` },
    { name: 'Site C (Sitemap)', url: `http://localhost:4000/site-c` },
    { name: 'Site D (Page)', url: `http://localhost:4000/site-d` },
    { name: 'Site H (WP API)', url: `http://localhost:4000/site-h` },
  ];

  await axios.post('http://localhost:3000/api/competitors/bulk-import', { competitors });
  await new Promise(r => setTimeout(r, 5000));

  // Publish
  for(let i=0; i<3; i++) {
    await axios.post(`http://localhost:4000/admin/publish/A`);
    await axios.post(`http://localhost:4000/admin/publish/C`);
    await axios.post(`http://localhost:4000/admin/publish/D`);
    await axios.post(`http://localhost:4000/admin/publish/H`);
    await new Promise(r => setTimeout(r, 2000));
  }

  await new Promise(r => setTimeout(r, 10000));

  const stats = (await axios.get('http://localhost:3000/api/stats/methods')).data;
  
  demoSites.kill();
  app.kill();

  if (!existsSync('reports')) mkdirSync('reports');
  const report = `
# Performance Benchmark Report

## Method Comparison
| Method | Checks | Avg Duration | Success Rate |
|---|---|---|---|
${stats.checkPerformance.map((m: any) => `| ${m.strategy} | ${m.count} | ${m.avg_duration.toFixed(1)}ms | ${m.success_rate.toFixed(1)}% |`).join('\n')}

## Detection Delays by Method
| Method | Detections | Avg Delay | Min Delay | Max Delay |
|---|---|---|---|---|
${stats.articleStats.map((m: any) => `| ${m.detection_method} | ${m.count} | ${m.avg_delay.toFixed(1)}ms | ${m.min_delay}ms | ${m.max_delay}ms |`).join('\n')}

## Limitations
- CDN/Feed caching can artificially inflate delays (see Site G).
- Sitemap polling is efficient but typically updates slower than RSS.
- Page polling requires downloading full HTML and is prone to breakage.
- Near-real-time is only guaranteed with push mechanisms (WebSub) or very frequent polling (which risks rate-limiting).
  `;

  writeFileSync('reports/performance-report.md', report);
  console.log('Benchmark complete. Report saved to reports/performance-report.md');
  process.exit(0);
}

runBenchmark().catch(console.error);
