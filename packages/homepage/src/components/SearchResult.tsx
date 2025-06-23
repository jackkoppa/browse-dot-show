import React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiSearchResultHit, EpisodeInManifest } from '@browse-dot-show/types'; // Import the new type
import {
  Card,
  CardContent,
  CardFooter,
} from "@browse-dot-show/ui;
import { Badge } from "@browse-dot-show/ui;

import { formatDate } from '@/utils/date';
import { formatMillisecondsToMMSS } from '@/utils/time';
import HighlightedText from './HighlightedText';
import { trackEvent } from '@/utils/goatcounter';

export interface SearchResultProps {
  result: ApiSearchResultHit;
  episodeData?: EpisodeInManifest;
  isManifestLoading: boolean;
  showManifestError: boolean;
}

const SearchResult: React.FC<SearchResultProps> = ({ result, episodeData, isManifestLoading, showManifestError }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const formattedStartTime = formatMillisecondsToMMSS(result.startTimeMs);
  const formattedEndTime = formatMillisecondsToMMSS(result.endTimeMs);
  const formattedDate = episodeData?.publishedAt ? formatDate(episodeData.publishedAt) : null;

  const handleLoadHere = () => {
    if (!episodeData) return;

    // Preserve all current search query parameters
    const currentParams = new URLSearchParams(searchParams);

    // Add episode-specific parameters
    currentParams.set('start', result.startTimeMs.toString());

    // Navigate to episode route with all parameters
    const queryString = currentParams.toString();

    trackEvent({
      eventType: 'Result Clicked',
    });

    navigate(`/episode/${episodeData.sequentialId}${queryString ? `?${queryString}` : ''}`);
  };

  // Determine what to show in the footer
  const showEpisodeMetadata = Boolean(episodeData);
  const showSkeletonLoaders = !episodeData && isManifestLoading && !showManifestError;
  const shouldBeClickable = Boolean(episodeData);

  return (
    <Card 
      className={`mb-4 border-foreground border-2 gap-2 ${shouldBeClickable ? 'cursor-pointer hover:bg-muted dark:hover:bg-dark-mode-muted-highlight' : ''}`}
      onClick={shouldBeClickable ? handleLoadHere : undefined}
    >
      <CardContent>
        <HighlightedText className="text-sm" text={result.text} searchStringToHighlight={searchParams.get('q') || ''} />
      </CardContent>
      <CardFooter className="block">
        {showEpisodeMetadata && (
          <>
            <div className="flex flex-col mt-2">
              <div className="flex items-center gap-2">
                {formattedDate && <Badge variant="destructive" className="mr-2">{formattedDate}</Badge>}
                <Badge variant="outline">{formattedStartTime} - {formattedEndTime}</Badge>
              </div>
              <div className="text-xs text-muted-foreground w-full block mt-2 italic">{episodeData?.title || `Episode ${result.sequentialEpisodeIdAsString}`}</div>
            </div>
          </>
        )}
        {showSkeletonLoaders && (
          <>
            <div className="flex flex-col mt-2">
              {/* Badges row skeleton */}
              <div className="flex items-center gap-2">
                <div className="h-4 w-20 bg-gray-200 animate-pulse rounded-md mr-2"></div> {/* Date badge skeleton */}
                <div className="h-4 w-18 bg-gray-200 animate-pulse rounded-md"></div> {/* Time range badge skeleton */}
              </div>
              {/* Episode title skeleton */}
              <div className="h-2 w-4/5 bg-gray-200 animate-pulse rounded mt-2"></div> {/* Episode title skeleton (text-xs height) */}
            </div>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default SearchResult; 