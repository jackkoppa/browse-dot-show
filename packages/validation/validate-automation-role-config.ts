#!/usr/bin/env tsx

/**
 * Validation script to ensure automation role configuration is correct
 * 
 * Rules:
 * - For each AWS profile, exactly one site should have create_automation_role = true
 * - All other sites in the same AWS profile should have create_automation_role = false
 * - Every site should have both aws_profile and create_automation_role defined
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SiteConfig {
  siteName: string;
  filePath: string;
  awsProfile?: string;
  createAutomationRole?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalSites: number;
    profileGroups: Record<string, {
      sites: string[];
      roleCreators: string[];
      roleReferencers: string[];
    }>;
  };
}

function parseHCLFile(filePath: string): Record<string, any> {
  try {
    const content = readFileSync(filePath, 'utf-8');
    
    // Simple HCL parser for terraform variable files
    const variables: Record<string, any> = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          let parsedValue: any = value.trim();
          
          // Remove inline comments (everything after #)
          const commentIndex = parsedValue.indexOf('#');
          if (commentIndex !== -1) {
            parsedValue = parsedValue.substring(0, commentIndex).trim();
          }
          
          // Remove quotes if present
          if (parsedValue.startsWith('"') && parsedValue.endsWith('"')) {
            parsedValue = parsedValue.slice(1, -1);
          } else if (parsedValue === 'true') {
            parsedValue = true;
          } else if (parsedValue === 'false') {
            parsedValue = false;
          } else if (!isNaN(Number(parsedValue))) {
            parsedValue = Number(parsedValue);
          }
          
          variables[key] = parsedValue;
        }
      }
    }
    
    return variables;
  } catch (error) {
    console.error(`Error parsing HCL file ${filePath}:`, error);
    return {};
  }
}

function loadSiteConfigs(): SiteConfig[] {
  const configs: SiteConfig[] = [];
  
  try {
    // New location: sites/origin-sites/{site-id}/terraform/prod.tfvars
    const sitesDir = '../../sites/origin-sites';
    const siteDirectories = readdirSync(sitesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    for (const siteName of siteDirectories) {
      const tfvarsPath = join(sitesDir, siteName, 'terraform', 'prod.tfvars');
      
      if (existsSync(tfvarsPath)) {
        const variables = parseHCLFile(tfvarsPath);
        
        configs.push({
          siteName,
          filePath: tfvarsPath,
          awsProfile: variables.aws_profile,
          createAutomationRole: variables.create_automation_role
        });
      }
    }
  } catch (error) {
    console.error('Error loading site configs:', error);
  }
  
  return configs;
}

function validateAutomationRoleConfig(configs: SiteConfig[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const profileGroups: Record<string, {
    sites: string[];
    roleCreators: string[];
    roleReferencers: string[];
  }> = {};
  
  // Group sites by AWS profile
  for (const config of configs) {
    if (!config.awsProfile) {
      errors.push(`❌ Site '${config.siteName}' is missing aws_profile`);
      continue;
    }
    
    if (config.createAutomationRole === undefined) {
      errors.push(`❌ Site '${config.siteName}' is missing create_automation_role`);
      continue;
    }
    
    if (!profileGroups[config.awsProfile]) {
      profileGroups[config.awsProfile] = {
        sites: [],
        roleCreators: [],
        roleReferencers: []
      };
    }
    
    const group = profileGroups[config.awsProfile];
    group.sites.push(config.siteName);
    
    if (config.createAutomationRole) {
      group.roleCreators.push(config.siteName);
    } else {
      group.roleReferencers.push(config.siteName);
    }
  }
  
  // Validate each profile group
  for (const [profile, group] of Object.entries(profileGroups)) {
    if (group.roleCreators.length === 0) {
      errors.push(`❌ AWS profile '${profile}' has no sites creating the automation role. One site must have create_automation_role = true`);
    } else if (group.roleCreators.length > 1) {
      errors.push(`❌ AWS profile '${profile}' has multiple sites creating the automation role: ${group.roleCreators.join(', ')}. Only one site should have create_automation_role = true`);
    } else {
      // Exactly one role creator - perfect!
      const creator = group.roleCreators[0];
      if (group.sites.length === 1) {
        warnings.push(`⚠️  AWS profile '${profile}' only has one site (${creator}). This is fine, but consider if more sites will be added to this account.`);
      }
    }
  }
  
  const valid = errors.length === 0;
  
  return {
    valid,
    errors,
    warnings,
    summary: {
      totalSites: configs.length,
      profileGroups
    }
  };
}

function displayResults(result: ValidationResult): void {
  console.log('🔍 Automation Role Configuration Validation');
  console.log('==========================================');
  console.log('');
  
  // Summary
  console.log(`📊 Summary: ${result.summary.totalSites} sites across ${Object.keys(result.summary.profileGroups).length} AWS profiles`);
  console.log('');
  
  // Profile breakdown
  console.log('📋 Configuration by AWS Profile:');
  for (const [profile, group] of Object.entries(result.summary.profileGroups)) {
    console.log(`\n  🔐 ${profile}:`);
    console.log(`     Total sites: ${group.sites.length}`);
    if (group.roleCreators.length > 0) {
      console.log(`     ✅ Role creator: ${group.roleCreators.join(', ')}`);
    }
    if (group.roleReferencers.length > 0) {
      console.log(`     🔗 Role referencers: ${group.roleReferencers.join(', ')}`);
    }
  }
  console.log('');
  
  // Errors
  if (result.errors.length > 0) {
    console.log('❌ Validation Errors:');
    result.errors.forEach(error => console.log(`   ${error}`));
    console.log('');
  }
  
  // Warnings
  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    result.warnings.forEach(warning => console.log(`   ${warning}`));
    console.log('');
  }
  
  // Final result
  if (result.valid) {
    console.log('🎉 ✅ All automation role configurations are valid!');
    console.log('');
    console.log('📝 Configuration Summary:');
    console.log('  - Each AWS profile has exactly one site creating the automation role');
    console.log('  - All other sites in each profile reference the existing role');
    console.log('  - This prevents "EntityAlreadyExists" errors during deployment');
  } else {
    console.log('❌ ⚠️  Validation failed! Please fix the errors above.');
    console.log('');
    console.log('💡 Quick fixes:');
    console.log('  - Ensure each site has both aws_profile and create_automation_role defined');
    console.log('  - For each AWS profile, exactly one site should have create_automation_role = true');
    console.log('  - All other sites in the same profile should have create_automation_role = false');
  }
}

function main(): void {
  console.log('Starting automation role configuration validation...\n');
  
  const configs = loadSiteConfigs();
  
  if (configs.length === 0) {
    console.error('❌ No site configuration files found in sites/origin-sites/*/terraform/');
    process.exit(1);
  }
  
  const result = validateAutomationRoleConfig(configs);
  displayResults(result);
  
  process.exit(result.valid ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateAutomationRoleConfig, loadSiteConfigs }; 