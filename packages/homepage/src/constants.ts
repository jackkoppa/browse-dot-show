/** Handled as '/' during deploy, and http-server during local development (see: package.json#scripts#_serve-s3-assets) */
export const S3_HOSTED_FILES_BASE_URL = import.meta.env.VITE_S3_HOSTED_FILES_BASE_URL || 'http://127.0.0.1:8080/' as const;

export const LINKS = {
  repo: 'https://github.com/jackkoppa/browse-dot-show',
  selfHost: 'https://github.com/jackkoppa/browse-dot-show/blob/main/docs/GETTING_STARTED.md',
  requestPodcast: 'https://forms.gle/A3PoU2PSBQVgb5K96',
  bluesky: 'https://bsky.app/profile/jackkoppa.dev',
  email: 'mailto:contact@browse.show',
} as const;
