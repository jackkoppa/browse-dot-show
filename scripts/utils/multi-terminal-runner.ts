#!/usr/bin/env tsx

/**
 * Multi-Terminal Runner - Proof of Concept
 * 
 * This POC demonstrates running multiple parallel processes in separate Terminal windows
 * with centralized progress monitoring and logging.
 * 
 * Features:
 * - Spawns N terminal windows with specified commands
 * - Each terminal writes structured progress logs
 * - Main terminal aggregates and displays overall progress
 * - Configurable update intervals
 * 
 * Usage: tsx scripts/utils/multi-terminal-runner.ts --processes=3 --interval=10
 */

import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ProcessConfig {
  id: string;
  command: string;
  args: string[];
  logFile: string;
  env?: Record<string, string>;
}

interface ProgressUpdate {
  processId: string;
  timestamp: string;
  type: 'START' | 'PROGRESS' | 'COMPLETE' | 'ERROR';
  message: string;
  data?: {
    totalMinutes?: number;
    completedMinutes?: number;
    percentComplete?: number;
    currentFile?: string;
  };
}

class MultiTerminalRunner {
  private processes: ProcessConfig[] = [];
  private logDir: string;
  private monitoringInterval: number;
  private isMonitoring = false;
  private startTime: number;
  private lastUpdateLines = 0;
  private isFirstUpdate = true;
  private updateCounter = 0;
  private readonly spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerInterval?: NodeJS.Timeout;
  private lastProgressData: any = null;

  constructor(
    private numProcesses: number,
    updateIntervalSeconds: number = 10
  ) {
    this.monitoringInterval = updateIntervalSeconds * 1000;
    this.logDir = path.join(os.tmpdir(), 'multi-terminal-runner', Date.now().toString());
    this.startTime = Date.now();
    this.setupLogDirectory();
  }

  private setupLogDirectory(): void {
    fs.mkdirSync(this.logDir, { recursive: true });
    console.log(`📁 Log directory: ${this.logDir}`);
  }

