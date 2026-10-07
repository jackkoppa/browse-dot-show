# Listen Fair Play - Client

A React web interface for searching and viewing podcast transcripts.

## Quick Start

1. **Install dependencies:** `pnpm install`
2. **Start development server:** `pnpm dev`
3. **Run tests:** `pnpm test`
4. **Build for production:** `pnpm build`

From the project root, run the client for a site (with local assets and the local search lambda):
```bash
pnpm bds dev client --site=<site-id>
```

## Structure

- Search functionality uses fuzzy matching with contextual results
- Loads transcripts from assets in production or API in development

See [main README](../README.md) for complete project documentation, including how to deploy.