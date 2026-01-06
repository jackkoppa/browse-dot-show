import { defineConfig } from 'rolldown';

export default defineConfig({
  input: './search-orchestrator.ts',
  output: {
    dir: 'aws-dist',
  },
  platform: 'node',
  resolve: {
    symlinks: true,
  },
  external: [
    // AWS SDK is provided by Lambda runtime
    '@aws-sdk/client-lambda',
  ]
});
