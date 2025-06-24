# browse.show

### 📝🔍🎙️ transcribe & search any podcast

Deploy your own podcast archive and search engine
<br/>
<br/>
## 🚀 Get Started

See the [Getting Started Guide](docs/GETTING_STARTED.md) for full setup instructions

## 🏠 Homepage Deployment

This repository includes both individual podcast sites and a main homepage at [browse.show](https://browse.show).

### Quick Homepage Deployment

```bash
# Bootstrap Terraform state (one-time setup)
pnpm homepage:bootstrap-state

# Deploy homepage to browse.show
pnpm homepage:deploy
```

### Architecture

- **Sites**: Individual podcast search engines at `{podcast}.browse.show`
- **Homepage**: Landing page with universal search at `browse.show`
- **Infrastructure**: Completely separate Terraform setups for simplicity

See [terraform-homepage/README.md](terraform-homepage/README.md) for detailed homepage deployment documentation.
