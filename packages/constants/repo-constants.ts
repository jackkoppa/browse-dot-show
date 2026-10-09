export const CLIENT_PORT_NUMBER = 5137;

/**
 * Base URL of the shared subscriber auth API (`terraform output auth_api_url` in terraform/auth).
 * Empty until it's deployed; sites with subscriberAccess hide the feature without it.
 * VITE_SUBSCRIBER_AUTH_API_URL overrides it (e.g. http://localhost:3002 for the local dev server).
 */
export const SUBSCRIBER_AUTH_API_URL = '';
