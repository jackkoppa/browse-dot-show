#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

class AutomationToggleTest {
  private readonly projectRoot = process.cwd();
  private readonly launchAgentPath = join(homedir(), 'Library/LaunchAgents/com.browse-dot-show.ingestion-automation.plist');
  private readonly configPath = join(this.projectRoot, '.automation-config');

  async testDisableEnableCycle(): Promise<void> {
    console.log('🔄 TESTING DISABLE/ENABLE CYCLE');
    console.log('=' .repeat(80));
    console.log();

    console.log('This script will test the automation disable/enable functionality.');
    console.log('It will simulate what happens when a user disables and re-enables automation.');
    console.log();

    // Check initial state
    console.log('📊 INITIAL STATE:');
    await this.checkCurrentState();

    console.log('\n🔍 TESTING AUTO-RUN FUNCTIONALITY:');
    await this.testAutoRun();

    console.log('\n⚠️  NOTE: To fully test disable/enable, you would need to:');
    console.log('   1. Run: sudo pnpm run ingestion:automation:manage');
    console.log('   2. Choose "Disable ingestion automation"');
    console.log('   3. Verify LaunchAgent is removed');
    console.log('   4. Re-enable and verify LaunchAgent is recreated');
    console.log();
    console.log('   This test script only checks the current state and tests auto-run.');
  }

  private async checkCurrentState(): Promise<void> {
    // Check config file
    if (existsSync(this.configPath)) {
      const config = JSON.parse(readFileSync(this.configPath, 'utf8'));
      console.log(`   Config: ${config.enabled ? '✅ Enabled' : '❌ Disabled'} (${config.timestamp})`);
    } else {
      console.log('   Config: ❌ File missing');
    }

    // Check LaunchAgent file
    if (existsSync(this.launchAgentPath)) {
      console.log('   LaunchAgent File: ✅ Exists');
    } else {
      console.log('   LaunchAgent File: ❌ Missing');
    }

    // Check LaunchAgent status
    try {
      const output = execSync('launchctl list | grep com.browse-dot-show.ingestion-automation', { encoding: 'utf8' });
      console.log(`   LaunchAgent Status: ✅ Loaded (${output.trim()})`);
    } catch (e) {
      console.log('   LaunchAgent Status: ❌ Not loaded');
    }

    // Check if auto-run would execute
    const lastRunPath = join(this.projectRoot, '.last-pipeline-run');
    if (existsSync(lastRunPath)) {
      const status = JSON.parse(readFileSync(lastRunPath, 'utf8'));
      const hoursSinceSuccess = status.lastSuccessTimestamp 
        ? (Date.now() - status.lastSuccessTimestamp) / (1000 * 60 * 60)
        : Infinity;
      
      console.log(`   Would Auto-Run: ${hoursSinceSuccess >= 24 ? '✅ Yes' : '❌ No'} (${Math.round(hoursSinceSuccess)}h since last success)`);
    } else {
      console.log('   Would Auto-Run: ✅ Yes (no previous run recorded)');
    }
  }

  private async testAutoRun(): Promise<void> {
    console.log('Testing auto-run mode (--auto-run flag)...');
    console.log('This simulates what happens when you log in.');
    console.log();

    try {
      const startTime = Date.now();
      const output = execSync('pnpm run ingestion:automation:manage -- --auto-run', { 
        encoding: 'utf8',
        timeout: 30000 // 30 second timeout
      });
      const duration = Date.now() - startTime;

      console.log(`✅ Auto-run completed in ${duration}ms`);
      console.log('Output:');
      console.log(output.split('\n').map(line => `   ${line}`).join('\n'));

    } catch (error: any) {
      console.log('❌ Auto-run failed:');
      if (error.stdout) {
        console.log('STDOUT:');
        console.log(error.stdout.split('\n').map((line: string) => `   ${line}`).join('\n'));
      }
      if (error.stderr) {
        console.log('STDERR:');
        console.log(error.stderr.split('\n').map((line: string) => `   ${line}`).join('\n'));
      }
      console.log(`Exit code: ${error.status}`);
    }
  }
}

// Run the test
const tester = new AutomationToggleTest();
tester.testDisableEnableCycle().catch(console.error); 