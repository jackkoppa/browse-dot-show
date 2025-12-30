# Hermit Environment for browse.show

This is a [Hermit](https://github.com/cashapp/hermit) bin directory.

## What is Hermit?

Hermit is a tool manager that ensures everyone working on this project uses the exact same versions of Node.js, pnpm, and other development tools. It's like nvm and Corepack combined, but better.

## How It Works

The symlinks in this directory are managed by Hermit and will automatically download and install packages when needed. These packages are:

- **Project-scoped**: Only available in this project, no global installs
- **Version-locked**: Everyone gets the same versions (Node.js 20.x, pnpm 10.15.1)
- **Cached globally**: Downloaded once, shared across all your Hermit projects

## Current Tools

This project uses:

- **Node.js**: v20.19.6 (via `node@20` channel - auto-updates to latest v20.x)
- **pnpm**: v10.15.1 (locked version)

## Getting Started

### 1. Install Hermit

```bash
curl -fsSL https://github.com/cashapp/hermit/releases/download/stable/install.sh | /bin/bash
```

### 2. Install Shell Hooks (Recommended)

Shell hooks automatically activate the environment when you `cd` into this directory:

```bash
# For Zsh (macOS default)
hermit shell-hooks --zsh

# For Bash
hermit shell-hooks --bash

# For Fish
hermit shell-hooks --fish
```

After installing shell hooks, restart your shell.

### 3. Use the Project

**With shell hooks:**

```bash
cd browse-dot-show  # Environment activates automatically!
node --version      # v20.19.6
pnpm --version      # 10.15.1
```

**Without shell hooks:**

```bash
. bin/activate-hermit  # Manual activation
node --version
pnpm --version
deactivate-hermit      # When done
```

## Managing Packages

```bash
# List installed packages
hermit list

# Update packages (respects version constraints)
hermit update

# Search for available packages
hermit search <name>

# Install a new package
hermit install <package>
```

## Troubleshooting

### Tools not found

If `node` or `pnpm` commands aren't found:

1. Make sure you've activated the environment: `. bin/activate-hermit`
2. Or install shell hooks for automatic activation: `hermit shell-hooks`

### Wrong versions

If you see different versions than expected:

```bash
hermit list  # Check installed versions
hermit update  # Update to latest within constraints
```

## Learn More

- [Hermit Documentation](https://cashapp.github.io/hermit)
- [Hermit GitHub](https://github.com/cashapp/hermit)
- [Project Documentation](../docs/local-development.md)
