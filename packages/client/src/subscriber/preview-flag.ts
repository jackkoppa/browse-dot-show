/**
 * The subscriber feature flag, for testing on prod before a site's subscriber access is live:
 * `?subscriberPreview=1` turns it on for this browser (remembered), `?subscriberPreview=0` off.
 */

const STORAGE_KEY = 'bds:subscriber-preview';
export const PREVIEW_QUERY_PARAM = 'subscriberPreview';

export function readSubscriberPreviewFlag(search: string = window.location.search): boolean {
  const param = new URLSearchParams(search).get(PREVIEW_QUERY_PARAM);
  try {
    if (param === '1') localStorage.setItem(STORAGE_KEY, '1');
    if (param === '0') localStorage.removeItem(STORAGE_KEY);
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage blocked: the query param alone decides, for this page load
    return param === '1';
  }
}
