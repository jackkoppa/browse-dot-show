import { handler } from './search-indexed-transcripts.js';
import { log } from '@browse-dot-show/logging';

async function runTest() {
  // Example: Simulating an API Gateway GET request with new Orama parameters
  const getEvent = {
    requestContext: {
      http: {
        method: 'GET'
      }
    },
    queryStringParameters: {
      query: 'listen, fair play',
      limit: '5',
      fields: 'text',
      sortBy: 'episodePublishedUnixTimestamp',
      sortOrder: 'DESC'
    }
  };

  // Example: Simulating a POST request with new SearchRequest interface
  const postEvent = {
    requestContext: {
      http: {
        method: 'POST'
      }
    },
    body: JSON.stringify({
      query: 'goalkeeper',
      limit: 3,
      searchFields: ['text'],
      sortBy: 'episodePublishedUnixTimestamp',
      sortOrder: 'DESC',
      episodeIds: [1, 2, 3] // Example episode filtering
    })
  };

  // Example: Simulating a direct invocation with new query property
  const directEvent = {
    query: 'goalkeeper',
    limit: 2,
    searchFields: ['text'],
    sortBy: 'episodePublishedUnixTimestamp',
    sortOrder: 'ASC'
  };

  try {
    log.info('Testing with GET event (Orama):');
    const getResult = await handler(getEvent);
    log.info('GET Test Results:', JSON.stringify(getResult, null, 2));

    log.info('\nTesting with POST event (Orama):');
    const postResult = await handler(postEvent);
    log.info('POST Test Results:', JSON.stringify(postResult, null, 2));
    
    log.info('\nTesting with direct event (Orama):');
    const directResult = await handler(directEvent);
    log.info('Direct Test Results:', JSON.stringify(directResult, null, 2));

  } catch (error) {
    log.error('Local test failed:', error);
  }
}

runTest(); 