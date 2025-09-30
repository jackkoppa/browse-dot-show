// TODO: Implement a dev server for the search index 
// Used as a local process, to test the client against 
// (rather than the client making requests to AWS Lambda)

import * as http from 'http';
import { URL } from 'url';
import { handler as searchHandler } from './search-indexed-transcripts.ts';
import { log } from '@browse-dot-show/logging';

const PORT = process.env.SEARCH_DEV_SERVER_PORT || 3001;

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const parsedUrl = new URL(url || '', `http://${req.headers.host}`);
  log.info(`[Dev Server] Received ${method} request for ${parsedUrl.pathname}`);

  // Basic CORS headers - adjust as necessary for your client's needs
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allows all origins
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204); // No Content for preflight requests
    res.end();
    return;
  }

  // Health check endpoint
  if (parsedUrl.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  let event: any = {};

  try {
    if (method === 'GET') {
      // Use API Gateway v2 format to match Lambda handler expectations
      event.requestContext = {
        http: {
          method: 'GET'
        }
      };
      
      const queryStringParameters: any = {};
      parsedUrl.searchParams.forEach((value, key) => {
        queryStringParameters[key] = value;
      });
      event.queryStringParameters = queryStringParameters;

    } else if (method === 'POST') {
      // Use API Gateway v2 format to match Lambda handler expectations
      event.requestContext = {
        http: {
          method: 'POST'
        }
      };
      
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      try {
        event.body = body; // Keep as string, Lambda handler will parse it
      } catch (e) {
        log.error('[Dev Server] Invalid JSON body:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Method ${method} Not Allowed` }));
      return;
    }

    log.debug('[Dev Server] Constructed event for handler:', JSON.stringify(event));
    const result = await searchHandler(event);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    log.info(`[Dev Server] Successfully processed ${method} request for ${parsedUrl.pathname}`);

  } catch (error: any) {
    log.error('[Dev Server] Error processing request:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        message: 'Error processing search request in dev server',
        error: error.message,
        stack: error.stack
    }));
  }
});

server.listen(PORT, () => {
  log.info(`[Dev Server] Search development server running on http://localhost:${PORT}`);
  log.info(`[Dev Server] Client can make requests to this server instead of AWS Lambda for local development.`);
  log.info(`[Dev Server] Example GET: http://localhost:${PORT}?query=yoursearchterm&limit=5`);
  log.info(`[Dev Server] Example POST: curl -X POST -H "Content-Type: application/json" -d '{"query":"yoursearchterm", "limit":5}' http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log.info('[Dev Server] Shutting down server...');
  server.close(() => {
    log.info('[Dev Server] Server shut down.');
    process.exit(0);
  });
});