// src/server/api.ts - REST API routes
import { Router, Request, Response } from 'express';
import { competitorRepo, articleRepo, checkRepo, notificationRepo, settingsRepo } from '../db/repositories.js';
import { analyzeWebsite } from '../analysis/analyzer.js';
import { engine } from '../worker/engine.js';
import { formatDelay } from '../utils/time.js';
import { getLogger } from '../logger.js';
import { sseManager } from '../notifications/sse.js';

const log = getLogger('api');
export const apiRouter = Router();

// ─── Competitors ─────────────────────────────────────────

apiRouter.get('/competitors', (req: Request, res: Response) => {
  const competitors = competitorRepo.findAll();
  res.json(competitors);
});

apiRouter.get('/competitors/:id', (req: Request, res: Response) => {
  const competitor = competitorRepo.findById(parseInt(req.params.id));
  if (!competitor) return res.status(404).json({ error: 'Not found' });
  res.json(competitor);
});

apiRouter.post('/competitors', async (req: Request, res: Response) => {
  try {
    const { name, website_url, blog_url, feed_url, sitemap_url } = req.body;
    if (!name || !website_url) {
      return res.status(400).json({ error: 'name and website_url are required' });
    }

    // Ensure URL has protocol
    let url = website_url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const competitor = competitorRepo.create({ name, website_url: url, blog_url, feed_url, sitemap_url });

    // Auto-analyze in background
    analyzeWebsite(competitor.id, url).catch(err => {
      log.error({ err: err.message, competitorId: competitor.id }, 'Auto-analysis failed');
      competitorRepo.update(competitor.id, { monitoring_status: 'degraded' });
    });

    res.status(201).json(competitor);
  } catch (err: any) {
    log.error({ err: err.message }, 'Create competitor error');
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/competitors/:id', (req: Request, res: Response) => {
  const updated = competitorRepo.update(parseInt(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

apiRouter.delete('/competitors/:id', (req: Request, res: Response) => {
  const deleted = competitorRepo.delete(parseInt(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

apiRouter.post('/competitors/:id/toggle', (req: Request, res: Response) => {
  const competitor = competitorRepo.findById(parseInt(req.params.id));
  if (!competitor) return res.status(404).json({ error: 'Not found' });
  competitorRepo.setEnabled(competitor.id, !competitor.enabled);
  res.json({ enabled: !competitor.enabled });
});

apiRouter.post('/competitors/:id/reanalyze', async (req: Request, res: Response) => {
  const competitor = competitorRepo.findById(parseInt(req.params.id));
  if (!competitor) return res.status(404).json({ error: 'Not found' });

  try {
    const profile = await analyzeWebsite(competitor.id, competitor.website_url);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/competitors/bulk-import', async (req: Request, res: Response) => {
  const { competitors } = req.body;
  if (!Array.isArray(competitors)) return res.status(400).json({ error: 'competitors array required' });

  const results = [];
  for (const c of competitors) {
    try {
      let url = c.website_url || c.url;
      if (!url) continue;
      if (!url.startsWith('http')) url = 'https://' + url;
      const created = competitorRepo.create({ name: c.name || new URL(url).hostname, website_url: url });
      analyzeWebsite(created.id, url).catch(() => {});
      results.push({ id: created.id, name: created.name, status: 'created' });
    } catch (err: any) {
      results.push({ name: c.name, status: 'error', error: err.message });
    }
  }
  res.json({ results });
});

// ─── Articles ─────────────────────────────────────────

apiRouter.get('/articles', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const filters: any = {};
  if (req.query.competitor_id) filters.competitorId = parseInt(req.query.competitor_id as string);
  if (req.query.method) filters.method = req.query.method;
  if (req.query.over_5min === 'true') filters.overFiveMin = true;
  if (req.query.status) filters.status = req.query.status;

  const articles = articleRepo.findRecent(limit, offset, filters);
  // Add formatted delay
  const enriched = articles.map(a => ({
    ...a,
    delay_formatted: formatDelay(a.detection_delay_ms),
    competitor_name: competitorRepo.findById(a.competitor_id)?.name || 'Unknown',
  }));
  res.json(enriched);
});

apiRouter.get('/articles/:id', (req: Request, res: Response) => {
  const article = articleRepo.findById(parseInt(req.params.id));
  if (!article) return res.status(404).json({ error: 'Not found' });
  const competitor = competitorRepo.findById(article.competitor_id);
  res.json({
    ...article,
    delay_formatted: formatDelay(article.detection_delay_ms),
    competitor_name: competitor?.name || 'Unknown',
  });
});

// ─── Checks ─────────────────────────────────────────

apiRouter.get('/checks', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const filters: any = {};
  if (req.query.competitor_id) filters.competitorId = parseInt(req.query.competitor_id as string);
  if (req.query.result) filters.result = req.query.result;

  const checks = checkRepo.findRecent(limit, offset, filters);
  const enriched = checks.map(c => ({
    ...c,
    competitor_name: competitorRepo.findById(c.competitor_id)?.name || 'Unknown',
  }));
  res.json(enriched);
});

// ─── Notifications ─────────────────────────────────────────

apiRouter.get('/notifications', (req: Request, res: Response) => {
  const unreadOnly = req.query.unread === 'true';
  const notifications = notificationRepo.findRecent(50, unreadOnly);
  res.json(notifications);
});

apiRouter.get('/notifications/count', (req: Request, res: Response) => {
  res.json({ unread: notificationRepo.countUnread() });
});

apiRouter.post('/notifications/:id/read', (req: Request, res: Response) => {
  notificationRepo.markRead(parseInt(req.params.id));
  res.json({ success: true });
});

apiRouter.post('/notifications/read-all', (req: Request, res: Response) => {
  notificationRepo.markAllRead();
  res.json({ success: true });
});

// ─── Dashboard Stats ─────────────────────────────────────────

apiRouter.get('/stats/overview', (req: Request, res: Response) => {
  const statusCounts = competitorRepo.countByStatus();
  const totalCompetitors = competitorRepo.count();
  const totalArticles = articleRepo.countTotal();
  const delayStats = articleRepo.getDelayStats();
  const checkStats = checkRepo.countLast24h();
  const engineStats = engine.getStats();

  res.json({
    competitors: {
      total: totalCompetitors,
      ...statusCounts,
    },
    articles: {
      total: totalArticles,
      avgDelay: delayStats.avg,
      minDelay: delayStats.min,
      maxDelay: delayStats.max,
      within5min: delayStats.within5min,
      totalWithDelay: delayStats.total,
      within5minPct: delayStats.total > 0 ? Math.round(delayStats.within5min / delayStats.total * 100) : 0,
      avgDelayFormatted: formatDelay(delayStats.avg),
      minDelayFormatted: formatDelay(delayStats.min),
      maxDelayFormatted: formatDelay(delayStats.max),
    },
    checks: {
      ...checkStats,
      checksPerMinute: engineStats.checksPerMinute,
    },
    engine: engineStats,
  });
});

apiRouter.get('/stats/methods', (req: Request, res: Response) => {
  const articleStats = articleRepo.getMethodStats();
  const checkPerf = checkRepo.getMethodPerformance();
  res.json({ articleStats, checkPerformance: checkPerf });
});

// ─── Settings ─────────────────────────────────────────

apiRouter.get('/settings', (req: Request, res: Response) => {
  res.json(settingsRepo.getAll());
});

apiRouter.post('/settings', (req: Request, res: Response) => {
  for (const [key, value] of Object.entries(req.body)) {
    settingsRepo.set(key, String(value));
  }
  res.json({ success: true });
});

// ─── SSE ─────────────────────────────────────────

apiRouter.get('/events', (req: Request, res: Response) => {
  sseManager.addClient(res);
});

// ─── Engine control ─────────────────────────────────────────

apiRouter.post('/engine/start', (req: Request, res: Response) => {
  engine.start();
  res.json({ status: 'started' });
});

apiRouter.post('/engine/stop', (req: Request, res: Response) => {
  engine.stop();
  res.json({ status: 'stopped' });
});

apiRouter.get('/engine/stats', (req: Request, res: Response) => {
  res.json(engine.getStats());
});
