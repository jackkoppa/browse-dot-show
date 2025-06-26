This package contains the AWS Lambda function responsible for searching indexed podcast transcripts.

## How it Works

The Lambda function (`search/lambdas/search-indexed-transcripts.ts`) uses FlexSearch to perform searches. On cold starts, it loads a pre-built FlexSearch index from an S3 bucket. The index generation process is detailed in `/processing/convert-srts-indexed-search.ts`.

The Lambda can be invoked via API Gateway (handling GET requests with query parameters) or directly (handling POST requests with a JSON body or an event object with a `query` property).
