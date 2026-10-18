import { defineConfig } from 'rolldown';

export default defineConfig({
  input: './auth-lambda.ts',
  output: {
    dir: 'aws-dist',
  },
  platform: 'node',
  resolve: {
    symlinks: true,
  },
});
