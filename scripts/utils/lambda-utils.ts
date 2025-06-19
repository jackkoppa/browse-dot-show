#!/usr/bin/env tsx

/**
 * Utilities for working with lambda packages
 */

/**
 * Determine lambda directory based on package name
 */
export function getLambdaDirectory(lambdaPackageName: string): string {
  // Remove @browse-dot-show/ prefix
  const cleanName = lambdaPackageName.replace('@browse-dot-show/', '');
  
  if (cleanName.includes('search')) {
    return `packages/search/${cleanName}`;
  } else {
    // For ingestion lambdas, remove -lambda suffix and add it back
    const baseName = cleanName.replace('-lambda', '');
    return `packages/ingestion/${baseName}-lambda`;
  }
} 