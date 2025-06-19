#!/usr/bin/env tsx

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LoggerOptions {
  level: LogLevel;
  includeTimestamp: boolean;
  colorize: boolean;
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

class Logger {
  private options: LoggerOptions;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      level: LogLevel.INFO,
      includeTimestamp: false,
      colorize: true,
      ...options
    };
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    let formatted = message;
    
    if (args.length > 0) {
      formatted = `${message} ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ')}`;
    }

    if (this.options.includeTimestamp) {
      const timestamp = new Date().toISOString();
      formatted = `[${timestamp}] ${formatted}`;
    }

    if (this.options.colorize) {
      switch (level) {
        case LogLevel.DEBUG:
          formatted = `${colors.gray}${formatted}${colors.reset}`;
          break;
        case LogLevel.INFO:
          formatted = `${colors.blue}${formatted}${colors.reset}`;
          break;
        case LogLevel.WARN:
          formatted = `${colors.yellow}${formatted}${colors.reset}`;
          break;
        case LogLevel.ERROR:
          formatted = `${colors.red}${formatted}${colors.reset}`;
          break;
      }
    }

    return formatted;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level < this.options.level) {
      return;
    }

    const formatted = this.formatMessage(level, message, ...args);
    
    if (level >= LogLevel.ERROR) {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  setLevel(level: LogLevel): void {
    this.options.level = level;
  }
}

// Default logger instance
const defaultLogger = new Logger();

// Convenience functions for emoji-enhanced logging
export function logSuccess(message: string, ...args: any[]): void {
  console.log(`${colors.green}✅ ${message}${colors.reset}`, ...args);
}

export function logError(message: string, ...args: any[]): void {
  console.error(`${colors.red}❌ ${message}${colors.reset}`, ...args);
}

export function logWarning(message: string, ...args: any[]): void {
  console.warn(`${colors.yellow}⚠️  ${message}${colors.reset}`, ...args);
}

export function logInfo(message: string, ...args: any[]): void {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`, ...args);
}

export function logDebug(message: string, ...args: any[]): void {
  console.log(`${colors.gray}🐛 ${message}${colors.reset}`, ...args);
}

export function logStep(message: string, ...args: any[]): void {
  console.log(`${colors.cyan}🔧 ${message}${colors.reset}`, ...args);
}

export function logProgress(message: string, ...args: any[]): void {
  console.log(`${colors.magenta}🚀 ${message}${colors.reset}`, ...args);
}

export function logHeader(message: string): void {
  const separator = '='.repeat(Math.max(50, message.length + 4));
  console.log(`\n${colors.bold}${colors.cyan}${separator}`);
  console.log(`  ${message}`);
  console.log(`${separator}${colors.reset}\n`);
}

export function logSubHeader(message: string): void {
  console.log(`\n${colors.bold}${colors.blue}📋 ${message}${colors.reset}`);
}

export function logSeparator(): void {
  console.log(`${colors.gray}${'─'.repeat(50)}${colors.reset}`);
}

// Print functions for compatibility with bash script patterns
export function printInfo(message: string, ...args: any[]): void {
  logInfo(message, ...args);
}

export function printError(message: string, ...args: any[]): void {
  logError(message, ...args);
}

export function printWarning(message: string, ...args: any[]): void {
  logWarning(message, ...args);
}

export function printSuccess(message: string, ...args: any[]): void {
  logSuccess(message, ...args);
}

/**
 * Setup stdin for interactive mode
 */
export function setupInteractiveMode(): void {
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
}

/**
 * Cleanup stdin after interactive mode
 */
export function cleanupInteractiveMode(): void {
  if (process.stdin.setRawMode) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}



// Export the Logger class and default instance
export { Logger };
export const logger = defaultLogger; 