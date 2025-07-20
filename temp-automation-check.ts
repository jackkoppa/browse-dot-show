#!/usr/bin/env tsx

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

class AutomationSystemChecker {
  private readonly projectRoot = process.cwd();
  private readonly automationLogsDir = join(this.projectRoot, 'scripts/automation-logs');
  private readonly launchAgentPath = join(homedir(), 'Library/LaunchAgents/com.browse-dot-show.ingestion-automation.plist');

  async runAllChecks(): Promise<void> {
    console.log('🔍 AUTOMATION SYSTEM COMPREHENSIVE CHECK');
    console.log('=' .repeat(80));
    console.log();

    await this.checkFileLocationsAndGitignore();
    await this.checkLaunchAgentStatus();
    await this.checkConfigurationConsistency();
    await this.checkLogFileManagement();
    await this.checkSystemFiles();
    await this.suggestImprovements();
  }

  private async checkFileLocationsAndGitignore(): Promise<void> {
    console.log('📁 FILE LOCATIONS & GITIGNORE STATUS');
    console.log('-'.repeat(50));

    // Check current config file locations
    const configFiles = [
      '.automation-config',
      '.last-pipeline-run'
    ];

    console.log('\n🗂️  Configuration Files:');
    for (const file of configFiles) {
      const path = join(this.projectRoot, file);
      if (existsSync(path)) {
        const content = readFileSync(path, 'utf8');
        console.log(`   ✅ ${file} exists (${content.length} bytes)`);
        console.log(`      Content preview: ${content.substring(0, 100)}...`);
      } else {
        console.log(`   ❌ ${file} missing`);
      }
    }

    // Check gitignore status
    console.log('\n🚫 Gitignore Status:');
    try {
      const gitignoreContent = readFileSync(join(this.projectRoot, '.gitignore'), 'utf8');
      const ignoredPatterns = gitignoreContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      for (const file of configFiles) {
        const isIgnored = ignoredPatterns.some(pattern => {
          if (pattern === file) return true;
          if (pattern.includes('*') && file.match(pattern.replace(/\*/g, '.*'))) return true;
          return false;
        });
        console.log(`   ${isIgnored ? '✅' : '❌'} ${file} ${isIgnored ? 'is gitignored' : 'NOT gitignored'}`);
      }

      const automationLogPattern = ignoredPatterns.find(p => p.includes('automation-logs'));
      console.log(`   ${automationLogPattern ? '✅' : '❌'} automation-logs ${automationLogPattern ? `gitignored (${automationLogPattern})` : 'NOT gitignored'}`);

    } catch (e) {
      console.log('   ❌ Could not read .gitignore file');
    }

    // Check automation-logs directory
    console.log('\n📋 Automation Logs Directory:');
    if (existsSync(this.automationLogsDir)) {
      const files = readdirSync(this.automationLogsDir);
      console.log(`   ✅ Directory exists with ${files.length} files:`);
      for (const file of files) {
        const filePath = join(this.automationLogsDir, file);
        const stats = statSync(filePath);
        console.log(`      - ${file} (${stats.size} bytes, modified: ${stats.mtime.toLocaleString()})`);
      }
    } else {
      console.log('   ❌ automation-logs directory does not exist');
    }

    console.log();
  }

