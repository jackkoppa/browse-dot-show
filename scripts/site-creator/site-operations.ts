import { join } from 'path';
import { copyDir, ensureDir, exists, writeTextFile, readTextFile } from '../utils/file-operations.js';
import { execCommand } from '../utils/shell-exec.js';
import { printInfo, printSuccess, printWarning } from '../utils/logging.js';
import type { Initial2EpisodesResults } from './types.js';

export async function getExistingSites(): Promise<string[]> {
  const mySitesDir = 'sites/my-sites';
  if (!(await exists(mySitesDir))) {
    return [];
  }
  
  try {
    // Use Node.js fs to read directory since file-operations doesn't export readdir
    const fs = await import('fs');
    const entries = await fs.promises.readdir(mySitesDir, { withFileTypes: true });
    const sites: string[] = [];
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sitePath = join(mySitesDir, entry.name);
        if (await exists(join(sitePath, 'site.config.json'))) {
          sites.push(entry.name);
        }
      }
    }
    
    return sites;
  } catch {
    // Directory might not be readable, return empty array
    return [];
  }
}

export async function copyTemplateAndAssets(siteId: string): Promise<void> {
  const targetDir = join('sites/my-sites', siteId);
  const templateDir = 'sites/template-site';
  
  printInfo('📁 Copying template files...');
  
  // Ensure target directory exists
  await ensureDir(targetDir);
  
  // Copy template files
  await copyDir(templateDir, targetDir);
  
  // Copy default theme CSS
  const themeSourcePath = 'packages/blocks/styles/browse-dot-show-base-theme.css';
  const themeTargetPath = join(targetDir, 'index.css');
  
  if (await exists(themeSourcePath)) {
    const themeContent = await readTextFile(themeSourcePath);
    await writeTextFile(themeTargetPath, themeContent);
    printInfo('🎨 Copied default browse.show theme');
  }
  
  // Copy key colors CSS
  const keyColorsSourcePath = 'packages/blocks/styles/key-colors.css';
  const keyColorsTargetPath = join(targetDir, 'key-colors.css');
  
  if (await exists(keyColorsSourcePath)) {
    const keyColorsContent = await readTextFile(keyColorsSourcePath);
    await writeTextFile(keyColorsTargetPath, keyColorsContent);
    printInfo('🎨 Copied key colors CSS');
  }
  
  // Copy default assets from homepage
  const assetsSourceDir = 'packages/homepage/original-assets';
  const assetsTargetDir = join(targetDir, 'assets');
  
  if (await exists(assetsSourceDir)) {
    await ensureDir(assetsTargetDir);
    await copyDir(assetsSourceDir, assetsTargetDir);
    printInfo('🖼️  Copied default assets');
  }
  
  // Copy .env to .env.local if it doesn't exist
  const envSourcePath = '.env';
  const envLocalPath = '.env.local';
  const envProdBuildPath = '.env.lambda-prod-build';
  
  if (await exists(envSourcePath) && !(await exists(envLocalPath))) {
    const envContent = await readTextFile(envSourcePath);
    await writeTextFile(envLocalPath, envContent);
    printInfo('⚙️  Copied .env to .env.local for local configuration');
  }
  
  // Also create .env.lambda-prod-build if it doesn't exist
  if (await exists(envSourcePath) && !(await exists(envProdBuildPath))) {
    const envContent = await readTextFile(envSourcePath);
    
    // Modify FILE_STORAGE_ENV for production build
    const prodEnvContent = envContent.replace(
      /FILE_STORAGE_ENV=local/g,
      'FILE_STORAGE_ENV=prod-s3'
    );
    
    await writeTextFile(envProdBuildPath, prodEnvContent);
    printInfo('⚙️  Created .env.lambda-prod-build for production deployment');
  }
  
  // Replace SITE_ID placeholder in terraform files
  const terraformDir = join(targetDir, 'terraform');
  if (await exists(terraformDir)) {
    const backendFile = join(terraformDir, 'backend.tfbackend');
    const prodVarsFile = join(terraformDir, 'prod.tfvars');
    
    if (await exists(backendFile)) {
      const backendContent = await readTextFile(backendFile);
      const updatedBackendContent = backendContent.replace(/SITE_ID/g, siteId);
      await writeTextFile(backendFile, updatedBackendContent);
    }
    
    if (await exists(prodVarsFile)) {
      const prodVarsContent = await readTextFile(prodVarsFile);
      const updatedProdVarsContent = prodVarsContent.replace(/SITE_ID/g, siteId);
      await writeTextFile(prodVarsFile, updatedProdVarsContent);
    }
    
    printInfo('🔧 Updated terraform files with site ID');
  }
}