  /**
   * Platform-specific terminal spawning
   */
  private async spawnTerminalWindow(config: ProcessConfig): Promise<void> {
    const platform = os.platform();
    
    switch (platform) {
      case 'darwin':
        await this.spawnMacOSTerminal(config);
        break;
      case 'linux':
        // TODO: Implement Linux support using gnome-terminal, xterm, or konsole
        throw new Error('Linux support not yet implemented');
      case 'win32':
        // TODO: Implement Windows support using cmd or PowerShell
        throw new Error('Windows support not yet implemented');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * macOS-specific terminal spawning using osascript (AppleScript)
   */
  private async spawnMacOSTerminal(config: ProcessConfig): Promise<void> {
    // Create environment variable exports
    const envExports = config.env ? 
      Object.entries(config.env).map(([key, value]) => `export ${key}="${value}"`).join('; ') + '; ' : '';
    
    // Create the command - much simpler now that we're using script files
    const baseCommand = `${config.command} ${config.args.join(' ')}`;
    const commandWithTee = `${baseCommand} 2>&1 | tee "${config.logFile}"`;
    const fullCommand = `${envExports}${commandWithTee}`;
    
    // Escape the command for AppleScript (only need to escape quotes and backslashes)
    const escapedCommand = fullCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    // Create a temporary AppleScript file to avoid command line escaping issues
    const appleScriptContent = `
tell application "Terminal"
  activate
  set newTab to do script "${escapedCommand}"
  set custom title of newTab to "Process ${config.id}"
end tell
    `.trim();
    
    const appleScriptFile = path.join(this.logDir, `${config.id}-launch.scpt`);
    fs.writeFileSync(appleScriptFile, appleScriptContent);

    try {
      await execAsync(`osascript "${appleScriptFile}"`);
      console.log(`✅ Launched terminal window for process ${config.id}`);
      
      // Clean up the AppleScript file
      fs.unlinkSync(appleScriptFile);
    } catch (error) {
      console.error(`❌ Failed to launch terminal for process ${config.id}:`, error);
      throw error;
    }
  }

  /**
   * Create process configurations for the POC
   */
  private createProcessConfigs(): ProcessConfig[] {
    const configs: ProcessConfig[] = [];
    
    for (let i = 1; i <= this.numProcesses; i++) {
      const processId = `proc-${i}`;
      const logFile = path.join(this.logDir, `${processId}.log`);
      const scriptFile = path.join(this.logDir, `${processId}-script.js`);
      
      // Write the mock script to a temporary file
      fs.writeFileSync(scriptFile, this.createMockScript(processId, logFile));
      
      // POC: Execute the script file instead of inline code
      configs.push({
        id: processId,
        command: 'node',
        args: [scriptFile],
        logFile,
        env: {
          PROCESS_ID: processId,
          LOG_FILE: logFile,
          NODE_OPTIONS: '--max-old-space-size=8192'
        }
      });
    }
    
    return configs;
  }

  /**
   * Create a mock script that simulates audio processing with progress logging
   */
  private createMockScript(processId: string, logFile: string): string {
    return `
const fs = require('fs');
const path = require('path');

const processId = '${processId}';
const logFile = '${logFile}';
const totalMinutes = Math.floor(Math.random() * 120) + 60; // 60-180 minutes
let completedMinutes = 0;

function writeProgressLog(type, message, data = {}) {
  const entry = {
    processId,
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };
  
  // Write to log file (append mode)
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\\n');
  
  // Also write to stdout for terminal display
  console.log(\`[\${processId}] \${type}: \${message}\`);
  if (data.percentComplete !== undefined) {
    console.log(\`  Progress: \${data.percentComplete.toFixed(1)}% (\${data.completedMinutes}/\${data.totalMinutes} minutes)\`);
  }
}

// Simulate audio processing
writeProgressLog('START', \`Starting audio processing for \${totalMinutes} minutes of audio\`, {
  totalMinutes,
  completedMinutes: 0,
  percentComplete: 0
});

const interval = setInterval(() => {
  completedMinutes += Math.floor(Math.random() * 5) + 1; // Process 1-5 minutes per cycle
  
  if (completedMinutes >= totalMinutes) {
    completedMinutes = totalMinutes;
    clearInterval(interval);
    
    writeProgressLog('COMPLETE', 'Audio processing completed!', {
      totalMinutes,
      completedMinutes,
      percentComplete: 100
    });
    
    process.exit(0);
  } else {
    const percentComplete = (completedMinutes / totalMinutes) * 100;
    writeProgressLog('PROGRESS', \`Processing audio chunk \${Math.floor(completedMinutes/5) + 1}\`, {
      totalMinutes,
      completedMinutes,
      percentComplete,
      currentFile: \`episode-\${Math.floor(Math.random() * 100)}.mp3\`
    });
  }
}, 2000 + Math.random() * 1000); // 2-3 seconds per chunk

// Handle cleanup
process.on('SIGINT', () => {
  writeProgressLog('ERROR', 'Process interrupted');
  process.exit(1);
});
    `;
  }

  /**
   * Start all processes
   */
  async startProcesses(): Promise<void> {
    console.log(`🚀 Starting ${this.numProcesses} parallel processes...`);
    
    this.processes = this.createProcessConfigs();
    
    // Launch all terminal windows
    for (const config of this.processes) {
      await this.spawnTerminalWindow(config);
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ All ${this.numProcesses} terminal windows launched!`);
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Monitor progress from all processes
   */
  private startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log(`📊 Starting progress monitoring (data updates every ${this.monitoringInterval/1000}s, spinner every 0.5s)...`);
    console.log('Press Ctrl+C to stop monitoring and exit');
    
    // Initial full update
    this.updateProgress();
    
    // Fast spinner updates (500ms) - lightweight
    this.spinnerInterval = setInterval(() => {
      this.updateSpinnerOnly();
    }, 500);
    
    // Slower full progress updates (user-defined interval) - heavy
    const monitorInterval = setInterval(() => {
      this.updateProgress();
    }, this.monitoringInterval);

    // Handle cleanup
    process.on('SIGINT', () => {
      // Move cursor down past the current display before showing exit message
      process.stdout.write('\n'.repeat(Math.max(1, this.lastUpdateLines + 1)));
      console.log('🛑 Stopping monitoring...');
      if (this.spinnerInterval) clearInterval(this.spinnerInterval);
      clearInterval(monitorInterval);
      this.isMonitoring = false;
      this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Clear previous progress display
   */
  private clearPreviousUpdate(): void {
    if (!this.isFirstUpdate && this.lastUpdateLines > 0) {
      // Move cursor up and clear each line
      for (let i = 0; i < this.lastUpdateLines; i++) {
        process.stdout.write('\x1b[1A\x1b[K'); // Move up one line and clear it
      }
    }
  }

  /**
   * Write a line and count it
   */
  private writeLine(text: string): void {
    process.stdout.write(text + '\n');
    this.lastUpdateLines++;
  }

  /**
   * Lightweight spinner-only update (no file I/O)
   */
  private updateSpinnerOnly(): void {
    // Only update if we have previous progress data to reuse
    if (!this.lastProgressData) return;
    
    // Clear previous display
    this.clearPreviousUpdate();
    this.lastUpdateLines = 0;
    
    // Update spinner counter for animation
    this.updateCounter++;
    const spinner = this.spinnerFrames[this.updateCounter % this.spinnerFrames.length];
    
    // Redraw the display with updated spinner and time, but same progress data
    this.writeLine('='.repeat(80));
    this.writeLine(`${spinner} Progress Update - ${new Date().toLocaleTimeString()}`);
    this.writeLine(`⏱️  Total runtime: ${Math.floor((Date.now() - this.startTime) / 1000)}s`);
    this.writeLine('='.repeat(80));
    
    // Reuse cached process data
    for (const processData of this.lastProgressData.processes) {
      this.writeLine(`  ${processData.id}: ${processData.display}`);
    }
    
    // Reuse cached overall progress
    this.writeLine('='.repeat(80));
    this.writeLine(`🎯 OVERALL PROGRESS: ${this.lastProgressData.overallPercent}% (${this.lastProgressData.completedMinutes}/${this.lastProgressData.totalMinutes} total minutes)`);
    this.writeLine(`📈 Status: ${this.lastProgressData.completedProcesses} completed, ${this.lastProgressData.activeProcesses} active, ${this.lastProgressData.pendingProcesses} pending`);
    this.writeLine(`📊 [${this.lastProgressData.progressBar}] ${this.lastProgressData.overallPercent}%`);
  }

  /**
   * Read and aggregate progress from all log files
   */
  private updateProgress(): void {
    // Clear previous update (except for the first one)
    this.clearPreviousUpdate();
    this.lastUpdateLines = 0;

    const allProgress: ProgressUpdate[] = [];
    let totalMinutes = 0;
    let completedMinutes = 0;
    let completedProcesses = 0;
    let activeProcesses = 0;
    const processDisplayData: Array<{id: string, display: string}> = [];

    // Add initial spacing only for first update
    if (this.isFirstUpdate) {
      this.writeLine('');
    }
    
    // Add animated spinner to show activity
    const spinner = this.spinnerFrames[this.updateCounter % this.spinnerFrames.length];
    this.updateCounter++;
    
    this.writeLine('='.repeat(80));
    this.writeLine(`${spinner} Progress Update - ${new Date().toLocaleTimeString()}`);
    this.writeLine(`⏱️  Total runtime: ${Math.floor((Date.now() - this.startTime) / 1000)}s`);
    this.writeLine('='.repeat(80));

    for (const config of this.processes) {
      try {
        if (fs.existsSync(config.logFile)) {
          const logContent = fs.readFileSync(config.logFile, 'utf8');
          const logLines = logContent.trim().split('\n').filter(line => line);
          
          let processTotal = 0;
          let processCompleted = 0;
          let processStatus = 'UNKNOWN';
          let lastMessage = 'No activity';

          // Parse all log entries for this process
          for (const line of logLines) {
            try {
              const entry: ProgressUpdate = JSON.parse(line);
              allProgress.push(entry);
              
              if (entry.data?.totalMinutes) processTotal = entry.data.totalMinutes;
              if (entry.data?.completedMinutes) processCompleted = entry.data.completedMinutes;
              processStatus = entry.type;
              lastMessage = entry.message;
            } catch (e) {
              // Skip invalid JSON lines
            }
          }

          totalMinutes += processTotal;
          completedMinutes += processCompleted;
          
          if (processStatus === 'COMPLETE') {
            completedProcesses++;
          } else if (processStatus === 'START' || processStatus === 'PROGRESS') {
            activeProcesses++;
          }

          const processPercent = processTotal > 0 ? (processCompleted / processTotal) * 100 : 0;
          const displayText = `${processPercent.toFixed(1)}% (${processCompleted}/${processTotal}min) - ${lastMessage}`;
          this.writeLine(`  ${config.id}: ${displayText}`);
          processDisplayData.push({ id: config.id, display: displayText });
        } else {
          const displayText = '⏳ Waiting for log file...';
          this.writeLine(`  ${config.id}: ${displayText}`);
          processDisplayData.push({ id: config.id, display: displayText });
        }
      } catch (error) {
        const displayText = '❌ Error reading logs';
        this.writeLine(`  ${config.id}: ${displayText}`);
        processDisplayData.push({ id: config.id, display: displayText });
      }
    }

    // Overall summary
    const overallPercent = totalMinutes > 0 ? (completedMinutes / totalMinutes) * 100 : 0;
    const pendingProcesses = this.numProcesses - completedProcesses - activeProcesses;
    
    // Progress bar
    const barLength = 50;
    const filledLength = Math.floor((overallPercent / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    this.writeLine('='.repeat(80));
    this.writeLine(`🎯 OVERALL PROGRESS: ${overallPercent.toFixed(1)}% (${completedMinutes}/${totalMinutes} total minutes)`);
    this.writeLine(`📈 Status: ${completedProcesses} completed, ${activeProcesses} active, ${pendingProcesses} pending`);
    this.writeLine(`📊 [${bar}] ${overallPercent.toFixed(1)}%`);

    // Cache progress data for lightweight spinner updates
    this.lastProgressData = {
      processes: processDisplayData,
      overallPercent: overallPercent.toFixed(1),
      completedMinutes,
      totalMinutes,
      completedProcesses,
      activeProcesses,
      pendingProcesses,
      progressBar: bar
    };

    // Mark that we've completed the first update
    this.isFirstUpdate = false;

    if (completedProcesses === this.numProcesses) {
      // Stop the spinner updates
      if (this.spinnerInterval) {
        clearInterval(this.spinnerInterval);
        this.spinnerInterval = undefined;
      }
      
      // Move cursor down and add final message
      process.stdout.write('\n');
      console.log('🎉 All processes completed!');
      this.cleanup();
      process.exit(0);
    }
  }

  /**
   * Clean up temporary files
   */
  private cleanup(): void {
    try {
      if (fs.existsSync(this.logDir)) {
        fs.rmSync(this.logDir, { recursive: true, force: true });
        console.log('🧹 Cleaned up temporary files (logs, scripts, etc.)');
      }
    } catch (error) {
      console.warn('⚠️  Failed to clean up log directory:', error);
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  let numProcesses = 3;
  let updateInterval = 10;
  
  for (const arg of args) {
    if (arg.startsWith('--processes=')) {
      numProcesses = parseInt(arg.split('=')[1]) || 3;
    } else if (arg.startsWith('--interval=')) {
      updateInterval = parseInt(arg.split('=')[1]) || 10;
    }
  }

  // Validate arguments
  if (numProcesses < 1 || numProcesses > 10) {
    console.error('❌ Number of processes must be between 1 and 10');
    process.exit(1);
  }

  if (updateInterval < 1 || updateInterval > 60) {
    console.error('❌ Update interval must be between 1 and 60 seconds');
    process.exit(1);
  }

  console.log('🔧 Multi-Terminal Runner - Proof of Concept');
  console.log('='.repeat(50));
  console.log(`📊 Processes: ${numProcesses}`);
  console.log(`⏱️  Data refresh: ${updateInterval}s, Spinner: 0.5s`);
  console.log(`💻 Platform: ${os.platform()}`);
  console.log('='.repeat(50));

  const runner = new MultiTerminalRunner(numProcesses, updateInterval);
  
  try {
    await runner.startProcesses();
  } catch (error) {
    console.error('❌ Failed to start processes:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MultiTerminalRunner, type ProcessConfig, type ProgressUpdate };