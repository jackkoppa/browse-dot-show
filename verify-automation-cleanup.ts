#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

class AutomationCleanupVerifier {
  private readonly projectRoot = process.cwd();
  private readonly automationLogsDir = join(this.projectRoot, 'scripts/automation-logs');

  async verify(): Promise<void> {
    console.log('🔍 VERIFYING AUTOMATION HOUSEKEEPING CLEANUP');
    console.log('=' .repeat(60));
    console.log();

    let allGood = true;

    // Check old files are gone
    console.log('🗑️  OLD FILES CLEANUP:');
    const oldFiles = ['.automation-config', '.last-pipeline-run'];
    for (const file of oldFiles) {
      const exists = existsSync(join(this.projectRoot, file));
      console.log(`   ${exists ? '❌' : '✅'} ${file} ${exists ? 'still exists (should be deleted)' : 'successfully removed'}`);
      if (exists) allGood = false;
    }

    // Check new files exist
    console.log('\n📁 NEW FILE LOCATIONS:');
    const newFiles = ['automation-config.json', 'last-pipeline-run.json'];
    for (const file of newFiles) {
      const path = join(this.automationLogsDir, file);
      const exists = existsSync(path);
      console.log(`   ${exists ? '✅' : '❌'} ${file} ${exists ? 'exists in automation-logs/' : 'missing from automation-logs/'}`);
      if (!exists) allGood = false;
      
      if (exists) {
        try {
          const content = JSON.parse(readFileSync(path, 'utf8'));
          console.log(`      Valid JSON with ${Object.keys(content).length} properties`);
        } catch (e) {
          console.log('      ❌ Invalid JSON content');
          allGood = false;
        }
      }
    }

    // Check gitignore
    console.log('\n🚫 GITIGNORE STATUS:');
    try {
      const gitignoreContent = readFileSync(join(this.projectRoot, '.gitignore'), 'utf8');
      const hasAutomationLogs = gitignoreContent.includes('scripts/automation-logs/');
      const hasAutomationConfig = gitignoreContent.includes('.automation-config');
      
      console.log(`   ${hasAutomationLogs ? '✅' : '❌'} scripts/automation-logs/ ${hasAutomationLogs ? 'gitignored' : 'NOT gitignored'}`);
      console.log(`   ${hasAutomationConfig ? '✅' : '❌'} .automation-config ${hasAutomationConfig ? 'gitignored' : 'NOT gitignored'}`);
      
      if (!hasAutomationLogs || !hasAutomationConfig) allGood = false;
    } catch (e) {
      console.log('   ❌ Could not read .gitignore');
      allGood = false;
    }

    // Test the automation system still works
    console.log('\n🚀 FUNCTIONALITY TEST:');
    try {
      const startTime = Date.now();
      const output = execSync('pnpm run ingestion:automation:manage -- --auto-run', { 
        encoding: 'utf8',
        timeout: 10000
      });
      const duration = Date.now() - startTime;
      
      const success = output.includes('Ingestion automation check started') && 
                     (output.includes('Exiting') || output.includes('Pipeline'));
      
      console.log(`   ${success ? '✅' : '❌'} Auto-run test ${success ? 'passed' : 'failed'} (${duration}ms)`);
      if (!success) {
        console.log('      Output:', output.substring(0, 200) + '...');
        allGood = false;
      }
    } catch (e: any) {
      console.log('   ❌ Auto-run test failed:', e.message);
      allGood = false;
    }

    // Final result
    console.log('\n' + '=' .repeat(60));
    if (allGood) {
      console.log('🎉 ALL CLEANUP VERIFICATION PASSED!');
      console.log('✅ Automation system is properly organized and working');
      console.log('✅ Config files moved to scripts/automation-logs/');
      console.log('✅ Old files cleaned up from project root');
      console.log('✅ Everything properly gitignored');
      console.log('✅ Functionality confirmed working');
    } else {
      console.log('❌ SOME ISSUES FOUND - see details above');
    }
    console.log();
  }
}

const verifier = new AutomationCleanupVerifier();
verifier.verify().catch(console.error); 