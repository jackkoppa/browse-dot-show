#!/usr/bin/env tsx

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import prompts from 'prompts';
import { PipelineResultLogger } from './utils/pipeline-result-logger.js';

interface PowerStatus {
  isOnAC: boolean;
  batteryLevel: number;
}

interface PipelineRunStatus {
  lastSuccessTimestamp?: number;
  lastAttemptTimestamp?: number;
  consecutiveFailures: number;
}

interface AutomationConfig {
  enabled: boolean;
  timestamp: string;
}

class IngestionAutomationManager {
  private readonly CONFIG_FILE = join(process.cwd(), 'scripts/automation-logs/automation-config.json');
  private readonly TIMESTAMP_FILE = join(process.cwd(), 'scripts/automation-logs/last-pipeline-run.json');
  private readonly MIN_BATTERY_LEVEL = 50;
  private readonly HOURS_BETWEEN_RUNS = 24;
  private readonly LOG_DIR = join(process.cwd(), 'scripts/automation-logs');

  constructor() {
    this.ensureRunningOnMac();
  }

  /**
   * Main entry point - handles both interactive management and automatic execution
   */
  async run(): Promise<void> {
    try {
      // Check if this is an automatic execution (triggered by login)
      const args = process.argv.slice(2);
      if (args.includes('--auto-run')) {
        await this.checkAndRunPipeline();
        return;
      }

      // Interactive management mode
      await this.runInteractiveMode();
      
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * Interactive management interface
   */
  private async runInteractiveMode(): Promise<void> {
    this.showWelcomeMessage();
    await this.showCurrentStatus();
    await this.handleUserInteraction();
  }

  /**
   * Automatic execution logic (triggered by LaunchAgent on login)
   */
  private async checkAndRunPipeline(): Promise<void> {
    console.log(`🚀 Ingestion automation check started at ${new Date().toISOString()}`);
    
    // Fast exit if pipeline ran successfully recently
    if (!this.shouldRunPipeline()) {
      const lastStatus = this.getLastRunStatus();
      const lastSuccessDate = lastStatus.lastSuccessTimestamp 
        ? new Date(lastStatus.lastSuccessTimestamp).toLocaleDateString()
        : 'never';
      console.log(`✅ Pipeline already ran successfully recently (last success: ${lastSuccessDate}). Exiting.`);
      return;
    }

    // Check if automation is enabled
    const config = this.getCurrentConfig();
    if (!config.enabled) {
      console.log('⏸️  Ingestion automation is disabled. Exiting.');
      return;
    }

    console.log('🔍 Checking conditions for pipeline execution...');
    
    // Check power conditions
    const powerStatus = this.getPowerStatus();
    console.log(`Power status: ${powerStatus.isOnAC ? '🔌 AC' : '🔋 Battery'} (${powerStatus.batteryLevel}%)`);
    
    if (!powerStatus.isOnAC && powerStatus.batteryLevel < this.MIN_BATTERY_LEVEL) {
      console.log(`⚠️  Battery level (${powerStatus.batteryLevel}%) below minimum (${this.MIN_BATTERY_LEVEL}%). Skipping pipeline.`);
      this.recordAttempt(false);
      return;
    }

    console.log('✅ Conditions met. Running ingestion pipeline...');
    
    try {
      await this.runIngestionPipeline();
      console.log('✅ Pipeline completed successfully!');
      this.recordAttempt(true);
    } catch (error) {
      console.error('❌ Pipeline failed:', error);
      this.recordAttempt(false);
      throw error;
    }
  }

  /**
   * Checks if pipeline should run based on timestamps
   */
  private shouldRunPipeline(): boolean {
    const lastStatus = this.getLastRunStatus();
    
    if (!lastStatus.lastSuccessTimestamp) {
      return true; // Never run successfully
    }

    const hoursSinceLastSuccess = (Date.now() - lastStatus.lastSuccessTimestamp) / (1000 * 60 * 60);
    return hoursSinceLastSuccess >= this.HOURS_BETWEEN_RUNS;
  }

  /**
   * Gets the last run status from timestamp file
   */
  private getLastRunStatus(): PipelineRunStatus {
    if (!existsSync(this.TIMESTAMP_FILE)) {
      return { consecutiveFailures: 0 };
    }

    try {
      const data = readFileSync(this.TIMESTAMP_FILE, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return { consecutiveFailures: 0 };
    }
  }

  /**
   * Records a pipeline attempt (success or failure)
   */
  private recordAttempt(success: boolean): void {
    const now = Date.now();
    const lastStatus = this.getLastRunStatus();
    
    const newStatus: PipelineRunStatus = {
      lastAttemptTimestamp: now,
      consecutiveFailures: success ? 0 : (lastStatus.consecutiveFailures + 1),
      lastSuccessTimestamp: success ? now : lastStatus.lastSuccessTimestamp
    };

    writeFileSync(this.TIMESTAMP_FILE, JSON.stringify(newStatus, null, 2));
    
    if (success) {
      console.log('📝 Recorded successful pipeline run');
    } else {
      console.log(`📝 Recorded failed attempt (${newStatus.consecutiveFailures} consecutive failures)`);
      
      // TODO: Send Slack alert after 4 consecutive failures
      if (newStatus.consecutiveFailures >= 4) {
        console.log('⚠️  TODO: Send Slack alert for 4+ consecutive failures');
      }
    }
  }

  /**
   * Shows welcome message
   */
  private showWelcomeMessage(): void {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                        Ingestion Automation Management                      ║
║                    Automatic Daily Ingestion Pipeline                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

This system automatically runs the ingestion pipeline once per day when you log in.

HOW IT WORKS:
  • Triggers when you log in (including unlocking from lock screen)
  • Runs at most once per 24-hour period
  • Fast exit (< 10ms) if already run recently
  • Smart retry if last successful run was > 24 hours ago

POWER CONDITIONS:
  ✅ AC Power: Always runs pipeline
  🔋 Battery Power: Only runs if battery > 50%

REQUIREMENTS:
  • Must run with sudo for LaunchAgent management: sudo pnpm run ingestion:automation:manage
  • Only works on macOS systems
`);
  }

  /**
   * Shows current status and configuration
   */
  private async showCurrentStatus(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('                           CURRENT STATUS');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    // Check sudo privileges
    if (!this.hasSudoPrivileges()) {
      console.log('❌ MISSING SUDO PRIVILEGES');
      console.log('   This script requires sudo to manage LaunchAgent configuration.');
      console.log('   Please run: sudo pnpm run ingestion:automation:manage\n');
      return;
    }

    // Configuration Status
    const config = this.getCurrentConfig();
    console.log('⚙️  CONFIGURATION:');
    console.log(`   Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   LaunchAgent: ${existsSync(this.getLaunchAgentPath()) ? '✅ Installed' : '❌ Not installed'}`);
    console.log();

    // Last Run Status
    const lastStatus = this.getLastRunStatus();
    console.log('📊 EXECUTION HISTORY:');
    if (lastStatus.lastSuccessTimestamp) {
      const lastSuccess = new Date(lastStatus.lastSuccessTimestamp);
      const hoursSince = (Date.now() - lastStatus.lastSuccessTimestamp) / (1000 * 60 * 60);
      console.log(`   Last Success: ${lastSuccess.toLocaleString()} (${Math.round(hoursSince)}h ago)`);
    } else {
      console.log('   Last Success: Never');
    }
    
    if (lastStatus.lastAttemptTimestamp) {
      const lastAttempt = new Date(lastStatus.lastAttemptTimestamp);
      console.log(`   Last Attempt: ${lastAttempt.toLocaleString()}`);
    }
    
    if (lastStatus.consecutiveFailures > 0) {
      console.log(`   Consecutive Failures: ${lastStatus.consecutiveFailures}`);
    }
    
    console.log(`   Next Run: ${this.shouldRunPipeline() ? 'Ready (will run on next login)' : 'Not needed (< 24h since success)'}`);
    console.log();

    // Current Power Status
    console.log('🔌 CURRENT POWER STATUS:');
    try {
      const powerStatus = this.getPowerStatus();
      console.log(`   Power Source: ${powerStatus.isOnAC ? '🔌 AC Power Connected' : '🔋 Running on Battery'}`);
      console.log(`   Battery Level: ${powerStatus.batteryLevel}%`);
      
      if (!powerStatus.isOnAC && powerStatus.batteryLevel < this.MIN_BATTERY_LEVEL) {
        console.log(`   ⚠️  Battery below minimum threshold (${this.MIN_BATTERY_LEVEL}%) - pipeline would be skipped`);
      }
    } catch (e) {
      console.log('   ❓ Could not determine current power status');
    }
    console.log();

    // Recent Pipeline Runs
    console.log('📈 RECENT PIPELINE RUNS:');
    try {
      const logger = new PipelineResultLogger();
      if (logger.logFileExists()) {
        const recentRuns = logger.getRecentEntries(3).split('\n').slice(0, 10);
        console.log(recentRuns.map(line => `   ${line}`).join('\n'));
        if (recentRuns.length >= 10) {
          console.log('   ... (see scripts/automation-logs/ingestion-pipeline-runs.md for full history)');
        }
      } else {
        console.log('   No pipeline runs logged yet.');
      }
    } catch (e) {
      console.log('   ❌ Could not read pipeline run history');
    }
    console.log();
  }

  /**
   * Handles user interaction for configuration
   */
  private async handleUserInteraction(): Promise<void> {
    if (!this.hasSudoPrivileges()) {
      console.log('Please restart with sudo privileges to make changes.');
      return;
    }

    const config = this.getCurrentConfig();
    
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('                              CONFIGURATION OPTIONS');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    const menuChoices = [
      { 
        title: `${config.enabled ? 'Keep automation enabled' : 'Keep automation disabled'} (no changes)`, 
        value: 'keep' 
      },
      { 
        title: config.enabled ? 'Disable ingestion automation' : 'Enable ingestion automation', 
        value: 'toggle' 
      },
      { title: 'Test pipeline manually (no effect on automation)', value: 'test' },
      { title: 'View recent pipeline run history', value: 'history' },
      { title: 'Show detailed help information', value: 'help' }
    ];

    const response = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: menuChoices
    });

    switch (response.action) {
      case 'keep':
        console.log(`\n✅ Configuration unchanged. Ingestion automation is ${config.enabled ? 'enabled' : 'disabled'}.`);
        break;
      case 'toggle':
        await this.toggleAutomationEnabled();
        break;
      case 'test':
        await this.testPipelineManually();
        break;
      case 'history':
        await this.showPipelineHistory();
        break;
      case 'help':
        this.showDetailedHelp();
        break;
      default:
        console.log('\n❌ No action selected. No changes made.');
    }
  }

  /**
   * Toggles automation enabled/disabled
   */
  private async toggleAutomationEnabled(): Promise<void> {
    const config = this.getCurrentConfig();
    const newState = !config.enabled;
    
    const action = newState ? 'enable' : 'disable';
    const response = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to ${action} ingestion automation?`,
      initial: true
    });
    
    if (response.confirm) {
      if (newState) {
        await this.enableAutomation();
      } else {
        await this.disableAutomation();
      }
    } else {
      console.log('\nOperation cancelled. Configuration unchanged.');
    }
  }

  /**
   * Enables ingestion automation
   */
  private async enableAutomation(): Promise<void> {
    console.log('\n🚀 Enabling ingestion automation...');
    
    try {
      // Set up LaunchAgent
      await this.setupLaunchAgent();
      
      // Mark as enabled
      this.markAsConfigured(true);
      
      console.log('\n✅ INGESTION AUTOMATION ENABLED!');
      console.log('The pipeline will now run automatically when you log in, at most once per day.');
      console.log('It will check power conditions and only run if appropriate.');
      console.log();
      console.log('📝 IMPORTANT NOTES:');
      console.log(`   • Logs will be written to ${this.LOG_DIR}/automation.log`);
      console.log(`   • Error logs will be written to ${this.LOG_DIR}/automation-error.log`);
      console.log('   • The LaunchAgent runs every login but exits quickly if already run today');
      console.log('   • Pipeline runs at most once per 24-hour period');
      
    } catch (error) {
      console.error('❌ Failed to enable automation:', error);
      throw error;
    }
  }

  /**
   * Disables ingestion automation
   */
  private async disableAutomation(): Promise<void> {
    console.log('\n⏸️  Disabling ingestion automation...');
    
    try {
      // Remove LaunchAgent
      await this.removeLaunchAgent();
      
      // Mark as disabled
      this.markAsConfigured(false);
      
      console.log('✅ Ingestion automation disabled.');
      console.log('The pipeline will no longer run automatically on login.');
      console.log('You can re-enable it anytime by running this script again.');
      
    } catch (error) {
      console.error('❌ Failed to disable automation:', error);
      throw error;
    }
  }

  /**
   * Tests the pipeline manually
   */
  private async testPipelineManually(): Promise<void> {
    console.log('\n🧪 Testing ingestion pipeline manually...');
    console.log('This will run the pipeline without affecting automation tracking.\n');
    
    const response = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: 'Do you want to proceed with the test?',
      initial: false
    });
    
