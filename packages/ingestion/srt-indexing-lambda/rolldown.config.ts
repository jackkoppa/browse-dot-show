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
    // Orama dependencies will be bundled with the Lambda function
  ]
});