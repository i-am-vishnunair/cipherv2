// src/worker/engine.ts - Monitoring engine: scheduler, concurrency control, circuit breaker
import { getStrategy } from '../strategies/index.js';
import { competitorRepo, articleRepo, checkRepo, notificationRepo, CompetitorRow } from '../db/repositories.js';
import { normalizeUrl } from '../utils/url.js';
import { nowISO, calcDelayMs, classifyDelay, addJitter } from '../utils/time.js';
import { captureArticleContent } from '../capture/content.js';
import { sseManager } from '../notifications/sse.js';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import { saveDb } from '../db/database.js';

const log = getLogger('engine');

interface EngineStats {
  running: boolean;
  activeChecks: number;
  queueDepth: number;
  checksPerMinute: number;
  cycleNumber: number;
  perHostActive: Record<string, number>;
}

export class MonitoringEngine {
  private running = false;
  private activeChecks = 0;
  private perHostActive: Map<string, number> = new Map();
  private cycleNumber = 0;
  private checkCounts: number[] = []; // timestamps of recent checks for rate calculation
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private config = getConfig();

  getStats(): EngineStats {
    return {
      running: this.running,
      activeChecks: this.activeChecks,
      queueDepth: this.getQueueDepth(),
      checksPerMinute: this.getChecksPerMinute(),
      cycleNumber: this.cycleNumber,
      perHostActive: Object.fromEntries(this.perHostActive),
    };
  }

  private getQueueDepth(): number {
    const now = new Date().toISOString();
    try {
      const competitors = competitorRepo.findEnabled();
      return competitors.filter(c => !c.next_check_at || c.next_check_at <= now).length;
    } catch {
      return 0;
    }
  }

