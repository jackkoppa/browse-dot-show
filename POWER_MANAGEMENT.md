# Mac Power Management for Ingestion Pipeline

This system configures your Mac to automatically wake up at 1:00 AM daily, run the ingestion pipeline, and return to sleep/off state. It works reliably whether your MacBook lid is open or closed.

## Quick Start

```bash
# Run the interactive setup (requires sudo)
sudo pnpm run power:manage
```

## What It Does

### Automatic Scheduling
- **Wakes your Mac at 1:00 AM daily** using `pmset` system scheduling
- **Runs the ingestion pipeline** via a LaunchAgent
- **Returns to previous power state** (sleep or shutdown) after completion

### Power-Aware Operation
- **AC Power**: Always runs the pipeline
- **Battery Power**: Only runs if battery > 50%
- **Low Battery**: Skips pipeline and returns to sleep/off immediately

### Lid-Closed Support
- **Works with MacBook lid closed** thanks to `lidwake=1` configuration
- **Reliable wake scheduling** regardless of lid position
- **Proper sleep/wake behavior** for both open and closed lid scenarios

## System Requirements

- **macOS only** (uses `pmset` and LaunchAgent)
- **Sudo privileges** required for power management configuration
- **Node.js and pnpm** for running the TypeScript scripts

## How It Works

### 1. Power Management Configuration
The script configures several `pmset` settings for reliable operation:

```bash
pmset -a lidwake 1          # Wake when lid opened (enables scheduled wake)
pmset -a acwake 0           # Don't wake on power source changes
pmset -c womp 1             # Enable Wake-on-LAN when on AC power
pmset -a ttyskeepawake 1    # Stay awake during SSH sessions
```

### 2. Wake Scheduling
Creates a daily wake schedule:

```bash
pmset repeat wakeorpoweron MTWRFSU 01:00:00
```

This tells your Mac to wake up or power on at 1:00 AM every day of the week.

### 3. Automatic Execution
A LaunchAgent is created at:
```
~/Library/LaunchAgents/com.browse-dot-show.power-management.plist
```

This LaunchAgent runs at 1:01 AM (one minute after wake) to:
- Check power source and battery level
- Run the ingestion pipeline if conditions are met
- Return the system to its previous power state

## Usage

### Initial Setup
```bash
sudo pnpm run power:manage
```

On first run, you'll see:
1. Current configuration status
2. Guided setup process
3. Configuration of power settings and scheduling

### Subsequent Runs
```bash
sudo pnpm run power:manage
```

Shows current configuration and options:
1. Keep current configuration
2. Clear all scheduling
3. Reconfigure from scratch
4. Test pipeline manually
5. View recent pipeline run history
6. Show detailed help

### Manual Pipeline Test
You can test the pipeline without affecting power states:
```bash
sudo pnpm run power:manage
# Choose option 4 from the menu
```

### Pipeline Run History
Every pipeline execution is automatically logged to `ingestion-pipeline-runs.md` with:
- **Timestamp and duration** of each run
- **Sites processed** and success rates
- **Files uploaded/downloaded** statistics  
- **Error details** if any occurred
- **Most recent runs first** for easy monitoring

View recent runs:
```bash
sudo pnpm run power:manage
# Choose option 5 from the menu
```

## Configuration Details

### Files Created/Modified

#### System Files (via pmset)
- `/Library/Preferences/SystemConfiguration/com.apple.PowerManagement.plist`
- `/Library/Preferences/SystemConfiguration/com.apple.AutoWake.plist`

#### Project Files
- `.power-management-config` - Tracks configuration state
- `~/Library/LaunchAgents/com.browse-dot-show.power-management.plist` - LaunchAgent

#### Log Files
- `/tmp/power-management.log` - Execution logs
- `/tmp/power-management-error.log` - Error logs
- `ingestion-pipeline-runs.md` - Pipeline execution history (git-ignored)

### Power Settings Applied

| Setting | Value | Purpose |
|---------|--------|---------|
| `lidwake` | 1 | Enable wake when lid opened (required for scheduled wake) |
| `acwake` | 0 | Disable wake on power source changes (prevents unwanted wakes) |
| `womp` | 1 | Enable Wake-on-LAN when on AC power (useful for remote management) |
| `ttyskeepawake` | 1 | Prevent sleep during SSH sessions |

## Behavior Matrix

| Power Source | Battery Level | Action |
|--------------|---------------|---------|
| AC Power | Any | ✅ Run pipeline, return to previous state |
| Battery | > 50% | ✅ Run pipeline, return to previous state |
| Battery | ≤ 50% | ❌ Skip pipeline, return to sleep/off immediately |

| Previous State | After Pipeline | Action |
|----------------|----------------|---------|
| Powered Off | Completed | `shutdown -h now` |
| Sleeping | Completed | `pmset sleepnow` |

## Troubleshooting

### Mac Doesn't Wake at Scheduled Time

1. **Check scheduled events:**
   ```bash
   pmset -g sched
   ```

2. **Verify lid wake setting:**
   ```bash
   pmset -g | grep lidwake
   ```
   Should show `lidwake 1`

3. **Check system logs:**
   ```bash
   log show --predicate 'subsystem == "com.apple.powermanagement"' --last 1d
   ```

### Pipeline Doesn't Run After Wake

1. **Check LaunchAgent status:**
   ```bash
   launchctl list | grep com.browse-dot-show.power-management
   ```

2. **View execution logs:**
   ```bash
   tail -f /tmp/power-management.log
   ```

3. **Check error logs:**
   ```bash
   cat /tmp/power-management-error.log
   ```

### Manual Commands

```bash
# Check current power settings
pmset -g

# Check scheduled events  
pmset -g sched

# Check power source and battery
pmset -g ps

# Clear all scheduled events
sudo pmset repeat cancel

# Test LaunchAgent manually
launchctl start com.browse-dot-show.power-management
```

## Uninstalling

To completely remove power management:

```bash
# Run the management script
sudo pnpm run power:manage

# Choose option 2: "Clear all power management scheduling"
```

Or manually:

```bash
# Clear pmset schedule
sudo pmset repeat cancel

# Remove LaunchAgent
launchctl unload ~/Library/LaunchAgents/com.browse-dot-show.power-management.plist
rm ~/Library/LaunchAgents/com.browse-dot-show.power-management.plist

# Remove config file
rm .power-management-config
```

## Security Considerations

- **Sudo required**: Power management requires root privileges
- **Local execution**: All scripts run locally, no network dependencies
- **Log files**: May contain system information, stored in `/tmp/`
- **LaunchAgent**: Runs with user privileges, not root

## Limitations

- **macOS only**: Uses macOS-specific `pmset` and LaunchAgent
- **Fixed schedule**: Currently hardcoded to 1:00 AM (future: configurable)
- **Single pipeline**: Designed for one ingestion pipeline per machine
- **User session**: LaunchAgent requires user to be logged in

## Future Enhancements

- [ ] Configurable wake times
- [ ] Multiple pipeline support  
- [ ] Email notifications on completion/failure
- [ ] Integration with calendar systems
- [ ] Remote monitoring capabilities
- [ ] Battery health considerations

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review log files in `/tmp/`
3. Run `sudo pnpm run power:manage` to check configuration
4. Consult `man pmset` for low-level power management details