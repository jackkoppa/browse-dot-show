/** Handled as '/' during deploy, and http-server during local development (see: package.json#scripts#_serve-s3-assets) */
export const S3_HOSTED_FILES_BASE_URL = import.meta.env.VITE_S3_HOSTED_FILES_BASE_URL || 'http://127.0.0.1:8080/' as const;

/** The site's search API (the public search, and the subscriber API at `/subscriber`); localhost in development */
export const SEARCH_API_BASE_URL: string = import.meta.env.VITE_SEARCH_API_URL || 'http://localhost:3001';
