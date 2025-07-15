import { defineConfig } from 'rolldown';

export default defineConfig({
  input: './convert-srts-indexed-search.ts',
  output: {
    dir: 'aws-dist',
  },
  platform: 'node',
  resolve: {
    symlinks: true,
  },
  external: [
    '@aws-sdk/client-lambda', // provided by AWS runtime
    '@mongodb-js/zstd', // requires native bindings, so handled via /terraform/sites/lambda-layers
    'msgpackr', // requires native bindings, so handled via /terraform/sites/lambda-layers
    // Orama dependencies are bundled with the Lambda function
  ]
});