# browse.show - Getting Started

### 📝🔍🎙️ transcribe & search any podcast

Deploy your own podcast archive and search engine in minutes with our interactive setup wizard.

## 🚀 Quick Start

### 1. Fork & Clone

```bash
# Fork this repository (recommended for version control)
# Then clone your fork:
git clone <your-fork-url>
cd browse-dot-show
pnpm install
```

### 2. Create Your Site

```bash
# Run the interactive site creation wizard
pnpm run site:create
```

That's it! The interactive wizard will:
- Ask for your podcast name and homepage (just 2 questions!)
- Automatically search for your RSS feed
- Generate your site with smart defaults
- Create deployment files
- Guide you through next steps

## 📚 Additional Resources

After creating your site, you may want to customize it further:

- **[Custom Icons Guide](./custom-icons-guide.md)** - Create custom branding and icons for your site
- **[Custom Theme Guide](./custom-theme-guide.md)** - Customize colors and styling with shadcn themes  
- **[Deployment Guide](./deployment-guide.md)** - Configure SSO and deploy to AWS

## 🛠️ Development Commands

Once your site is created, these commands help with development:

```bash
# Start local development server
pnpm client:dev

# Validate your site configuration
pnpm validate:sites

# Deploy to production (when ready)
pnpm site:deploy
```

## ❓ Need Help?

- Check the individual guide documents linked above
- Review the generated site configuration in `sites/my-sites/[your-site]/`
- Look at example configurations in `sites/origin-sites/`

---

**Ready to get started?** Run `pnpm run site:create` and follow the prompts!
