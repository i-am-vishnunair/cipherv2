import { spawn } from 'child_process';
import axios from 'axios';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';

const log = getLogger('demo-runner');

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runDemo() {
  log.info('Starting Demo Environment with Real Competitors...');

  const npx = /^win/.test(process.platform) ? 'npx.cmd' : 'npx';
  
  // Start main app
  const mainApp = spawn(npx, ['tsx', 'src/main.ts'], { stdio: 'inherit', shell: true });

  // Wait for server to boot
  log.info('Waiting for server to boot...');
  await sleep(4000);

  const config = getConfig();
  const apiBase = `http://localhost:${config.port}/api`;

  // Top 20 Real World Competitors (Tech/Business Blogs)
  const competitorsToSeed = [
    { name: 'TechCrunch', url: 'https://techcrunch.com' },
    { name: 'The Verge', url: 'https://www.theverge.com' },
    { name: 'Wired', url: 'https://www.wired.com' },
    { name: 'Engadget', url: 'https://www.engadget.com' },
    { name: 'Ars Technica', url: 'https://arstechnica.com' },
    { name: 'Mashable', url: 'https://mashable.com' },
    { name: 'Gizmodo', url: 'https://gizmodo.com' },
    { name: 'VentureBeat', url: 'https://venturebeat.com' },
    { name: 'ZDNet', url: 'https://www.zdnet.com' },
    { name: 'ReadWrite', url: 'https://readwrite.com' },
    { name: 'Cloudflare Blog', url: 'https://blog.cloudflare.com' },
    { name: 'AWS News', url: 'https://aws.amazon.com/blogs/aws/' },
    { name: 'Google Cloud Blog', url: 'https://cloud.google.com/blog/' },
    { name: 'Microsoft DevBlogs', url: 'https://devblogs.microsoft.com/' },
    { name: 'Vercel Blog', url: 'https://vercel.com/blog' },
    { name: 'Netlify Blog', url: 'https://www.netlify.com/blog/' },
    { name: 'Stripe Blog', url: 'https://stripe.com/blog' },
    { name: 'Y Combinator Blog', url: 'https://blog.ycombinator.com/' },
    { name: 'Andreessen Horowitz', url: 'https://a16z.com/' },
    { name: 'Netflix Tech Blog', url: 'https://netflixtechblog.com/' },
  ];

  log.info('Seeding Top 20 Real-World Competitors...');
  await axios.post(`${apiBase}/competitors/bulk-import`, { competitors: competitorsToSeed })
    .catch(err => log.error('Failed to seed:', err.message));

  log.info('Wait for analysis and baseline to complete...');
  
  log.info(`Demo running! Open http://localhost:${config.port} in your browser to watch Cipher analyze and track real websites.`);
  
  // Keep alive
  process.on('SIGINT', () => {
    mainApp.kill();
    process.exit();
  });
}

runDemo().catch(console.error);
