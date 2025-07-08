# browse.show - Getting Started

### 📝🔍🎙️ transcribe & search any podcast** 

Deploy your own podcast archive and search engine
<br/>
<br/>
<br/>
This repository supports deploying multiple independent podcast archive sites, each with complete search functionality. Each site can archive one or more podcasts and deploy to its own domain and AWS infrastructure.

## 🚀 Quick Start

### 1. Create Your First Site

```bash
# Clone the repository
git clone <repository-url>
cd browse-dot-show
pnpm install

# Create a new site with guided setup
pnpm site:create
```

### 2. Local Development

```bash
# Set up local data directories
pnpm site:setup-directories

# Start development server (will prompt for site selection)
pnpm client:dev

# In another terminal, download podcast data
pnpm rss-retrieval-lambda:run:local
```

### 3. Deploy to Production

```bash
# Deploy your site to AWS (will prompt for site selection)
pnpm all:deploy

# Trigger data processing in production
pnpm trigger:ingestion-lambda
```

## 📁 Site Management

### Site Configuration

Sites are configured in the `sites/` directory:

- **Origin Sites** (`sites/origin-sites/`): Example sites provided with the repository
- **My Sites** (`sites/my-sites/`): Your custom sites (takes priority if present)

Each site contains:
- `site.config.json`: Site configuration and podcast feeds
- `.env.aws-sso`: AWS deployment credentials
- `index.css`: Optional custom styling

### Creating Sites

**Option 1: Guided Setup**
```bash
pnpm site:create  # Interactive site creation wizard
```

**Option 2: Manual Setup**
```bash
# Copy example template
cp -r sites/my-sites/example-site sites/my-sites/my-podcast-site
cd sites/my-sites/my-podcast-site

# Edit configuration files
vim site.config.json  # Configure site details and podcast feeds
cp aws.config.template .env.aws-sso  # Set up AWS credentials
```

### Site Selection

All commands prompt you to select which site to work with:
- Use `--site=<siteId>` parameter to skip site selection prompt
- Pass site explicitly: `SITE_ID=my-site pnpm client:dev`

## 🏗️ Architecture

### Multi-Site Support

Each site gets its own:
- **AWS Infrastructure**: S3 buckets, Lambda functions, CloudFront distribution
- **Domain**: Custom domain configuration  
- **Data Isolation**: Completely separate podcast data and search indices
- **Terraform State**: Independent infrastructure management

### AWS Deployment

- **Multiple AWS Accounts**: Each site can deploy to different AWS accounts
- **Resource Isolation**: All AWS resources are tagged and named per site
- **Independent Scaling**: Each site scales independently

### Local Development

- **Site-Specific Data**: Local data organized by site (`aws-local-dev/s3/sites/{siteId}/`)
- **Isolated Processing**: Local lambdas process data per site
- **Dynamic Asset Serving**: Development server serves assets from correct site directory

## 📋 Available Commands

### Site Management
```bash
pnpm site:create              # Create new site with guided setup
pnpm site:setup-directories   # Create local data directories
pnpm validate:sites           # Validate site configurations
```

### Local Development
```bash
pnpm client:dev               # Start development server
pnpm rss-retrieval-lambda:run:local    # Download podcast episodes
pnpm process-audio-lambda:run:local    # Process audio files locally
pnpm srt-indexing-lambda:run:local     # Index transcripts locally
pnpm search-lambda:dev:local           # Start search API server
```

### Building & Testing
```bash
pnpm all:build               # Build all packages
pnpm all:test                # Run all tests
pnpm client:build            # Build client for specific site
pnpm validate:local          # Run validation
```

### Production Deployment
```bash
pnpm all:deploy              # Deploy site infrastructure
pnpm trigger:ingestion-lambda # Trigger production data processing
```

## ⚙️ Configuration

### Environment Files

**Root Environment** (`.env.local`):
```bash
# Shared configuration across all sites
LOG_LEVEL=info
WHISPER_API_PROVIDER=openai
OPENAI_API_KEY=your_key_here

# Site selection defaults
FILE_STORAGE_ENV=local
```

**Site-Specific Environment** (`sites/my-sites/{siteId}/.env.aws-sso`):
```bash
# AWS configuration for this specific site
AWS_PROFILE=MyProfile-123456789012
AWS_REGION=us-east-1
```

### Site Configuration

Example `site.config.json`:
```json
{
    "id": "my-podcast-site",
    "domain": "my-podcast.browse.show",
    "shortTitle": "My Podcast",
    "fullTitle": "My Podcast Archive",
    "description": "Search all episodes of my favorite podcast",
    "includedPodcasts": [
        {
            "id": "main-podcast",
            "rssFeedFile": "main-podcast.xml",
            "title": "Main Podcast",
            "status": "active",
            "url": "https://feeds.example.com/main-podcast"
        }
    ]
}
```

## 🔧 Prerequisites

### AWS Setup

1. **AWS Account**: Access to AWS account with appropriate permissions
2. **AWS CLI**: Installed and configured with SSO
3. **Terraform**: For infrastructure deployment

```bash
# Install AWS CLI
brew install awscli

# Configure AWS SSO
aws configure sso
```

### Node.js Setup

```bash
# Install Node.js (>=20.0.0)
nvm install 20
nvm use 20

# Install pnpm (>=10.0.0)
npm install -g pnpm@latest
```

### API Keys (Optional)

For faster audio transcription:
```bash
# OpenAI API key for Whisper transcription
OPENAI_API_KEY=sk-...

# Alternative: Replicate API key
REPLICATE_API_KEY=r8_...
```

## 🎯 Use Cases

### Single Podcast Archive
Create a searchable archive for one podcast:
- Configure single podcast in `includedPodcasts`
- Perfect for personal podcast archiving
- Example: Archive your favorite weekly show

### Multi-Podcast Sites
Archive multiple related podcasts:
- Add multiple entries to `includedPodcasts`
- Useful for podcast networks or related shows
- Example: All podcasts from the same network

### Multi-Domain Deployment
Deploy separate sites for different audiences:
- Each site gets its own domain and branding
- Deploy to different AWS accounts if needed
- Example: Separate sites for different podcast genres

## 🆘 Troubleshooting

### Common Issues

**Site Selection Problems**:
- Ensure sites exist in `sites/my-sites/` or `sites/origin-sites/`
- Use `--site=<siteId>` parameter in commands
- Verify site configuration files are valid JSON

**AWS Deployment Issues**:
- Verify AWS profile is configured: `aws sts get-caller-identity --profile YourProfile`
- Ensure AWS profile has necessary permissions (S3, Lambda, CloudFront, etc.)
- Check AWS region is supported for all services

**Local Development Issues**:
- Run `pnpm site:setup-directories` before first development
- Ensure you have write permissions in the project directory
- Check that required ports (3000, 8080) are available

### Getting Help

1. Check site-specific documentation in `sites/my-sites/README.md`
2. Review example configurations in `sites/origin-sites/`
3. Validate your site config: `pnpm validate:sites`
4. Test AWS connectivity: `aws sts get-caller-identity --profile YourProfile`

## 📜 License

[License information here]

## 🤝 Contributing

[Contributing guidelines here]
