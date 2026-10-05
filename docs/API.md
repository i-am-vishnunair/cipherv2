# REST API

## Competitors
- `GET /api/competitors`: List all competitors
- `GET /api/competitors/:id`: Get competitor details
- `POST /api/competitors`: Add new competitor (auto-analyzes)
- `PUT /api/competitors/:id`: Update competitor
- `DELETE /api/competitors/:id`: Delete competitor
- `POST /api/competitors/:id/toggle`: Enable/disable monitoring
- `POST /api/competitors/:id/reanalyze`: Trigger re-analysis

## Articles
- `GET /api/articles`: List detected articles (filters: `method`, `over_5min`)
- `GET /api/articles/:id`: Get article details

## Checks
- `GET /api/checks`: List monitoring checks

## Stats & Engine
- `GET /api/stats/overview`: KPI data
- `GET /api/stats/methods`: Performance comparison data
- `POST /api/engine/start`: Start worker
- `POST /api/engine/stop`: Stop worker

## SSE
- `GET /api/events`: Connect for Server-Sent Events (`new_article` events)