  private getChecksPerMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    this.checkCounts = this.checkCounts.filter(t => t > oneMinuteAgo);
    return this.checkCounts.length;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    log.info('Monitoring engine started');
    this.scheduleLoop();
  }

  stop(): void {
    this.running = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    log.info('Monitoring engine stopped');
  }

  private scheduleLoop(): void {
    if (!this.running) return;
    this.loopTimer = setTimeout(() => this.loop(), 1000);
  }

  private async loop(): Promise<void> {
    if (!this.running) return;

    try {
      const now = new Date().toISOString();
      const competitors = competitorRepo.findEnabled();

      // Find competitors due for check
      const dueForCheck = competitors.filter(c => {
        if (!c.next_check_at) return true;
        return c.next_check_at <= now;
      });

      // Sort by next_check_at (oldest first = most overdue)
      dueForCheck.sort((a, b) => {
        const aTime = a.next_check_at || '1970-01-01';
        const bTime = b.next_check_at || '1970-01-01';
        return aTime.localeCompare(bTime);
      });

      // Launch checks respecting concurrency limits
      for (const competitor of dueForCheck) {
        if (this.activeChecks >= this.config.monitoring.globalConcurrency) break;

        // Circuit breaker: skip if in cooldown
        if (competitor.circuit_breaker_until && competitor.circuit_breaker_until > now) {
          continue;
        }

        // Per-host concurrency limit
        const hostname = new URL(competitor.website_url).hostname;
        const hostActive = this.perHostActive.get(hostname) || 0;
        if (hostActive >= this.config.monitoring.perHostConcurrency) continue;

        // Launch check (fire and forget)
        this.activeChecks++;
        this.perHostActive.set(hostname, hostActive + 1);
        this.runCheck(competitor, hostname).finally(() => {
          this.activeChecks--;
          const current = this.perHostActive.get(hostname) || 1;
          if (current <= 1) this.perHostActive.delete(hostname);
          else this.perHostActive.set(hostname, current - 1);
        });
      }
    } catch (err: any) {
      log.error({ err: err.message }, 'Engine loop error');
    }

    this.scheduleLoop();
  }

  private async runCheck(competitor: CompetitorRow, hostname: string): Promise<void> {
    this.cycleNumber++;
    const cycle = this.cycleNumber;
    const startedAt = nowISO();
    const startMs = Date.now();

    // Determine which strategies to run
    let profile: any = null;
    try {
      if (competitor.monitoring_profile) profile = JSON.parse(competitor.monitoring_profile);
    } catch {}

    const primaryStrategy = profile?.primary || (competitor.feed_url ? 'rss' : competitor.sitemap_url ? 'sitemap' : 'page');
    const strategies = [primaryStrategy];
    if (profile?.secondary && profile.secondary !== primaryStrategy) {
      strategies.push(profile.secondary);
    }
    // Always include page as fallback if not already
    if (!strategies.includes('page') && (competitor.blog_url || competitor.website_url)) {
      strategies.push('page');
    }

    let totalNewItems = 0;
    let totalItems = 0;
    let bestResult = 'success';
    let lastError: string | undefined;

    for (const strategyName of strategies) {
      const strategy = getStrategy(strategyName);
      if (!strategy) continue;

      try {
        const result = await strategy.check(competitor);
        const endedAt = nowISO();
        const durationMs = Date.now() - startMs;

        let checkResult = 'success';
        if (result.error) {
          if (result.error.includes('Timeout')) checkResult = 'timeout';
          else if (result.httpStatus && result.httpStatus >= 400) checkResult = 'error';
          else checkResult = 'error';
          lastError = result.error;
        }
        if (result.notModified) checkResult = 'not_modified';

        const newItems = await this.processDiscoveredItems(competitor, result.discoveredItems || [], strategyName, cycle);
        totalNewItems += newItems;
        totalItems += (result.discoveredItems || []).length;

        // Record check
        checkRepo.insert({
          competitor_id: competitor.id,
          strategy: strategyName,
          started_at: startedAt,
          ended_at: endedAt,
          duration_ms: durationMs,
          http_status: result.httpStatus ?? null,
          response_bytes: result.responseBytes ?? null,
          result: checkResult,
          items_found: (result.discoveredItems || []).length,
          new_items: newItems,
          error_message: result.error || null,
          cycle_number: cycle,
        });

        this.checkCounts.push(Date.now());

        // Update etag/lastModified if provided
        if (result.etag || result.lastModified) {
          competitorRepo.update(competitor.id, {
            etag: result.etag || competitor.etag,
            last_modified: result.lastModified || competitor.last_modified,
          });
        }

        if (checkResult === 'error' || checkResult === 'timeout') {
          bestResult = checkResult;
        }
      } catch (err: any) {
        log.error({ err: err.message, competitor: competitor.name, strategy: strategyName }, 'Strategy check error');
        lastError = err.message;
        bestResult = 'error';
      }
    }

    // Update competitor status
    const updates: Record<string, any> = {
      last_checked_at: nowISO(),
    };

    if (bestResult === 'success' || bestResult === 'not_modified') {
      updates.consecutive_failures = 0;
      updates.monitoring_status = 'online';
      if (totalNewItems > 0) {
        updates.last_successful_detection_at = nowISO();
      }
    } else {
      const failures = (competitor.consecutive_failures || 0) + 1;
      updates.consecutive_failures = failures;

      // Circuit breaker
      if (failures >= this.config.monitoring.circuitBreakerThreshold) {
        updates.monitoring_status = 'offline';
        updates.circuit_breaker_until = new Date(
          Date.now() + this.config.monitoring.circuitBreakerRecoveryMs
        ).toISOString();
        log.warn({ competitor: competitor.name, failures }, 'Circuit breaker tripped');

        notificationRepo.create({
          type: 'competitor_offline',
          competitor_id: competitor.id,
          title: `${competitor.name} went offline`,
          message: `After ${failures} consecutive failures. Last error: ${lastError}`,
        });
      } else if (failures >= 2) {
        updates.monitoring_status = 'degraded';
      }
    }

    // Calculate next check time with adaptive polling + jitter
    const baseInterval = competitor.poll_interval_ms || this.config.monitoring.defaultPollIntervalMs;
    let nextInterval = baseInterval;

    // Backoff for failures
    if ((updates.consecutive_failures || 0) > 0) {
      nextInterval = Math.min(
        this.config.monitoring.maxPollIntervalMs,
        baseInterval * Math.pow(1.5, updates.consecutive_failures)
      );
    }

    // Add jitter (±20%)
    nextInterval = addJitter(nextInterval);
    nextInterval = Math.max(this.config.monitoring.minPollIntervalMs, nextInterval);

    updates.next_check_at = new Date(Date.now() + nextInterval).toISOString();

    competitorRepo.update(competitor.id, updates);
  }

  private async processDiscoveredItems(
    competitor: CompetitorRow,
    items: any[],
    method: string,
    cycle: number
  ): Promise<number> {
    let newCount = 0;
    const discoveredAt = nowISO();
    const isBaselining = !competitor.is_baseline_complete;

    for (const item of items) {
      if (!item.url) continue;

      const normalized = normalizeUrl(item.url, competitor.website_url);
      const delayMs = calcDelayMs(item.publishedAt, discoveredAt);
      const { flag, reason } = classifyDelay(delayMs);

      const { article, isNew } = articleRepo.insertOrIgnore({
        competitor_id: competitor.id,
        url: item.url,
        normalized_url: normalized,
        title: item.title,
        author: item.author,
        published_at: item.publishedAt,
        published_at_source: item.publishedAtSource,
        modified_at: item.modifiedAt,
        first_discovered_at: discoveredAt,
        detection_delay_ms: isBaselining ? undefined : (delayMs ?? undefined),
        detection_method: method,
        detection_check_id: cycle,
        status: isBaselining ? 'baseline' : 'new',
        delay_flag: isBaselining ? undefined : flag,
        delay_reason: isBaselining ? undefined : (reason ?? undefined),
        categories: item.categories ? JSON.stringify(item.categories) : undefined,
        tags: item.tags ? JSON.stringify(item.tags) : undefined,
        featured_image: item.featuredImage,
      });

      if (isNew && !isBaselining) {
        newCount++;

        // Create notification
        const notification = notificationRepo.create({
          type: 'new_article',
          competitor_id: competitor.id,
          article_id: article.id,
          title: `New article from ${competitor.name}`,
          message: `"${item.title || 'Untitled'}" detected via ${method} | Delay: ${delayMs !== null ? Math.round(delayMs / 1000) + 's' : 'N/A'}`,
        });

        // Broadcast via SSE
        sseManager.broadcast('new_article', {
          article: {
            id: article.id,
            competitorName: competitor.name,
            title: item.title,
            url: item.url,
            publishedAt: item.publishedAt,
            discoveredAt,
            delayMs,
            delayFormatted: delayMs !== null ? `${Math.round(delayMs / 1000)}s` : 'N/A',
            method,
            delayFlag: flag,
          },
          notification,
        });

        // Attempt content capture in background (don't block)
        this.captureContent(article.id, item.url).catch(err => {
          log.warn({ err: err.message, articleId: article.id }, 'Content capture failed');
        });

        log.info({
          competitor: competitor.name,
          title: item.title,
          method,
          delayMs,
        }, 'New article detected');
      } else if (!isNew) {
        // Already seen - record as "also seen by"
        articleRepo.addAlsoSeenBy(article.id, method);
      }
    }

    // Mark baseline complete after first successful check with items
    if (isBaselining && items.length > 0) {
      competitorRepo.update(competitor.id, { is_baseline_complete: 1 });
      log.info({ competitor: competitor.name, baselineItems: items.length }, 'Baseline complete');
    }

    return newCount;
  }

  private async captureContent(articleId: number, url: string): Promise<void> {
    try {
      const content = await captureArticleContent(url);
      articleRepo.updateContent(articleId, {
        status: 'captured',
        body_html: content.bodyHtml,
        body_text: content.bodyText,
        summary: content.summary,
        featured_image: content.featuredImage,
        inline_images: content.inlineImages.length > 0 ? JSON.stringify(content.inlineImages) : null,
        author: content.author,
        categories: content.categories.length > 0 ? JSON.stringify(content.categories) : null,
        tags: content.tags.length > 0 ? JSON.stringify(content.tags) : null,
        meta_description: content.metaDescription,
        language: content.language,
        word_count: content.wordCount,
        jsonld_raw: content.jsonldRaw,
        opengraph_raw: content.opengraphRaw,
        outbound_links: content.outboundLinks.length > 0 ? JSON.stringify(content.outboundLinks) : null,
        canonical_url: content.canonicalUrl,
        // Update publish time if we got a better source
        ...(content.publishedAt && content.publishedAtSource ? {
          published_at: content.publishedAt,
          published_at_source: content.publishedAtSource,
        } : {}),
      });
    } catch (err: any) {
      articleRepo.updateContent(articleId, { status: 'failed_capture' });
      throw err;
    }
  }
}

export const engine = new MonitoringEngine();
