import { defineConfig } from 'rolldown';

export default defineConfig({
  input: './search-indexed-transcripts.ts',
  output: {
    dir: 'aws-dist',
  },
  platform: 'node',
  resolve: {
    symlinks: true,
  },
  external: [
    '@mongodb-js/zstd', // requires native bindings, so handled via /terraform/sites/lambda-layers
    'msgpackr', // requires native bindings, so handled via /terraform/sites/lambda-layers
    // Orama dependencies are bundled with the Lambda function
  ]
});