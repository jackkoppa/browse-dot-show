#!/bin/bash

echo "🔍 Checking prerequisites for browse.show development..."
echo ""

# Check if Node.js is installed
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js is installed: $NODE_VERSION"
    NODE_OK=true
else
    echo "❌ Node.js is not installed"
    echo "   📖 We recommend using NVM (Node Version Manager)"
    echo "   🔗 Install NVM: https://github.com/nvm-sh/nvm#installation-and-update"
    echo "   💡 Then run: nvm install --lts && nvm use --lts"
    echo ""
    NODE_OK=false
fi

# Check if pnpm is installed
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo "✅ pnpm is installed: v$PNPM_VERSION"
    PNPM_OK=true
else
    echo "❌ pnpm is not installed"
    echo "   🍺 Install with Homebrew: brew install pnpm"
    echo "   📦 Or install with npm: npm install -g pnpm"
    echo "   🔗 More options: https://pnpm.io/installation"
    echo ""
    PNPM_OK=false
fi

echo ""

# Final result
if [ "$NODE_OK" = true ] && [ "$PNPM_OK" = true ]; then
    echo "🎉 All prerequisites are installed! You're ready to go."
    echo ""
    echo "📦 Next step: Install project dependencies"
    echo "   💻 Run: pnpm install"
    echo ""
else
    echo "⚠️  Please install the missing prerequisites above, then run:"
    echo "   💻 pnpm install"
    echo ""
fi 