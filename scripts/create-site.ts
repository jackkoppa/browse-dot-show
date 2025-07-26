#!/usr/bin/env tsx

// This file is now a simple entry point to the modular site creator
import { main } from './site-creator/main.js';

// Run the site creator
main().catch((error) => {
  console.error('An error occurred during site creation:');
  console.error(error);
  process.exit(1);
});