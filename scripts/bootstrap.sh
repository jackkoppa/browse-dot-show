#!/usr/bin/env bash
#
# One-time setup of a Mac for browse.show: Homebrew packages (Brewfile), pnpm via
# Corepack, workspace dependencies and the build. Safe to re-run.
#
#   ./scripts/bootstrap.sh
#
# Then: pnpm bds setup machine   (local files, whisper model, env files, checks)
#
# Needs Homebrew (https://brew.sh) and the Xcode command line tools (which include git).

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "❌ bootstrap.sh is for macOS. On other systems, install Node 22, ffmpeg, the AWS CLI and whisper.cpp yourself (docs/local-development.md)."
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "⚠️  This isn't an Apple silicon Mac; local transcription will be slow."
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "❌ Homebrew not found. Install it from https://brew.sh, then re-run this script."
  exit 1
fi

echo "📦 Installing Homebrew packages (Brewfile)…"
brew bundle --file=Brewfile

# Use Homebrew's node@22 for the rest of this script, whatever node the shell has
SHELL_NODE="$(command -v node || true)"
NODE_BIN="$(brew --prefix node@22)/bin"
export PATH="$NODE_BIN:$PATH"
echo "✅ node $(node --version) ($NODE_BIN/node)"

echo "📦 Enabling pnpm via Corepack…"
if ! command -v corepack >/dev/null 2>&1; then
  npm install --global corepack
fi
corepack enable
echo "✅ pnpm $(pnpm --version)"

echo "📦 Installing workspace dependencies…"
pnpm install --frozen-lockfile

echo "🔨 Building packages…"
pnpm all:build

echo
echo "✅ Bootstrap done."
if [[ "$SHELL_NODE" != "$NODE_BIN/node" ]]; then
  echo
  echo "Your shell uses a different node (${SHELL_NODE:-none}); that's fine for development (.nvmrc). To use Homebrew's node@22 by default instead, add this to ~/.zprofile:"
  echo "  export PATH=\"$NODE_BIN:\$PATH\""
fi
echo
echo "Next: pnpm bds setup machine"
