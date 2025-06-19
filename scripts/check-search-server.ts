import http from 'http';
import { spawn } from 'child_process';

const searchServerUrl = 'http://localhost:3001/api/health'; // Health check endpoint

const checkServer = (): void => {
  http.get(searchServerUrl, (res) => {
    if (res.statusCode === 200) {
      console.log('Search dev server is running. Starting client...');
      // If server is up, run the client dev server
      const clientDevProcess = spawn('pnpm', ['--filter', 'client', 'dev'], { stdio: 'inherit' });
      clientDevProcess.on('error', (err) => {
        console.error('Failed to start client dev server:', err);
        process.exit(1);
      });
    } else {
      console.error(`Search dev server at ${searchServerUrl} responded with status ${res.statusCode}. Please ensure it's running correctly and accessible, then try again. You may need to run \`pnpm search-lambda:dev:local\` first.`);
      process.exit(1);
    }
  }).on('error', (err) => {
    console.error(`Search dev server not running or unreachable at ${searchServerUrl}. Please run \`search-lambda:dev:local\` in a separate terminal. Error: ${err.message}`);
    process.exit(1);
  });
};

checkServer(); 