import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import fs from 'fs'
import path from 'path'
import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { log } from './src/utils/logging';

// Import site loading utilities - using relative path for monorepo
import { getSiteById } from '../../sites/dist/index.js';

// Function to load site configuration and create environment variables
function loadSiteConfig() {
  const siteId = process.env.SELECTED_SITE_ID || process.env.SITE_ID;
  
  if (!siteId) {
    throw new Error('SELECTED_SITE_ID or SITE_ID environment variable is required for building');
  }

  const siteConfig = getSiteById(siteId);
  if (!siteConfig) {
    throw new Error(`Site configuration not found for site ID: ${siteId}`);
  }

  // Transform podcast links for client consumption
  const podcastLinks: Record<string, { title: string; url: string; status: 'active' | 'inactive' }> = {};
  
  siteConfig.includedPodcasts.forEach(podcast => {
    podcastLinks[podcast.id] = {
      title: podcast.title,
      url: podcast.url,
      status: podcast.status
    };
  });

  return {
    VITE_SITE_ID: siteConfig.id,
    VITE_SITE_DOMAIN: siteConfig.domain,
    VITE_SITE_SHORT_TITLE: siteConfig.shortTitle,
    VITE_SITE_FULL_TITLE: siteConfig.fullTitle,
    VITE_SITE_DESCRIPTION: siteConfig.description,
    VITE_SITE_PODCAST_LINKS: JSON.stringify(podcastLinks),
  };
}

// Define a custom plugin to serve transcript files (site-aware)
function transcriptServerPlugin() {
  return {
    name: 'transcript-server-plugin',
    configureServer(server: ViteDevServer) {
      // Handler for listing transcript files
      server.middlewares.use('/api/transcript-files', (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const siteId = process.env.SELECTED_SITE_ID || process.env.SITE_ID;
          if (!siteId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'SELECTED_SITE_ID or SITE_ID not configured' }));
            return;
          }

          // Get all .srt files from site-specific processing/transcripts directory
          const rootDir = path.resolve(__dirname, '..', '..');
          const transcriptsDir = path.join(rootDir, 'aws-local-dev', 's3', 'sites', siteId, 'transcripts');
          const files = findSrtFiles(transcriptsDir);
          
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files: files.map(f => path.basename(f)) }));
        } catch (error) {
          log.error('Error serving transcript-files:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to read transcript files' }));
        }
      });

      // Handler for serving transcript content
      server.middlewares.use('/api/transcripts', (req: IncomingMessage, res: ServerResponse) => {
        try {
          const siteId = process.env.SELECTED_SITE_ID || process.env.SITE_ID;
          if (!siteId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'SELECTED_SITE_ID or SITE_ID not configured' }));
            return;
          }

          const rootDir = path.resolve(__dirname, '..', '..');
          const transcriptsDir = path.join(rootDir, 'aws-local-dev', 's3', 'sites', siteId, 'transcripts');
          const requestedFile = req.url?.substring(1); // Remove leading slash
          
          if (!requestedFile) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'No file specified' }));
            return;
          }
          
          // Find the file in site-specific transcripts directory
          const files = findSrtFiles(transcriptsDir);
          const matchingFile = files.find(f => path.basename(f) === requestedFile);
          
          if (!matchingFile) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
          }
          
          const fileContent = fs.readFileSync(matchingFile, 'utf-8');
          res.setHeader('Content-Type', 'text/plain');
          res.end(fileContent);
        } catch (error) {
          log.error('Error serving transcript file:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Failed to read transcript file' }));
        }
      });
    }
  };
}

// Helper function to find all .srt files in a directory and its subdirectories
function findSrtFiles(dir: string): string[] {
  let results: string[] = [];
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recurse into subdirectories, excluding node_modules
      if (item !== 'node_modules') {
        results = results.concat(findSrtFiles(fullPath));
      }
    } else if (item.endsWith('.srt')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

// https://vite.dev/config/
export default defineConfig(() => {
  // Load site configuration and inject as environment variables
  let siteEnvVars: Record<string, string> = {};
  try {
    siteEnvVars = loadSiteConfig();
    console.log(`Building client for site: ${siteEnvVars.VITE_SITE_ID}`);
  } catch (error) {
    console.warn('Site config not loaded, using defaults:', (error as Error).message);
  }

  return {
    plugins: [
      tailwindcss(),
      react(),
      svgr(),
      transcriptServerPlugin(),
      {
        name: 'copy-favicon',
        writeBundle() {
          const src = path.resolve(__dirname, 'favicon.ico');
          const dest = path.resolve(__dirname, 'dist', 'favicon.ico');
          fs.copyFileSync(src, dest);
        }
      }
    ],
    define: {
      // Inject site config as compile-time constants
      ...Object.fromEntries(
        Object.entries(siteEnvVars).map(([key, value]) => [
          `import.meta.env.${key}`,
          JSON.stringify(value)
        ])
      )
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    }
  };
})