  private async checkLaunchAgentStatus(): Promise<void> {
    console.log('🚀 LAUNCHAGENT STATUS');
    console.log('-'.repeat(50));

    // Check if plist file exists
    console.log('\n📄 LaunchAgent Plist File:');
    if (existsSync(this.launchAgentPath)) {
      const plistContent = readFileSync(this.launchAgentPath, 'utf8');
      console.log(`   ✅ Plist file exists (${plistContent.length} bytes)`);
      
      // Extract key information from plist
      const labelMatch = plistContent.match(/<string>com\.browse-dot-show\.ingestion-automation<\/string>/);
      const runAtLoadMatch = plistContent.match(/<key>RunAtLoad<\/key>\s*<true\/>/);
      const programArgsMatch = plistContent.match(/<string>.*pnpm run ingestion:automation:manage.*<\/string>/);
      
      console.log(`      Label: ${labelMatch ? '✅' : '❌'} com.browse-dot-show.ingestion-automation`);
      console.log(`      RunAtLoad: ${runAtLoadMatch ? '✅' : '❌'} true`);
      console.log(`      Program Args: ${programArgsMatch ? '✅' : '❌'} contains pnpm command`);
    } else {
      console.log('   ❌ LaunchAgent plist file does not exist');
    }

    // Check launchctl status
    console.log('\n⚙️  LaunchAgent Runtime Status:');
    try {
      const launchctlOutput = execSync('launchctl list | grep com.browse-dot-show.ingestion-automation', { encoding: 'utf8' });
      console.log(`   ✅ LaunchAgent is loaded:`);
      console.log(`      ${launchctlOutput.trim()}`);
      
      // Parse the output for more details
      const parts = launchctlOutput.trim().split(/\s+/);
      if (parts.length >= 3) {
        const [pid, exitCode, label] = parts;
        console.log(`      PID: ${pid !== '-' ? pid : 'Not running'}`);
        console.log(`      Exit Code: ${exitCode}`);
      }
    } catch (e) {
      console.log('   ❌ LaunchAgent is not loaded or not found');
    }

    // Check launchctl print for more details
    console.log('\n🔍 LaunchAgent Detailed Status:');
    try {
      const printOutput = execSync('launchctl print gui/$(id -u)/com.browse-dot-show.ingestion-automation', { encoding: 'utf8' });
      console.log('   ✅ LaunchAgent details:');
      // Extract key lines
      const lines = printOutput.split('\n');
      const stateLine = lines.find(line => line.includes('state = '));
      const lastExitLine = lines.find(line => line.includes('last exit code = '));
      const programLine = lines.find(line => line.includes('program = '));
      
      if (stateLine) console.log(`      ${stateLine.trim()}`);
      if (lastExitLine) console.log(`      ${lastExitLine.trim()}`);
      if (programLine) console.log(`      ${programLine.trim()}`);
    } catch (e) {
      console.log('   ⚠️  Could not get detailed LaunchAgent status');
    }

    console.log();
  }