export async function runSiteValidation(_siteId: string): Promise<boolean> {
  try {
    printInfo('🔍 Running site validation...');
    
    // Run the sites validation script
    const result = await execCommand('pnpm', ['run', 'validate:sites']);
    
    if (result.stderr && !result.stderr.includes('warning')) {
      printWarning('Validation completed with warnings:');
      console.log(result.stderr);
    }
    
    printSuccess('✅ Site validation passed');
    return true;
  } catch {
    printWarning('⚠️  Site validation found issues (this is normal for new sites)');
    printInfo('You can address these after completing the setup.');
    return false;
  }
}

export async function collectInitial2EpisodesMetrics(siteId: string, downloadTimeInSeconds: number, transcriptionTimeInSeconds: number): Promise<Initial2EpisodesResults> {
  const fs = await import('fs');
  const path = await import('path');
  
  // Use the actual measured times
  const episodesTranscriptionTimeInSeconds = transcriptionTimeInSeconds;
  
  // Find the local audio directory for this site
  const audioDir = path.join('aws-local-dev', 's3', 'sites', siteId, 'audio');
  
  let totalSizeInBytes = 0;
  let totalDurationInSeconds = 0;
  let audioFileCount = 0;
  
  try {
    // Check if audio directory exists
    if (!fs.existsSync(audioDir)) {
      throw new Error(`Audio directory not found: ${audioDir}`);
    }
    
    // Get all subdirectories (podcast IDs)
    const podcastDirs = fs.readdirSync(audioDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    // Scan each podcast directory for audio files
    for (const podcastId of podcastDirs) {
      const podcastAudioDir = path.join(audioDir, podcastId);
      
      if (fs.existsSync(podcastAudioDir)) {
        const audioFiles = fs.readdirSync(podcastAudioDir)
          .filter(file => file.endsWith('.mp3'));
        
        for (const audioFile of audioFiles) {
          const filePath = path.join(podcastAudioDir, audioFile);
          const stats = fs.statSync(filePath);
          totalSizeInBytes += stats.size;
          audioFileCount++;
          
          // Get audio duration using ffprobe (if available)
          try {
            const result = await execCommand('ffprobe', [
              '-v', 'quiet',
              '-show_entries', 'format=duration',
              '-of', 'csv=p=0',
              filePath
            ]);
            
            if (result.exitCode === 0) {
              const duration = parseFloat(result.stdout.trim());
              if (!isNaN(duration)) {
                totalDurationInSeconds += duration;
              }
            } else {
              throw new Error('ffprobe failed');
            }
          } catch {
            // If ffprobe fails, estimate duration based on file size (rough estimate: ~1MB per minute for MP3)
            const estimatedDuration = (stats.size / 1024 / 1024) * 60; // MB * 60 seconds
            totalDurationInSeconds += estimatedDuration;
            printWarning(`Could not get exact duration for ${audioFile}, using size-based estimate`);
          }
        }
      }
    }
    
    if (audioFileCount === 0) {
      throw new Error('No audio files found in the expected directory');
    }
    
    // Convert bytes to MB
    const episodesSizeInMB = totalSizeInBytes / 1024 / 1024;
    
    printInfo(`Found ${audioFileCount} audio files totaling ${episodesSizeInMB.toFixed(1)}MB and ${Math.round(totalDurationInSeconds/60)} minutes`);
    
    // Use the actual measured download time
    const episodesAudioFileDownloadTimeInSeconds = downloadTimeInSeconds;
    
    return {
      episodesSizeInMB,
      episodesDurationInSeconds: Math.round(totalDurationInSeconds),
      episodesTranscriptionTimeInSeconds,
      episodesAudioFileDownloadTimeInSeconds
    };
    
  } catch (error) {
    throw new Error(`Failed to collect episode metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function openGuide(guidePath: string): Promise<void> {
  try {
    // Try to open the guide file with the default system editor
    if (process.platform === 'darwin') {
      await execCommand('open', [guidePath]);
    } else if (process.platform === 'win32') {
      await execCommand('start', [guidePath]);
    } else {
      await execCommand('xdg-open', [guidePath]);
    }
    printSuccess(`📖 Opened ${guidePath}`);
  } catch {
    printInfo(`📖 Please open: ${guidePath}`);
  }
} 