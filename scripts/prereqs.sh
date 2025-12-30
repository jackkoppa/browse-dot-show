#!/bin/bash

echo "🔍 Checking prerequisites for browse.show development..."
echo ""

# Check if Hermit is installed
if command -v hermit &> /dev/null; then
    HERMIT_VERSION=$(hermit version 2>/dev/null || echo "unknown")
    echo "✅ Hermit is installed: $HERMIT_VERSION"
    echo "   🐚 Hermit manages Node.js and pnpm for this project"
    HERMIT_OK=true
    
    # Check if in Hermit environment
    if [ -n "$HERMIT_ENV" ]; then
        echo "   ✅ Hermit environment is active"
    else
        echo "   💡 Activate with: . bin/activate-hermit"
        echo "   🔧 Or install shell hooks for auto-activation: hermit shell-hooks"
    fi
    echo ""
else
    echo "⚠️  Hermit is not installed (recommended)"
    echo "   🐚 Hermit provides automatic tool management for this project"
    echo "   🔗 Install: curl -fsSL https://github.com/cashapp/hermit/releases/download/stable/install.sh | /bin/bash"
    echo "   📖 Learn more: https://cashapp.github.io/hermit"
    echo ""
    HERMIT_OK=false
fi

# Check if Node.js is installed (fallback if not using Hermit)
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js is installed: $NODE_VERSION"
    NODE_OK=true
else
    echo "❌ Node.js is not installed"
    if [ "$HERMIT_OK" = true ]; then
        echo "   💡 Activate Hermit environment: . bin/activate-hermit"
    else
        echo "   📖 Alternative: Use NVM (Node Version Manager)"
        echo "   🔗 Install NVM: https://github.com/nvm-sh/nvm#installation-and-update"
        echo "   💡 Then run: nvm install --lts && nvm use --lts"
    fi
    echo ""
    NODE_OK=false
fi

# Check if pnpm is installed (fallback if not using Hermit)
if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo "✅ pnpm is installed: v$PNPM_VERSION"
    PNPM_OK=true
else
    echo "❌ pnpm is not installed"
    if [ "$HERMIT_OK" = true ]; then
        echo "   💡 Activate Hermit environment: . bin/activate-hermit"
    else
        echo "   🍺 Install with Homebrew: brew install pnpm"
        echo "   📦 Or install with npm: npm install -g pnpm"
        echo "   🔗 More options: https://pnpm.io/installation"
    fi
    echo ""
    PNPM_OK=false
fi

echo ""

# Final result
if [ "$NODE_OK" = true ] && [ "$PNPM_OK" = true ]; then
    echo "🎉 All prerequisites are installed! You're ready to go."
    echo ""
    if [ "$HERMIT_OK" = true ] && [ -z "$HERMIT_ENV" ]; then
        echo "💡 Tip: Install Hermit shell hooks for automatic environment activation:"
        echo "   🔧 Run: hermit shell-hooks"
        echo ""
    fi
    echo "📦 Next step: Install project dependencies"
    echo "   💻 Run: pnpm i && pnpm all:build"
    echo ""
else
    echo "⚠️  Please install the missing prerequisites above, then run:"
    echo "   💻 pnpm i && pnpm all:build"
    echo ""
fi 