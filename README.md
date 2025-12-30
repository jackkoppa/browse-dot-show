<p align="center">
  <a href="https://browse.show" target="_blank" rel="noopener noreferrer">
    <img width="120" src="http://browse.show/assets/favicon.svg" alt="browse.show logo">
  </a>
</p>

# [browse.show](https://browse.show) - transcribe & search any podcast

Search already-processed podcasts at [browse.show](https://browse.show)

Use this repo to deploy & host your own podcast search engine, for any number of shows 🚀
<br/>
<br/>
## Get Started

📖 See the [Getting Started Guide](docs/GETTING_STARTED.md) to host your own search engine.

🛠️ Follow the interactive Site Creator there, to get started with local development in a few minutes.

☁️ Local transcription & serverless architecture - including simple deployment to AWS - keep hosting costs low.

## Tool Management with Hermit

This project uses [Hermit](https://cashapp.github.io/hermit) to manage development tools (Node.js, pnpm) automatically. Hermit ensures everyone on the team uses the same tool versions.

**Quick setup:**

```bash
# Install Hermit
curl -fsSL https://github.com/cashapp/hermit/releases/download/stable/install.sh | /bin/bash

# Install shell hooks for automatic activation (recommended)
hermit shell-hooks

# Restart your shell, then cd into the project
# Tools will be automatically available!
```

**Alternative:** You can still use nvm and install pnpm separately if you prefer.
