#!/usr/bin/env tsx

import { readFileSync } from 'fs';

/**
 * Automation credentials interface
 */
export interface AutomationCredentials {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SCHEDULED_RUN_MAIN_AWS_PROFILE: string;
}

/**
 * Load automation credentials from .env.automation file
 */
export function loadAutomationCredentials(): AutomationCredentials {
  console.log('🔐 Loading automation credentials from .env.automation...');
  
  try {
    const envContent = readFileSync('.env.automation', 'utf-8');
    const credentials: Partial<AutomationCredentials> = {};
    
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          if (['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'SCHEDULED_RUN_MAIN_AWS_PROFILE'].includes(key)) {
            (credentials as any)[key] = value;
          }
        }
      }
    }
    
    // Validate all required credentials are present
    const required: (keyof AutomationCredentials)[] = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'SCHEDULED_RUN_MAIN_AWS_PROFILE'];
    for (const key of required) {
      if (!credentials[key]) {
        throw new Error(`Missing required credential: ${key}`);
      }
    }
    
    console.log('✅ Automation credentials loaded successfully');
    return credentials as AutomationCredentials;
    
  } catch (error: any) {
    console.error('❌ Failed to load automation credentials:', error.message);
    console.error('Please ensure .env.automation exists and contains all required credentials');
    process.exit(1);
  }
} 