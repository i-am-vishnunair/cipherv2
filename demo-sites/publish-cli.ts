import axios from 'axios';

async function publish(site: string) {
  const port = process.env.DEMO_PORT || 4000;
  try {
    const res = await axios.post(`http://localhost:${port}/admin/publish/${site}`);
    console.log(`Successfully published to ${site}. Data:`, res.data);
  } catch (err: any) {
    console.error(`Failed to publish to ${site}:`, err.message);
  }
}

const args = process.argv.slice(2);
let site = 'A';
if (args[0] === '--site' && args[1]) {
  site = args[1].toUpperCase();
}

publish(site);
