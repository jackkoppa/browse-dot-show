# Local Files Storage

This directory stores local files that mirror AWS resources for development (primarily S3 content). During local development, these resources are retrieved from this directory _instead of_ AWS.

## 🔧 Configuration

The location of local files is configurable via `.local-files-config.json` in the project root.

**Default**: Files are stored in `aws-local-dev/` relative to the project root.

**Custom**: Run `pnpm bds setup machine --local-files=<path>`, or create `.local-files-config.json` yourself:
```json
{
  "localFilesPath": "/Volumes/ExternalSSD/browse-dot-show-local-files"
}
```

This is useful for:
- Storing large files on external drives
- Using faster SSDs for processing
- Keeping development files separate from source code

## 📁 Directory Structure

```
[local-files-path]/
├── s3/
│   ├── sites/
│   │   └── [site-id]/
│   │       ├── rss/           # RSS feeds
│   │       ├── audio/         # .mp3 files
│   │       ├── transcripts/   # .srt files
│   │       ├── search-index/  # Search database
│   │       └── search-entries/ # Search data
│   └── [legacy files]
```

Each site's files are organized under `s3/sites/[site-id]/` for isolation and scalability.

## 💡 Usage in Code

The configuration is handled automatically by the `@browse-dot-show/config` package:

```typescript
import { getLocalS3SitePath } from '@browse-dot-show/config';

// Get site-specific path
const audioDir = getLocalS3SitePath('my-site', 'audio');
// Returns: [local-files-path]/s3/sites/my-site/audio
```
