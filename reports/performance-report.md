
# Performance Benchmark Report

## Method Comparison
| Method | Checks | Avg Duration | Success Rate |
|---|---|---|---|
| page | 56 | 5.5ms | 0.0% |

## Detection Delays by Method
| Method | Detections | Avg Delay | Min Delay | Max Delay |
|---|---|---|---|---|


## Limitations
- CDN/Feed caching can artificially inflate delays (see Site G).
- Sitemap polling is efficient but typically updates slower than RSS.
- Page polling requires downloading full HTML and is prone to breakage.
- Near-real-time is only guaranteed with push mechanisms (WebSub) or very frequent polling (which risks rate-limiting).
  