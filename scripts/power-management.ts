#!/usr/bin/env tsx

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';
import { homedir } from 'os';
import prompts from 'prompts';
import { PipelineResultLogger } from './utils/pipeline-result-logger.js';

interface PowerStatus {
  isOnAC: boolean;
  batteryLevel: number;
  isPoweredOff: boolean;
}

interface PowerConfig {
  isConfigured: boolean;
  wakeTime: string;
  daysOfWeek: string[];
  hasScheduledEvents: boolean;
  lidwake: boolean;
  womp: boolean;
  acwake: boolean;
  ttyskeepawake: boolean;
}

interface UserScheduleConfig {
  wakeTime: string;
  daysOfWeek: string[];
}

class MacPowerManager {
  private readonly CONFIG_FILE = join(process.cwd(), '.power-management-config');
  private readonly DEFAULT_WAKE_TIME = "01:00:00"; // 1:00 AM local time
  private readonly DEFAULT_DAYS_OF_WEEK = ['MTWRFSU']; // Monday through Sunday
  private readonly MIN_BATTERY_LEVEL = 50;
  private readonly LOG_DIR = join(process.cwd(), 'scripts/automation-logs');
  private rl: readline.Interface;

  constructor() {
    this.ensureRunningOnMac();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Main entry point - interactive power management
   */
  async run(): Promise<void> {
    try {
      // Check if this is a scheduled wake-up call (internal use)
      const args = process.argv.slice(2);
      if (args.includes('--wake-and-run')) {
        await this.wakeAndRunPipeline();
        return;
      }

      this.showWelcomeMessage();
      await this.showCurrentConfiguration();
      await this.handleUserInteraction();
      
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  /**
   * Shows welcome message and docs
   */
  private showWelcomeMessage(): void {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                          Mac Power Management Setup                          ║
║                         for Ingestion Pipeline Scheduling                    ║
╚══════════════════════════════════════════════════════════════════════════════╝

This script configures your Mac to automatically:
  • Wake up at a configurable time on selected days (works with lid closed/open)
  • Run the ingestion pipeline if conditions are met
  • Return to sleep/off state after completion

POWER CONDITIONS:
  ✅ AC Power: Always runs pipeline
  🔋 Battery Power: Only runs if battery > 50%
  
BEHAVIOR:
  • If Mac was powered off → shuts down after completion
  • If Mac was sleeping → goes back to sleep after completion
  • Works reliably whether MacBook lid is open or closed

REQUIREMENTS:
  • Must run with sudo: sudo pnpm run power:manage
  • Only works on macOS systems
`);
  }

  /**
   * Shows current power management configuration
   */
  private async showCurrentConfiguration(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('                           CURRENT CONFIGURATION');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    // Check if we have sudo privileges
    if (!this.hasSudoPrivileges()) {
      console.log('❌ MISSING SUDO PRIVILEGES');
      console.log('   This script requires sudo to read/modify power management settings.');
      console.log('   Please run: sudo pnpm run power:manage\n');
      return;
    }

    const config = this.getCurrentConfig();
    
    // Power Management Status
    console.log('🔋 POWER MANAGEMENT STATUS:');
    if (config.isConfigured) {
      console.log('   ✅ Power management is configured for ingestion pipeline');
      console.log('   ✅ LaunchAgent is set up for automatic execution');
    } else {
      console.log('   ⚠️  Power management has not been configured yet');
      if (existsSync(this.CONFIG_FILE)) {
        console.log('   ⚠️  Config file exists but LaunchAgent is missing');
      }
      if (existsSync(this.getLaunchAgentPath())) {
        console.log('   ⚠️  LaunchAgent exists but config file is missing');
      }
    }
    console.log();

    // Scheduled Events
    console.log('⏰ SCHEDULED EVENTS:');
    if (config.hasScheduledEvents) {
      console.log(`   ✅ Wake scheduled at ${config.wakeTime}`);
      console.log(`   📅 Schedule: ${this.formatDaysForDisplay(config.daysOfWeek)}`);
      
      try {
        const scheduleOutput = this.executeCommand('pmset -g sched', false);
        if (scheduleOutput.includes('wakeorpoweron') || scheduleOutput.includes('wakepoweron')) {
          console.log('   🎯 Next scheduled wake: Check output below');
        }
      } catch (e) {
        // Ignore errors in detailed schedule check
      }
    } else {
      console.log('   ❌ No scheduled wake events configured');
    }
    console.log();

    // Power Settings
    console.log('⚙️  POWER SETTINGS:');
    console.log(`   Lid Wake: ${config.lidwake ? '✅ Enabled' : '❌ Disabled'} ${config.lidwake ? '(Mac wakes when lid opened)' : '(Mac won\'t wake when lid opened)'}`);
    console.log(`   AC Wake: ${config.acwake ? '✅ Enabled' : '❌ Disabled'} ${config.acwake ? '(Mac wakes when power source changes)' : '(Mac won\'t wake on power changes)'}`);
    console.log(`   Wake on LAN: ${config.womp ? '✅ Enabled' : '❌ Disabled'} ${config.womp ? '(Mac can wake via network)' : '(No network wake capability)'}`);
    console.log(`   TTY Keep Awake: ${config.ttyskeepawake ? '✅ Enabled' : '❌ Disabled'} ${config.ttyskeepawake ? '(SSH sessions prevent sleep)' : '(SSH sessions won\'t prevent sleep)'}`);
    console.log();

    // Current Power Source
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

    // Detailed pmset output
    console.log('📋 DETAILED POWER SETTINGS:');
    try {
      const pmsetOutput = this.executeCommand('pmset -g', false);
      console.log(pmsetOutput.split('\n').map(line => `   ${line}`).join('\n'));
    } catch (e) {
      console.log('   ❌ Could not read detailed power settings');
    }
    console.log();

    console.log('📅 DETAILED SCHEDULE:');
    try {
      const schedOutput = this.executeCommand('pmset -g sched', false);
      if (schedOutput.trim() === 'No scheduled events.') {
        console.log('   No scheduled events found.');
      } else {
        console.log(schedOutput.split('\n').map(line => `   ${line}`).join('\n'));
      }
    } catch (e) {
      console.log('   ❌ Could not read schedule information');
    }
    console.log();

    // Recent Pipeline Runs
    console.log('📊 RECENT PIPELINE RUNS:');
    try {
      const logger = new PipelineResultLogger();
      if (logger.logFileExists()) {
        const recentRuns = logger.getRecentEntries(3).split('\n').slice(0, 15); // Show first 15 lines
        console.log(recentRuns.map(line => `   ${line}`).join('\n'));
        if (recentRuns.length >= 15) {
          console.log('   ... (see ingestion-pipeline-runs.md for full history)');
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
    const config = this.getCurrentConfig();
    
    if (!this.hasSudoPrivileges()) {
      console.log('Please restart with sudo privileges to make changes.');
      return;
    }

    if (!config.isConfigured || !config.hasScheduledEvents) {
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      console.log('                              INITIAL SETUP REQUIRED');
      console.log('═══════════════════════════════════════════════════════════════════════════════\n');
      
      const response = await prompts({
        type: 'confirm',
        name: 'setup',
        message: 'Would you like to set up power management for the ingestion pipeline?',
        initial: true
      });
      
      if (response.setup) {
        await this.performInitialSetup();
      } else {
        console.log('\nSetup skipped. Run this script again when you\'re ready to configure power management.');
      }
    } else {
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      console.log('                              CONFIGURATION OPTIONS');
      console.log('═══════════════════════════════════════════════════════════════════════════════\n');
      
      await this.showConfigurationMenu();
    }
  }

  /**
   * Shows configuration menu for already-configured systems
   */
  private async showConfigurationMenu(): Promise<void> {
    console.log('Current configuration looks good! What would you like to do?\n');
    
    const menuChoices = [
      { title: 'Keep current configuration (no changes)', value: 'keep' },
      { title: 'Clear all power management scheduling', value: 'clear' },
      { title: 'Reconfigure from scratch', value: 'reconfigure' },
      { title: 'Test the pipeline manually (without changing power state)', value: 'test' },
      { title: 'View recent pipeline run history', value: 'history' },
      { title: 'Show detailed help information', value: 'help' }
    ];

    const response = await prompts({
      type: 'select',
      name: 'action',
      message: 'Select an action:',
      choices: menuChoices
    });

    switch (response.action) {
      case 'keep':
        console.log('\n✅ Configuration unchanged. Your Mac will continue with the current schedule.');
        break;
      case 'clear':
        await this.clearConfiguration();
        break;
      case 'reconfigure':
        await this.performInitialSetup();
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
   * Performs initial setup
   */
  private async performInitialSetup(): Promise<void> {
    console.log('\n🚀 Starting power management setup...\n');

    // Get user preferences for schedule
    const scheduleConfig = await this.getUserSchedulePreferences();

    try {
      // Clear any existing schedules
      console.log('1️⃣  Clearing any existing power schedules...');
      this.executeCommand('pmset repeat cancel', false);
      console.log('   ✅ Existing schedules cleared\n');

      // Configure power settings
      console.log('2️⃣  Configuring power settings for reliable wake behavior...');
      this.executeCommand('pmset -a lidwake 1');     // Enable lid wake
      this.executeCommand('pmset -a acwake 0');      // Disable AC wake
      this.executeCommand('pmset -c womp 1');        // Enable wake on LAN (AC power only)
      this.executeCommand('pmset -a ttyskeepawake 1'); // Keep awake during SSH sessions
      console.log('   ✅ Power settings configured\n');

      // Set up the schedule
      console.log('3️⃣  Setting up wake schedule...');
      const daysString = scheduleConfig.daysOfWeek.join('');
      const scheduleCommand = `pmset repeat wakeorpoweron ${daysString} ${scheduleConfig.wakeTime}`;
      this.executeCommand(scheduleCommand);
      console.log(`   ✅ Wake scheduled for ${scheduleConfig.wakeTime} on ${this.formatDaysForDisplay(scheduleConfig.daysOfWeek)}\n`);

      // Set up LaunchAgent for automatic execution
      console.log('4️⃣  Setting up automatic pipeline execution...');
      await this.setupLaunchAgent(scheduleConfig);
      console.log('   ✅ LaunchAgent configured for automatic pipeline execution\n');

      // Mark as configured
      this.markAsConfigured(scheduleConfig);

      console.log('🎉 SETUP COMPLETE!\n');
      console.log('Your Mac is now configured to:');
      console.log(`   • Wake up at ${scheduleConfig.wakeTime} on ${this.formatDaysForDisplay(scheduleConfig.daysOfWeek)}`);
      console.log('   • Run the ingestion pipeline automatically');
      console.log('   • Return to sleep/off state after completion');
      console.log('   • Work with lid open or closed');
      console.log();
      console.log('The system will check power/battery conditions before running the pipeline.');
      console.log('On battery power, it will only run if battery > 50%.');
      console.log();
      console.log('📝 IMPORTANT NOTES:');
      console.log(`   • Logs will be written to ${this.LOG_DIR}/power-management.log`);
      console.log(`   • Error logs will be written to ${this.LOG_DIR}/power-management-error.log`);
      console.log(`   • The LaunchAgent will automatically run the pipeline at ${this.getLaunchAgentTime(scheduleConfig.wakeTime)}`);
      console.log('   • pmset handles the wake scheduling, LaunchAgent handles the execution');

    } catch (error) {
      console.error('❌ Setup failed:', error);
      throw error;
    }
  }

  /**
   * Clears configuration
   */
  private async clearConfiguration(): Promise<void> {
    const response = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: '⚠️  Are you sure you want to clear all power management scheduling?',
      initial: false
    });
    
    if (response.confirm) {
      console.log('\nClearing power management configuration...');
      this.executeCommand('pmset repeat cancel');
      await this.removeLaunchAgent();
      this.clearConfigFile();
      console.log('✅ All power management scheduling cleared.');
      console.log('Your Mac will no longer automatically wake for the ingestion pipeline.');
    } else {
      console.log('\nOperation cancelled. Configuration unchanged.');
    }
  }

  /**
   * Tests the pipeline manually
   */
  private async testPipelineManually(): Promise<void> {
    console.log('\n🧪 Testing ingestion pipeline manually...');
    console.log('This will run the pipeline without changing power states.\n');
    
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
        const recentRuns = logger.getRecentEntries(10); // Show last 10 runs
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
This script configures your Mac to automatically wake up at a configurable time
on selected days and run the ingestion pipeline. It's designed for unattended operation.

POWER MANAGEMENT BEHAVIOR:
• Wakes at configurable time on selected days (local time) regardless of lid position
• Checks power source and battery level
• Runs pipeline if conditions are met
• Returns to previous power state (sleep or off)

CONDITIONS FOR RUNNING PIPELINE:
✅ AC Power Connected: Always runs pipeline
🔋 Battery Power: Only runs if battery > ${this.MIN_BATTERY_LEVEL}%

TECHNICAL DETAILS:
• Uses pmset to schedule wake events
• Configures lidwake=1 for reliable wake with lid closed
• Sets acwake=0 to prevent unwanted wakes
• Enables womp (Wake on LAN) when on AC power
• Keeps system awake during SSH sessions

SCHEDULED WAKE COMMAND:
pmset repeat wakeorpoweron [DAYS] [TIME]
Example: pmset repeat wakeorpoweron MTWRFSU 01:00:00

FILES MODIFIED:
• /Library/Preferences/SystemConfiguration/com.apple.AutoWake.plist
• /Library/Preferences/SystemConfiguration/com.apple.PowerManagement.plist
• .power-management-config (in project root)

MANUAL COMMANDS:
• Check schedule: pmset -g sched
• Check power settings: pmset -g
• Check power source: pmset -g ps
• Clear schedule: sudo pmset repeat cancel

TROUBLESHOOTING:
• Ensure you run with sudo privileges
• Check that your Mac supports scheduled wake (most modern Macs do)
• Verify power management settings with pmset -g
• Check system logs if wake events don't occur

For more information about pmset, see: man pmset
`);
  }

  /**
   * Main logic for when the system wakes up at scheduled time
   */
  private async wakeAndRunPipeline(): Promise<void> {
    console.log('🌅 Mac woke up at scheduled time...\n');

    const powerStatus = this.getPowerStatus();
    
    console.log('Power Status Check:');
    console.log(`  • AC Power: ${powerStatus.isOnAC ? '🔌 Connected' : '🔋 Not connected'}`);
    console.log(`  • Battery Level: ${powerStatus.batteryLevel}%`);
    console.log(`  • Previously powered off: ${powerStatus.isPoweredOff ? 'Yes' : 'No (was sleeping)'}\n`);

    // Check battery level if running on battery
    if (!powerStatus.isOnAC && powerStatus.batteryLevel < this.MIN_BATTERY_LEVEL) {
      console.log(`⚠️  Battery level (${powerStatus.batteryLevel}%) is below minimum (${this.MIN_BATTERY_LEVEL}%)`);
      console.log('Returning to sleep/off without running ingestion pipeline...\n');
      await this.returnToPreviousState(powerStatus.isPoweredOff);
      return;
    }

    console.log('✅ Conditions met, running ingestion pipeline...\n');
    
    try {
      await this.runIngestionPipeline();
      console.log('\n✅ Ingestion pipeline completed successfully!');
      
      // Show most recent log entry
      try {
        const logger = new PipelineResultLogger();
        if (logger.logFileExists()) {
          console.log('\n📊 Latest Pipeline Results:');
          const recentRun = logger.getRecentEntries(1).split('\n').slice(0, 10);
          console.log(recentRun.map(line => `   ${line}`).join('\n'));
        }
      } catch (e) {
        // Ignore logging errors during power management
      }
    } catch (error) {
      console.error('\n❌ Ingestion pipeline failed:', error);
    }

    console.log('\nReturning to previous power state...');
    await this.returnToPreviousState(powerStatus.isPoweredOff);
  }

  /**
   * Gets current configuration status
   */
  private getCurrentConfig(): PowerConfig {
    let isConfigured = false;
    let wakeTime = this.DEFAULT_WAKE_TIME;
    let daysOfWeek = this.DEFAULT_DAYS_OF_WEEK;

    // Check if config file exists and read saved configuration
    if (existsSync(this.CONFIG_FILE)) {
      try {
        const configData = JSON.parse(readFileSync(this.CONFIG_FILE, 'utf8'));
        isConfigured = configData.configured || false;
        wakeTime = configData.wakeTime || this.DEFAULT_WAKE_TIME;
        daysOfWeek = configData.daysOfWeek || this.DEFAULT_DAYS_OF_WEEK;
      } catch (e) {
        // Ignore config file errors
      }
    }

    // Also check if LaunchAgent exists
    isConfigured = isConfigured && existsSync(this.getLaunchAgentPath());
    
    try {
      // Check for scheduled events
      const schedOutput = this.executeCommand('pmset -g sched', false);
      const hasScheduledEvents = schedOutput.includes('wakeorpoweron') || schedOutput.includes('wakepoweron');
      
      // Get power settings
      const pmsetOutput = this.executeCommand('pmset -g', false);
      const lidwake = pmsetOutput.includes('lidwake              1');
      const womp = pmsetOutput.includes('womp                 1');
      const acwake = pmsetOutput.includes('acwake               1');
      const ttyskeepawake = pmsetOutput.includes('ttyskeepawake        1');
      
      return {
        isConfigured,
        wakeTime,
        daysOfWeek,
        hasScheduledEvents,
        lidwake,
        womp,
        acwake,
        ttyskeepawake
      };
    } catch (error) {
      return {
        isConfigured: false,
        wakeTime,
        daysOfWeek,
        hasScheduledEvents: false,
        lidwake: false,
        womp: false,
        acwake: false,
        ttyskeepawake: false
      };
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

      const uptimeOutput = this.executeCommand('uptime', false);
      const uptimeMatch = uptimeOutput.match(/up\s+(\d+):(\d+)/);
      const minutesUp = uptimeMatch ? parseInt(uptimeMatch[1]) * 60 + parseInt(uptimeMatch[2]) : 0;
      const isPoweredOff = minutesUp < 10;

      return { isOnAC, batteryLevel, isPoweredOff };
    } catch (error) {
      return { isOnAC: true, batteryLevel: 100, isPoweredOff: false };
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
   * Returns system to previous power state
   */
  private async returnToPreviousState(wasPoweredOff: boolean): Promise<void> {
    const powerStatus = this.getPowerStatus();
    
    if (powerStatus.isOnAC) {
      if (wasPoweredOff) {
        console.log('Shutting down (was previously powered off, on AC power)...');
        this.executeCommand('shutdown -h now');
      } else {
        console.log('Going to sleep (was previously sleeping, on AC power)...');
        this.executeCommand('pmset sleepnow');
      }
    } else {
      if (wasPoweredOff) {
        console.log('Shutting down (was previously powered off, on battery)...');
        this.executeCommand('shutdown -h now');
      } else {
        console.log('Going to sleep (was previously sleeping, on battery)...');
        this.executeCommand('pmset sleepnow');
      }
    }
  }

  /**
   * Sets up LaunchAgent for automatic pipeline execution
   */
  private async setupLaunchAgent(scheduleConfig: UserScheduleConfig): Promise<void> {
    const launchAgentPath = this.getLaunchAgentPath();
    const plistContent = this.generateLaunchAgentPlist(scheduleConfig);
    
    try {
      // Remove existing LaunchAgent if it exists
      await this.removeLaunchAgent();
      
      // Write the new plist file
      writeFileSync(launchAgentPath, plistContent);
      
      // Load the LaunchAgent
      this.executeCommand(`launchctl load ${launchAgentPath}`, false);
      
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
    return join(homeDir, 'Library/LaunchAgents/com.browse-dot-show.power-management.plist');
  }

  /**
   * Generates the LaunchAgent plist content
   */
  private generateLaunchAgentPlist(scheduleConfig: UserScheduleConfig): string {
    const projectPath = process.cwd();
    const scriptPath = join(projectPath, 'scripts/power-management.ts');
    const logDir = this.LOG_DIR;
    const launchTime = this.getLaunchAgentTime(scheduleConfig.wakeTime);
    const [launchHour, launchMinute] = launchTime.split(':').map(Number);
    
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
    <string>com.browse-dot-show.power-management</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>tsx</string>
        <string>${scriptPath}</string>
        <string>--wake-and-run</string>
    </array>
    
    <key>RunAtLoad</key>
    <false/>
    
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${launchHour}</integer>
        <key>Minute</key>
        <integer>${launchMinute}</integer>
    </dict>
    
    <key>StandardOutPath</key>
    <string>${logDir}/power-management.log</string>
    
    <key>StandardErrorPath</key>
    <string>${logDir}/power-management-error.log</string>
    
    <key>WorkingDirectory</key>
    <string>${projectPath}</string>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>NODE_OPTIONS</key>
        <string>--max-old-space-size=8192</string>
    </dict>
</dict>
</plist>`;
  }

  /**
   * Gets user preferences for schedule configuration
   */
  private async getUserSchedulePreferences(): Promise<UserScheduleConfig> {
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('                              SCHEDULE CONFIGURATION');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    // Time selection
    const timeChoices = [
      { title: '12:00 AM (Midnight)', value: '00:00:00' },
      { title: '1:00 AM', value: '01:00:00' },
      { title: '2:00 AM', value: '02:00:00' },
      { title: '3:00 AM', value: '03:00:00' },
      { title: '4:00 AM', value: '04:00:00' },
      { title: '5:00 AM', value: '05:00:00' },
      { title: '6:00 AM', value: '06:00:00' },
      { title: 'Custom time', value: 'custom' }
    ];

    const timeResponse = await prompts({
      type: 'select',
      name: 'wakeTime',
      message: 'Select the time when the pipeline should run:',
      choices: timeChoices,
      initial: 1 // Default to 1:00 AM
    });

    let wakeTime = timeResponse.wakeTime;
    
    if (wakeTime === 'custom') {
      const customTimeResponse = await prompts({
        type: 'text',
        name: 'customTime',
        message: 'Enter custom time (HH:MM:SS format, e.g., 02:30:00):',
        initial: '02:30:00',
        validate: (value) => {
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
          return timeRegex.test(value) ? true : 'Please enter a valid time in HH:MM:SS format';
        }
      });
      wakeTime = customTimeResponse.customTime;
    }

    // Days of week selection
    const dayChoices = [
      { title: 'Monday', value: 'M' },
      { title: 'Tuesday', value: 'T' },
      { title: 'Wednesday', value: 'W' },
      { title: 'Thursday', value: 'R' },
      { title: 'Friday', value: 'F' },
      { title: 'Saturday', value: 'S' },
      { title: 'Sunday', value: 'U' }
    ];

    const daysResponse = await prompts({
      type: 'multiselect',
      name: 'daysOfWeek',
      message: 'Select which days of the week to run the pipeline:',
      choices: dayChoices,
      initial: [0, 1, 2, 3, 4, 5, 6] // Default to all days
    });

    return {
      wakeTime,
      daysOfWeek: daysResponse.daysOfWeek
    };
  }

  /**
   * Formats days of week for display
   */
  private formatDaysForDisplay(days: string[]): string {
    const dayNames = {
      'M': 'Monday',
      'T': 'Tuesday', 
      'W': 'Wednesday',
      'R': 'Thursday',
      'F': 'Friday',
      'S': 'Saturday',
      'U': 'Sunday'
    };

    if (days.length === 7) {
      return 'Every day of the week';
    } else if (days.length === 5 && days.includes('M') && days.includes('T') && days.includes('W') && days.includes('R') && days.includes('F')) {
      return 'Weekdays (Monday-Friday)';
    } else if (days.length === 2 && days.includes('S') && days.includes('U')) {
      return 'Weekends (Saturday-Sunday)';
    } else {
      return days.map(day => dayNames[day]).join(', ');
    }
  }

  /**
   * Gets the LaunchAgent execution time (1 minute after wake time)
   */
  private getLaunchAgentTime(wakeTime: string): string {
    const [hours, minutes, seconds] = wakeTime.split(':').map(Number);
    const launchMinutes = (minutes + 1) % 60;
    const launchHours = launchMinutes === 0 ? (hours + 1) % 24 : hours;
    return `${launchHours.toString().padStart(2, '0')}:${launchMinutes.toString().padStart(2, '0')}:00`;
  }

  /**
   * Helper methods
   */
  private async askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer);
      });
    });
  }

  private async askYesNo(question: string): Promise<boolean> {
    const answer = await this.askQuestion(`${question} (y/N): `);
    return answer.toLowerCase().startsWith('y');
  }

  private markAsConfigured(scheduleConfig: UserScheduleConfig): void {
    writeFileSync(this.CONFIG_FILE, JSON.stringify({
      configured: true,
      timestamp: new Date().toISOString(),
      wakeTime: scheduleConfig.wakeTime,
      daysOfWeek: scheduleConfig.daysOfWeek
    }, null, 2));
  }

  private clearConfigFile(): void {
    if (existsSync(this.CONFIG_FILE)) {
      try {
        unlinkSync(this.CONFIG_FILE);
      } catch (e) {
        // Ignore errors
      }
    }
  }

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
  const manager = new MacPowerManager();
  manager.run().catch((error) => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });
}

export default MacPowerManager;