// No Node imports here, so browser code and tests can import it (`@browse-dot-show/sites/constants`)

/**
 * Longest allowed example search (site.config.json `searchPlaceholderOptions`, and the homepage's
 * `searchInputPlaceholder`). Search inputs on a 375px-wide phone show about 20 characters; longer
 * examples are cut off there, so keep them short.
 */
export const MAX_SEARCH_EXAMPLE_LENGTH = 24;
