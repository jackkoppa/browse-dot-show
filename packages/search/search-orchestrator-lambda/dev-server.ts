/**
 * Local development server for testing the search orchestrator Lambda
 * 
 * Usage:
 *   pnpm dev:local
 * 
 * Then test with:
 *   curl "http://localhost:3001/search?query=test&limit=5"
 */

import { handler } from './search-orchestrator.js';
import { log } from '@browse-dot-show/logging';

// Set log level for local development
process.env.LOG_LEVEL = 'debug';

// Mock environment variables for local testing
if (!process.env.SHARD_LAMBDA_ARNS) {
  console.warn('SHARD_LAMBDA_ARNS not set. Using mock values for local testing.');
  // In local dev, you would set actual Lambda ARNs or use mock functions
  process.env.SHARD_LAMBDA_ARNS = JSON.stringify([
    'arn:aws:lambda:us-east-1:123456789012:function:search-api-test-site-shard-1',
    'arn:aws:lambda:us-east-1:123456789012:function:search-api-test-site-shard-2'
  ]);
}

if (!process.env.SITE_ID) {
  process.env.SITE_ID = 'test-site';
}

if (!process.env.FILE_STORAGE_ENV) {
  process.env.FILE_STORAGE_ENV = 'local';
}

// Simple HTTP server for local testing
const http = require('http');
const url = require('url');

const PORT = 3001;

const server = http.createServer(async (req: any, res: any) => {
  // Enable CORS for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/search') {
    try {
      let event: any;

      if (req.method === 'GET') {
        // Simulate API Gateway v2 GET request
        event = {
          requestContext: {
            http: {
              method: 'GET'
            }
          },
          queryStringParameters: parsedUrl.query
        };
      } else if (req.method === 'POST') {
        // Read POST body
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });

        await new Promise(resolve => req.on('end', resolve));

        // Simulate API Gateway v2 POST request
        event = {
          requestContext: {
            http: {
              method: 'POST'
            }
          },
          body: body
        };
      } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      const result = await handler(event);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
    } catch (error: any) {
      log.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message 
      }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  log.info(`Search orchestrator dev server listening on http://localhost:${PORT}`);
  log.info('Test with: curl "http://localhost:3001/search?query=test&limit=5"');
  log.info('Health check: curl "http://localhost:3001/search?isHealthCheckOnly=true"');
});
