/**
 * for `fileKey` values, used in `fetch()`, we should always URL encode them - in case they have `+`, or other special characters that woudld break fetching
 */
export function encodeFileKey(fileKey: string) {
    if (!fileKey) {
        return '';
    }

    return encodeURIComponent(fileKey);
}