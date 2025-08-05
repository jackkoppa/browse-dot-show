export type SortOption = 'relevance' | 'newest' | 'oldest';

export interface Site {
    id: string
    displayName: string
    domain: string
    podcastTagline: string
    imageUrl: string
    searchInputPlaceholder: string
}