import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());

// In-memory store of articles for the demo sites
const articles: Record<string, any[]> = {
  A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: []
};

function generateArticle(siteId: string) {
  const id = uuidv4();
  const date = new Date().toISOString();
  return {
    id,
    title: `Demo Article on Site ${siteId} - ${Date.now()}`,
    url: `http://localhost:${process.env.DEMO_PORT || 4000}/site-${siteId.toLowerCase()}/article/${id}`,
    published: date,
    content: `<p>This is a test article for site ${siteId} published at ${date}.</p>`,
    author: 'Demo Bot',
    image: 'https://via.placeholder.com/800x400.png?text=Demo+Article'
  };
}

// Admin endpoint to publish an article
app.post('/admin/publish/:siteId', (req, res) => {
  const site = req.params.siteId.toUpperCase();
  if (!articles[site]) return res.status(404).send('Site not found');
  
  const article = generateArticle(site);
  articles[site].unshift(article); // Add to front
  console.log(`[Demo] Published article to Site ${site}: ${article.title}`);
  res.json(article);
});

// Site A: Ideal WordPress-like (RSS + Sitemap)
app.get('/site-a', (req, res) => {
  const html = `<html><head><title>Site A Blog</title>
  <link rel="alternate" type="application/rss+xml" href="/site-a/feed">
  </head><body><h1>Site A</h1>
  ${articles.A.map(a => `<h2><a href="${a.url}">${a.title}</a></h2>`).join('')}
  </body></html>`;
  res.send(html);
});
app.get('/site-a/feed', (req, res) => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">
  <channel><title>Site A Feed</title><link>http://localhost:4000/site-a</link>
  ${articles.A.map(a => `<item><title>${a.title}</title><link>${a.url}</link><pubDate>${a.published}</pubDate></item>`).join('')}
  </channel></rss>`;
  res.type('application/xml').send(rss);
});

// Site B: Atom feed only
app.get('/site-b', (req, res) => {
  const html = `<html><head><title>Site B Blog</title>
  <link rel="alternate" type="application/atom+xml" href="/site-b/atom.xml">
  </head><body><h1>Site B</h1></body></html>`;
  res.send(html);
});
app.get('/site-b/atom.xml', (req, res) => {
  const atom = `<?xml version="1.0" encoding="utf-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom"><title>Site B Atom</title>
  ${articles.B.map(a => `<entry><title>${a.title}</title><link href="${a.url}"/><updated>${a.published}</updated></entry>`).join('')}
  </feed>`;
  res.type('application/xml').send(atom);
});

// Site C: Sitemap only
app.get('/site-c/robots.txt', (req, res) => {
  res.type('text/plain').send('Sitemap: http://localhost:4000/site-c/sitemap.xml');
});
app.get('/site-c/sitemap.xml', (req, res) => {
  const sm = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${articles.C.map(a => `<url><loc>${a.url}</loc><lastmod>${a.published}</lastmod></url>`).join('')}
  </urlset>`;
  res.type('application/xml').send(sm);
});

// Site D: HTML Listing Page only
app.get('/site-d', (req, res) => {
  const html = `<html><head><title>Site D News</title></head><body><h1>Site D</h1>
  <div class="articles">
  ${articles.D.map(a => `<div class="post">
    <h2><a href="${a.url}">${a.title}</a></h2>
    <time datetime="${a.published}">${a.published}</time>
  </div>`).join('')}
  </div></body></html>`;
  res.send(html);
});

// Site E: Slow site
app.get('/site-e/feed', (req, res) => {
  setTimeout(() => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0">
    <channel><title>Site E Slow</title>
    ${articles.E.map(a => `<item><title>${a.title}</title><link>${a.url}</link><pubDate>${a.published}</pubDate></item>`).join('')}
    </channel></rss>`;
    res.type('application/xml').send(rss);
  }, 5000 + Math.random() * 5000); // 5-10s delay
});

// Site F: Flaky site
app.get('/site-f/feed', (req, res) => {
  if (Math.random() < 0.5) return res.status(503).send('Service Unavailable');
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Site F Flaky</title>
  ${articles.F.map(a => `<item><title>${a.title}</title><link>${a.url}</link><pubDate>${a.published}</pubDate></item>`).join('')}</channel></rss>`;
  res.type('application/xml').send(rss);
});

// Site G: Stale cache (delays updates by ~5 mins, simulated by keeping a copy)
let cachedGFeed = '';
let lastGCacheUpdate = 0;
app.get('/site-g/feed', (req, res) => {
  const now = Date.now();
  if (now - lastGCacheUpdate > 300000 || cachedGFeed === '') { // 5 minutes cache
    cachedGFeed = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Site G Cached</title>
    ${articles.G.map(a => `<item><title>${a.title}</title><link>${a.url}</link><pubDate>${a.published}</pubDate></item>`).join('')}</channel></rss>`;
    lastGCacheUpdate = now;
  }
  res.type('application/xml').send(cachedGFeed);
});

// Site H: WP API
app.get('/site-h/wp-json/wp/v2/posts', (req, res) => {
  const posts = articles.H.map((a, i) => ({
    id: i + 1,
    date: a.published,
    title: { rendered: a.title },
    link: a.url,
    excerpt: { rendered: a.content }
  }));
  res.json(posts);
});

// Generic Article Page for all sites
app.get('/site-*/article/:id', (req, res) => {
  const siteStr = req.path.split('/')[1].split('-')[1].toUpperCase();
  const id = req.params.id;
  const article = articles[siteStr]?.find(a => a.id === id);
  if (!article) return res.status(404).send('Not found');

  const html = `<html><head>
    <title>${article.title}</title>
    <meta property="article:published_time" content="${article.published}">
    <meta name="author" content="${article.author}">
    <link rel="canonical" href="${article.url}">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"BlogPosting","headline":"${article.title}","datePublished":"${article.published}"}
    </script>
  </head><body>
    <article>
      <h1>${article.title}</h1>
      <img src="${article.image}" />
      ${article.content}
    </article>
  </body></html>`;
  res.send(html);
});

const port = process.env.DEMO_PORT || 4000;
app.listen(port, () => {
  console.log(`Demo sites server running on port ${port}`);
});