    if (response.confirm) {
      try {
        console.log('\nStarting pipeline test...');
        await this.runIngestionPipeline();
        console.log('\n✅ Pipeline test completed successfully!');
      } catch (error) {
        console.error('\n❌ Pipeline test failed:', error);
      }
    } else {
      console.log('\nTest cancelled.');
    }
  }

  /**
   * Shows recent pipeline run history
   */
  private async showPipelineHistory(): Promise<void> {
    console.log('\n📊 RECENT PIPELINE RUN HISTORY');
    console.log('═'.repeat(50) + '\n');
    
    try {
      const logger = new PipelineResultLogger();
      if (logger.logFileExists()) {
        const recentRuns = logger.getRecentEntries(10);
        console.log(recentRuns);
        console.log(`\n📝 Full history available at: ${logger.getLogFilePath()}`);
      } else {
        console.log('No pipeline runs have been logged yet.');
        console.log('Pipeline runs will appear here after the first automated execution.');
      }
    } catch (error) {
      console.error('❌ Failed to read pipeline history:', error);
    }
    
    const response = await prompts({
      type: 'confirm',
      name: 'openLog',
      message: 'Would you like to open the full log file?',
      initial: false
    });
    
    if (response.openLog) {
      try {
        const logger = new PipelineResultLogger();
        this.executeCommand(`open "${logger.getLogFilePath()}"`, false);
        console.log('📖 Opening log file in default application...');
      } catch (e) {
        console.log('❌ Could not open log file automatically.');
        console.log(`   Please open manually: ${new PipelineResultLogger().getLogFilePath()}`);
      }
    }
  }

  /**
   * Shows detailed help
   */
  private showDetailedHelp(): void {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                               DETAILED HELP                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

WHAT THIS SCRIPT DOES:
This script configures your Mac to automatically run the ingestion pipeline once per
day when you log in. It's designed for reliable, unattended operation.

EXECUTION BEHAVIOR:
• Triggers every time you log in (including unlocking from lock screen)
• Runs at most once per 24-hour period based on last successful completion
• Fast exit (< 10ms) if pipeline already ran successfully today
• Retries if last successful run was more than 24 hours ago

CONDITIONS FOR RUNNING PIPELINE:
✅ Ingestion automation enabled AND (last success > 24h ago)
✅ AC Power Connected: Always runs pipeline
🔋 Battery Power: Only runs if battery > ${this.MIN_BATTERY_LEVEL}%

TECHNICAL DETAILS:
• Uses macOS LaunchAgent with RunAtLoad=true
• Stores timestamps in .last-pipeline-run file
• Tracks consecutive failures for future alerting
• No complex power management or scheduled wake required

FILES CREATED:
• .automation-config - Enabled/disabled state
• .last-pipeline-run - Timestamp tracking
• ~/Library/LaunchAgents/com.browse-dot-show.ingestion-automation.plist - LaunchAgent

MANUAL COMMANDS:
• Check LaunchAgent: launchctl list | grep ingestion-automation
• Check power source: pmset -g ps
• View timestamps: cat .last-pipeline-run
• View recent logs: tail -20 scripts/automation-logs/automation.log

TROUBLESHOOTING:
• Ensure you run with sudo privileges for setup
• Verify LaunchAgent is loaded and running
• Check power/battery conditions
• Review execution logs for detailed information

ADVANTAGES:
• Reliable (no dependency on scheduled wake)
• Simple (no complex power management)
• Lightweight (fast exit when recently run)
• User-friendly (works with normal login patterns)
`);
  }

  /**
   * Gets current configuration
   */
  private getCurrentConfig(): AutomationConfig {
    if (!existsSync(this.CONFIG_FILE)) {
      return { enabled: false, timestamp: new Date().toISOString() };
    }

    try {
      const data = readFileSync(this.CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      return {
        enabled: config.enabled || false,
        timestamp: config.timestamp || new Date().toISOString()
      };
    } catch (e) {
      return { enabled: false, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Gets current power and battery status
   */
  private getPowerStatus(): PowerStatus {
    try {
      const powerOutput = this.executeCommand('pmset -g ps', false);
      
      const isOnAC = powerOutput.includes("'AC Power'") || powerOutput.includes("AC attached");
      const batteryMatch = powerOutput.match(/(\d+)%/);
      const batteryLevel = batteryMatch ? parseInt(batteryMatch[1], 10) : 100;

      return { isOnAC, batteryLevel };
    } catch (error) {
      return { isOnAC: true, batteryLevel: 100 };
    }
  }

  /**
   * Runs the ingestion pipeline
   */
  private async runIngestionPipeline(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('pnpm', ['run', 'ingestion:run-pipeline:triggered-by-schedule'], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Ingestion pipeline exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start ingestion pipeline: ${error.message}`));
      });
    });
  }

  /**
   * Sets up LaunchAgent for automatic pipeline execution
   */
  private async setupLaunchAgent(): Promise<void> {
    const launchAgentPath = this.getLaunchAgentPath();
    const plistContent = this.generateLaunchAgentPlist();
    
    try {
      // Remove existing LaunchAgent if it exists
      await this.removeLaunchAgent();
      
      // Write the new plist file
      writeFileSync(launchAgentPath, plistContent);
      
      // Load the LaunchAgent
      this.executeCommand(`launchctl load ${launchAgentPath}`, true);
      
      console.log(`   📄 LaunchAgent created: ${launchAgentPath}`);
    } catch (error) {
      throw new Error(`Failed to setup LaunchAgent: ${error}`);
    }
  }

  /**
   * Removes the LaunchAgent
   */
  private async removeLaunchAgent(): Promise<void> {
    const launchAgentPath = this.getLaunchAgentPath();
    
    try {
      // Unload the LaunchAgent if it's loaded
      this.executeCommand(`launchctl unload ${launchAgentPath}`, false);
    } catch (e) {
      // Ignore errors - agent might not be loaded
    }
    
    try {
      // Remove the plist file
      if (existsSync(launchAgentPath)) {
        unlinkSync(launchAgentPath);
      }
    } catch (e) {
      // Ignore errors
    }
  }

  /**
   * Gets the LaunchAgent path
   */
  private getLaunchAgentPath(): string {
    const homeDir = homedir();
    return join(homeDir, 'Library/LaunchAgents/com.browse-dot-show.ingestion-automation.plist');
  }

  /**
   * Generates the LaunchAgent plist content
   */
  private generateLaunchAgentPlist(): string {
    const projectPath = process.cwd();
    const logDir = this.LOG_DIR;
    
    // Ensure log directory exists
    if (!existsSync(logDir)) {
      try {
        mkdirSync(logDir, { recursive: true });
      } catch (e) {
        // Ignore errors - will be handled at runtime
      }
    }
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.browse-dot-show.ingestion-automation</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>-c</string>
        <string>cd ${projectPath} && /Users/jackkoppa/.nvm/versions/node/v22.14.0/bin/pnpm run ingestion:automation:manage -- --auto-run</string>
    </array>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>StandardOutPath</key>
    <string>${logDir}/automation.log</string>
    
    <key>StandardErrorPath</key>
    <string>${logDir}/automation-error.log</string>
    
    <key>WorkingDirectory</key>
    <string>${projectPath}</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/jackkoppa/.nvm/versions/node/v22.14.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>NODE_OPTIONS</key>
        <string>--max-old-space-size=8192</string>
        <key>HOME</key>
        <string>/Users/jackkoppa</string>
    </dict>
</dict>
</plist>`;
  }

  /**
   * Marks configuration as enabled/disabled
   */
  private markAsConfigured(enabled: boolean): void {
    const config: AutomationConfig = {
      enabled,
      timestamp: new Date().toISOString()
    };
    writeFileSync(this.CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  /**
   * Helper methods
   */
  private executeCommand(command: string, throwOnError: boolean = true): string {
    try {
      const result = execSync(command, { 
        encoding: 'utf8',
        stdio: throwOnError ? 'pipe' : ['pipe', 'pipe', 'ignore']
      });
      return result.trim();
    } catch (error) {
      if (throwOnError) {
        throw new Error(`Command failed: ${command}\n${error}`);
      }
      return '';
    }
  }

  private hasSudoPrivileges(): boolean {
    return process.getuid ? process.getuid() === 0 : false;
  }

  private ensureRunningOnMac(): void {
    if (process.platform !== 'darwin') {
      throw new Error('This script only works on macOS systems');
    }
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const manager = new IngestionAutomationManager();
  manager.run().catch((error) => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });
}

export default IngestionAutomationManager;