# My Sites

This directory is where you create and configure your own podcast archive sites. If any sites exist in this directory, they will take priority over the sites in `../origin-sites/`.

## Quick Start

1. **Create a new site**: Use the helper script to get started quickly:
   ```bash
   pnpm create:site
   ```

2. **Or copy the example**: Copy the `example-site` directory and customize it:
   ```bash
   cp -r sites/my-sites/example-site sites/my-sites/your-site-name
   ```

3. **Configure your site**: Edit the configuration files in your new site directory

4. **Set up AWS credentials**: Create your `.env.aws` file with your AWS profile

5. **Deploy**: Run the deployment commands to get your site live

## Site Structure

Each site directory must contain:

```
your-site-name/
├── site.config.json    # Site configuration and podcast feeds
├── .env.aws           # AWS deployment credentials
└── index.css          # (Optional) Custom styling
```

## Configuration Files

### site.config.json

This is the main configuration file for your site:

```json
{
    "id": "your-site-name",
    "domain": "your-domain.com",
    "shortTitle": "Your Site",
    "fullTitle": "Your Full Site Title",
    "description": "Search and browse your favorite podcast",
    "includedPodcasts": [
        {
            "id": "your-podcast-id",
            "rssFeedFile": "your-podcast.xml",
            "title": "Your Podcast Title",
            "status": "active",
            "url": "https://feeds.example.com/your-rss-feed"
        }
    ]
}
```

**Required fields:**
- `id`: Unique identifier (lowercase, hyphens only, used for AWS resources)
- `domain`: The domain where your site will be hosted
- `shortTitle`: Short version of your site name
- `fullTitle`: Full title displayed on the site
- `description`: Site description for meta tags and display
- `includedPodcasts`: Array of podcast configurations

**Podcast configuration:**
- `id`: Unique identifier for the podcast (lowercase, hyphens only)
- `rssFeedFile`: Local filename for the RSS feed cache
- `title`: Display name for the podcast
- `status`: Either "active" or "inactive"
- `url`: RSS feed URL

### .env.aws

Contains your AWS deployment configuration:

```bash
# Your AWS profile name (from ~/.aws/config)
AWS_PROFILE=YourProfileName-123456789012

# Optional: Override default AWS region
AWS_REGION=us-east-1
```

**Setting up AWS profile:**
1. Follow the main README.md instructions for AWS SSO setup
2. Your profile name should match what you see in `~/.aws/config`
3. Ensure your profile has the necessary permissions for:
   - S3 bucket creation and management
   - Lambda function deployment
   - CloudFront distribution setup
   - EventBridge rule configuration

### index.css (Optional)

Custom CSS styling for your site. This file will be injected into the client build to override default styles.

## Commands

Once your site is configured, you can use these commands:

```bash
# Local Development
pnpm client:dev                    # Start development server (will prompt for site)
pnpm setup:site-directories        # Create local data directories

# Data Processing
pnpm rss-retrieval-lambda:run:local    # Download podcast episodes
pnpm process-audio-lambda:run:local    # Process audio files locally

# Deployment
pnpm all:deploy                    # Deploy your site to AWS (will prompt for site)
pnpm trigger:ingestion-lambda      # Trigger production data processing
```

All commands will prompt you to select which site to work with, unless you set `SKIP_SITE_SELECTION_PROMPT=true` in the root `.env.local` file.

## Common Issues

### Domain Configuration
- Make sure your domain DNS is configured to point to AWS
- CloudFront distributions can take 15-20 minutes to fully deploy
- SSL certificates are automatically provisioned but may take time

### AWS Permissions
- Your AWS profile needs broad permissions for the initial deployment
- After deployment, you can restrict permissions if needed
- Make sure your AWS profile region matches your preferred deployment region

### RSS Feed Access
- Some podcast feeds may have access restrictions
- Test your RSS URLs manually before configuring
- Private feeds may require authentication (not currently supported)

### Local Development
- Run `pnpm setup:site-directories` before local development
- Audio processing can be resource-intensive
- Use `WHISPER_API_PROVIDER=openai` for faster transcription (requires API key)

## Need Help?

1. Check the main [README.md](../../README.md) for general setup instructions
2. Review existing sites in `../origin-sites/` for configuration examples
3. Use the `example-site` template as a starting point
4. Run `pnpm create:site` for guided site creation

## Advanced Configuration

### Multiple Podcasts
You can include multiple podcasts in a single site by adding more entries to the `includedPodcasts` array. This is useful for:
- Multiple seasons of the same show
- Related podcasts from the same network
- Archived vs. current feeds

### Custom Styling
The `index.css` file allows you to customize your site's appearance:
- Override default colors and fonts
- Add custom layouts
- Brand your site with logos and images

### AWS Account Separation
Each site can be deployed to a completely separate AWS account:
- Configure different AWS profiles in each site's `.env.aws`
- Terraform state is automatically isolated per site
- No resource name conflicts between accounts