  private async checkConfigurationConsistency(): Promise<void> {
    console.log('⚙️  CONFIGURATION CONSISTENCY');
    console.log('-'.repeat(50));

    // Check automation config
    console.log('\n📋 Automation Config:');
    const configPath = join(this.projectRoot, '.automation-config');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        console.log(`   ✅ Valid JSON config:`);
        console.log(`      Enabled: ${config.enabled}`);
        console.log(`      Timestamp: ${config.timestamp}`);
      } catch (e) {
        console.log('   ❌ Invalid JSON in config file');
      }
    } else {
      console.log('   ❌ Config file missing');
    }

    // Check last run status
    console.log('\n⏰ Last Run Status:');
    const timestampPath = join(this.projectRoot, '.last-pipeline-run');
    if (existsSync(timestampPath)) {
      try {
        const status = JSON.parse(readFileSync(timestampPath, 'utf8'));
        console.log(`   ✅ Valid JSON status:`);
        console.log(`      Last Success: ${status.lastSuccessTimestamp ? new Date(status.lastSuccessTimestamp).toLocaleString() : 'Never'}`);
        console.log(`      Last Attempt: ${status.lastAttemptTimestamp ? new Date(status.lastAttemptTimestamp).toLocaleString() : 'Never'}`);
        console.log(`      Consecutive Failures: ${status.consecutiveFailures || 0}`);
      } catch (e) {
        console.log('   ❌ Invalid JSON in timestamp file');
      }
    } else {
      console.log('   ❌ Timestamp file missing');
    }

    console.log();
  }

  private async checkLogFileManagement(): Promise<void> {
    console.log('📊 LOG FILE MANAGEMENT');
    console.log('-'.repeat(50));

    // Check automation logs
    const logFiles = [
      'automation.log',
      'automation-error.log'
    ];

    console.log('\n📜 Automation Log Files:');
    for (const logFile of logFiles) {
      const logPath = join(this.automationLogsDir, logFile);
      if (existsSync(logPath)) {
        const stats = statSync(logPath);
        const content = readFileSync(logPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        console.log(`   ✅ ${logFile}:`);
        console.log(`      Size: ${stats.size} bytes`);
        console.log(`      Lines: ${lines.length}`);
        console.log(`      Last Modified: ${stats.mtime.toLocaleString()}`);
        
        if (lines.length > 0) {
          console.log(`      Last 2 lines:`);
          lines.slice(-2).forEach(line => console.log(`        ${line}`));
        }
      } else {
        console.log(`   ❌ ${logFile} does not exist`);
      }
    }

    // Check pipeline run history
    console.log('\n📈 Pipeline Run History:');
    const historyPath = join(this.projectRoot, 'ingestion-pipeline-runs.md');
    if (existsSync(historyPath)) {
      const stats = statSync(historyPath);
      const content = readFileSync(historyPath, 'utf8');
      const lines = content.split('\n');
      
      console.log(`   ✅ ingestion-pipeline-runs.md:`);
      console.log(`      Size: ${stats.size} bytes`);
      console.log(`      Lines: ${lines.length}`);
      console.log(`      Last Modified: ${stats.mtime.toLocaleString()}`);
    } else {
      console.log('   ❌ ingestion-pipeline-runs.md does not exist');
    }

    console.log();
  }

  private async checkSystemFiles(): Promise<void> {
    console.log('🗃️  SYSTEM FILES AUDIT');
    console.log('-'.repeat(50));

    // Look for any unexpected files related to automation
    console.log('\n🔍 Searching for automation-related files:');
    
    const searchPatterns = [
      'automation',
      'launch',
      'pipeline',
      '.last-',
      '.automation'
    ];

    const projectFiles = this.getAllFiles(this.projectRoot);
    const automationFiles = projectFiles.filter(file => 
      searchPatterns.some(pattern => 
        file.toLowerCase().includes(pattern.toLowerCase())
      )
    );

    console.log(`   Found ${automationFiles.length} potentially related files:`);
    for (const file of automationFiles.slice(0, 20)) { // Limit output
      const relativePath = file.replace(this.projectRoot + '/', '');
      console.log(`      ${relativePath}`);
    }
    
    if (automationFiles.length > 20) {
      console.log(`      ... and ${automationFiles.length - 20} more files`);
    }

    console.log();
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      const items = readdirSync(dir);
      for (const item of items) {
        if (item.startsWith('.git') || item === 'node_modules') continue;
        
        const fullPath = join(dir, item);
        const stats = statSync(fullPath);
        
        if (stats.isDirectory()) {
          files.push(...this.getAllFiles(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
    return files;
  }

  private async suggestImprovements(): Promise<void> {
    console.log('💡 SUGGESTED IMPROVEMENTS');
    console.log('-'.repeat(50));

    const improvements: string[] = [];

    // Check if config files should be moved
    if (existsSync(join(this.projectRoot, '.automation-config'))) {
      improvements.push('Move .automation-config to scripts/automation-logs/ and update gitignore');
    }
    
    if (existsSync(join(this.projectRoot, '.last-pipeline-run'))) {
      improvements.push('Move .last-pipeline-run to scripts/automation-logs/ and update gitignore');
    }

    // Check gitignore
    try {
      const gitignoreContent = readFileSync(join(this.projectRoot, '.gitignore'), 'utf8');
      if (!gitignoreContent.includes('automation-logs')) {
        improvements.push('Add scripts/automation-logs/ to .gitignore');
      }
      if (!gitignoreContent.includes('.automation-config')) {
        improvements.push('Add .automation-config to .gitignore');
      }
      if (!gitignoreContent.includes('.last-pipeline-run')) {
        improvements.push('Add .last-pipeline-run to .gitignore');
      }
    } catch (e) {
      improvements.push('Create or fix .gitignore file');
    }

    if (improvements.length === 0) {
      console.log('\n✅ No immediate improvements needed!');
    } else {
      console.log('\n📋 Recommended actions:');
      improvements.forEach((improvement, index) => {
        console.log(`   ${index + 1}. ${improvement}`);
      });
    }

    console.log();
  }
}

// Run the checker
const checker = new AutomationSystemChecker();
checker.runAllChecks().catch(console.error); 