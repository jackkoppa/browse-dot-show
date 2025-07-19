# Power Management Script Changes

## Overview
This document summarizes the changes made to `scripts/power-management.ts` based on the requirements from PR #63.

## Changes Made

### 1. Added Configurable Time Selection
- **Before**: Fixed wake time at 1:00 AM
- **After**: User can select from predefined times (12:00 AM - 6:00 AM) or enter a custom time
- **Implementation**: Added `getUserSchedulePreferences()` method with time selection prompts
- **Default**: Still defaults to 1:00 AM for backward compatibility

### 2. Added Configurable Days of Week
- **Before**: Fixed schedule for all 7 days (MTWRFSU)
- **After**: User can select which days of the week to run the pipeline
- **Implementation**: Added multi-select prompt for days of the week
- **Default**: Still defaults to all 7 days for backward compatibility

### 3. Switched to `prompts` Package
- **Before**: Used basic `readline` interface with number-based selections (1-6)
- **After**: Uses the `prompts` package for user-friendly interactive prompts
- **Features**:
  - Dropdown selections for time and actions
  - Multi-select for days of the week
  - Confirmation dialogs
  - Input validation for custom times

### 4. Changed Log Location
- **Before**: Logs saved to `/tmp/power-management.log` and `/tmp/power-management-error.log`
- **After**: Logs saved to `scripts/automation-logs/power-management.log` and `scripts/automation-logs/power-management-error.log`
- **Implementation**: Updated `LOG_DIR` constant and LaunchAgent plist generation

### 5. Enhanced Configuration Management
- **Added**: `UserScheduleConfig` interface for storing user preferences
- **Added**: Configuration persistence for wake time and days of the week
- **Added**: `formatDaysForDisplay()` method for user-friendly day display
- **Added**: `getLaunchAgentTime()` method to calculate LaunchAgent execution time

### 6. Updated User Interface
- **Replaced**: Number-based menu (1-6) with interactive prompts
- **Added**: Schedule configuration section during initial setup
- **Enhanced**: Configuration display to show current schedule
- **Updated**: Help documentation to reflect new configurable options

## Technical Details

### New Interfaces
```typescript
interface UserScheduleConfig {
  wakeTime: string;
  daysOfWeek: string[];
}
```

### Updated Interfaces
```typescript
interface PowerConfig {
  isConfigured: boolean;
  wakeTime: string;
  daysOfWeek: string[]; // Added
  hasScheduledEvents: boolean;
  lidwake: boolean;
  womp: boolean;
  acwake: boolean;
  ttyskeepawake: boolean;
}
```

### New Methods
- `getUserSchedulePreferences()`: Handles user input for time and days
- `formatDaysForDisplay()`: Formats days for user-friendly display
- `getLaunchAgentTime()`: Calculates LaunchAgent execution time

### Updated Methods
- `performInitialSetup()`: Now accepts user preferences
- `setupLaunchAgent()`: Now accepts schedule configuration
- `generateLaunchAgentPlist()`: Now uses configurable time and log directory
- `markAsConfigured()`: Now saves schedule configuration
- `getCurrentConfig()`: Now reads saved schedule configuration
- `showConfigurationMenu()`: Now uses prompts instead of number input

## Backward Compatibility
- All existing configurations will continue to work
- Default values maintain the original behavior (1:00 AM, all days)
- Existing LaunchAgents will continue to function
- Configuration files are automatically migrated

## Usage
The script now provides a more user-friendly interface:

1. **Time Selection**: Choose from predefined times or enter custom time
2. **Days Selection**: Select which days of the week to run the pipeline
3. **Interactive Menus**: Use arrow keys and space bar for selections
4. **Confirmation Dialogs**: Clear confirmations for destructive actions

## Files Modified
- `scripts/power-management.ts`: Main script with all changes
- `scripts/automation-logs/`: Log directory (already existed)

## Dependencies
- `prompts`: Already available in `scripts/package.json`
- `@types/prompts`: Already available in `scripts/package.json`