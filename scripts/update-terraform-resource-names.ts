#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { logInfo, logError, logSuccess } from './utils/logging.js';

/**
 * Function name mappings for AWS resource name length compliance
 */
const FUNCTION_NAME_MAPPINGS = {
    'retrieve-rss-feeds-and-download-audio-files': 'rss-retrieval',
    'process-new-audio-files-via-whisper': 'whisper-transcription',
    'convert-srts-indexed-search': 'srt-indexing',
    'search-indexed-transcripts': 'search-api'
};

/**
 * Updates Terraform configuration files to use shorter function names
 */
async function updateTerraformResourceNames(): Promise<void> {
    logInfo('🔧 Updating Terraform resource names for length compliance...');
    
    const terraformMainPath = path.join(process.cwd(), 'terraform', 'sites', 'main.tf');
    
    if (!fs.existsSync(terraformMainPath)) {
        logError(`Terraform main.tf not found at: ${terraformMainPath}`);
        process.exit(1);
    }
    
    // Read the current file
    let content = fs.readFileSync(terraformMainPath, 'utf8');
    const originalContent = content;
    
    // Track changes made
    const changesLog: string[] = [];
    
    // Apply function name replacements
    for (const [oldName, newName] of Object.entries(FUNCTION_NAME_MAPPINGS)) {
        const regex = new RegExp(`"${oldName}`, 'g');
        const matches = content.match(regex);
        
        if (matches) {
            content = content.replace(regex, `"${newName}`);
            changesLog.push(`  - ${oldName} → ${newName} (${matches.length} occurrences)`);
        }
    }
    
    // Verify changes were made
    if (content === originalContent) {
        logInfo('ℹ️  No changes needed - resource names already updated');
        return;
    }
    
    // Write the updated content
    fs.writeFileSync(terraformMainPath, content);
    
    logSuccess('✅ Updated Terraform configuration:');
    changesLog.forEach(change => logInfo(change));
    
    // Validate the changes by checking a few key patterns
    validateTerraformChanges(content);
}

/**
 * Validates that the Terraform changes look correct
 */
function validateTerraformChanges(content: string): void {
    logInfo('🔍 Validating Terraform changes...');
    
    const validationChecks = [
        { pattern: /function_name\s*=\s*"rss-retrieval-/, description: 'RSS Lambda function name' },
        { pattern: /function_name\s*=\s*"whisper-transcription-/, description: 'Whisper Lambda function name' },
        { pattern: /function_name\s*=\s*"srt-indexing-/, description: 'SRT Indexing Lambda function name' },
        { pattern: /function_name\s*=\s*"search-api-/, description: 'Search Lambda function name' }
    ];
    
    let allChecksPass = true;
    
    for (const check of validationChecks) {
        if (check.pattern.test(content)) {
            logSuccess(`  ✅ ${check.description} - Updated correctly`);
        } else {
            logError(`  ❌ ${check.description} - Pattern not found`);
            allChecksPass = false;
        }
    }
    
    if (allChecksPass) {
        logSuccess('✅ All validation checks passed');
    } else {
        logError('❌ Some validation checks failed - please review the changes');
    }
}

/**
 * Calculate and display resource name lengths for verification
 */
function displayResourceNameLengths(): void {
    logInfo('📏 Resource name lengths with 32-character site ID:');
    
    const siteIdLength = 32;
    const mockSiteId = 'a'.repeat(siteIdLength);
    
    const resourcePatterns = [
        { name: 'RSS Lambda Function', pattern: `rss-retrieval-${mockSiteId}` },
        { name: 'RSS Lambda IAM Role', pattern: `rss-retrieval-${mockSiteId}-role` },
        { name: 'Whisper Lambda Function', pattern: `whisper-transcription-${mockSiteId}` },
        { name: 'Whisper Lambda IAM Role', pattern: `whisper-transcription-${mockSiteId}-role` },
        { name: 'SRT Indexing Lambda Function', pattern: `srt-indexing-${mockSiteId}` },
        { name: 'SRT Indexing Lambda IAM Role', pattern: `srt-indexing-${mockSiteId}-role` },
        { name: 'Search Lambda Function', pattern: `search-api-${mockSiteId}` },
        { name: 'Search Lambda IAM Role', pattern: `search-api-${mockSiteId}-role` }
    ];
    
    for (const resource of resourcePatterns) {
        const length = resource.pattern.length;
        const status = length <= 64 ? '✅' : '❌';
        logInfo(`  ${status} ${resource.name}: ${length} chars (${resource.pattern})`);
    }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
    try {
        await updateTerraformResourceNames();
        displayResourceNameLengths();
        
        logInfo('');
        logInfo('🚀 Next steps:');
        logInfo('  1. Review the changes in terraform/sites/main.tf');
        logInfo('  2. Test with a single site first (e.g., myfavoritemurder)');
        logInfo('  3. Run the migration script for existing deployed sites');
        
    } catch (error: any) {
        logError(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main().catch(console.error); 