# Deployment Guide

This guide will walk you through deploying your podcast site to AWS using the automated deployment scripts.

## 🎯 Overview

Your site will be deployed to AWS with:
- **S3**: Static website hosting
- **CloudFront**: Global CDN for fast loading
- **Lambda**: Backend API functions for search (ingestion lambdas available but optional)
- **Route 53**: Custom domain management
- **Local processing**: Primary method for cost-effective transcript generation

## 🔧 Prerequisites

### Required Software
```bash
# Node.js and pnpm (already installed)
node --version  # Should be >=20.0.0
pnpm --version  # Should be >=10.0.0

# AWS CLI
aws --version
# If not installed: brew install awscli (Mac) or visit aws.amazon.com/cli

# Terraform (managed by scripts, but good to have)
terraform --version
# If not installed: brew install terraform (Mac) or visit terraform.io
```

### AWS Account Setup
1. **AWS Account**: You need an AWS account with billing enabled
2. **Administrative Access**: IAM permissions for S3, CloudFront, Lambda, Route 53
3. **Domain**: Your site will use `[site-name].browse.show` subdomain

## 🔐 Step 1: Configure AWS Authentication

### Option A: AWS SSO (Recommended)

If your organization uses AWS SSO:

```bash
# Configure AWS SSO
aws configure sso

# Follow prompts:
# SSO session name: your-org-session
# SSO start URL: https://your-org.awsapps.com/start
# SSO region: us-east-1 (or your region)
# Account ID: 123456789012
# Role name: AdministratorAccess
# Region: us-east-1
# Profile name: your-podcast-site
```

### Option B: AWS Access Keys

If using access keys (less secure but simpler):

```bash
# Configure AWS profile
aws configure --profile your-podcast-site

# Enter when prompted:
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: ...
# Default region: us-east-1
# Default output format: json
```

### Verify Access

```bash
# Test your AWS configuration
aws sts get-caller-identity --profile your-podcast-site
```

## 🌐 Step 2: Domain Configuration

Your site will automatically be configured with a `*.browse.show` subdomain:

- **Automatic setup**: Your domain is `[your-site].browse.show`
- **DNS management**: Handled automatically by browse.show infrastructure
- **SSL certificate**: Automatically provisioned and managed
- **No additional configuration needed**

If you want to use a custom domain later, you can modify the site configuration after deployment.

## 🚀 Step 3: Bootstrap Terraform State

Before deploying for the first time, you need to set up the Terraform state management:

```bash
# Bootstrap the Terraform state for your site
pnpm run automation:bootstrap-state

# When prompted, select your site
# This creates the S3 bucket and DynamoDB table for Terraform state
```

This step:
- Creates S3 bucket for Terraform state storage
- Sets up DynamoDB table for state locking
- Configures remote state backend
- Only needs to be run once per site

## 📦 Step 4: Deploy Site Infrastructure

Deploy your site to AWS using the automated deployment script:

```bash
# Deploy your site infrastructure and content
pnpm run site:deploy

# When prompted, select your site
# This will:
# - Create all AWS resources (S3, CloudFront, Lambda functions)
# - Build and upload your site content
# - Configure domain and SSL certificate
# - Set up the search API
```

The deployment script handles:
- **Infrastructure creation**: All AWS resources via Terraform
- **Lambda deployment**: Search API and optional ingestion functions
- **Content building**: Compiles your site for production
- **Asset uploading**: Deploys to S3 and CloudFront
- **Configuration**: Sets up all necessary environment variables

**Note:** Ingestion lambdas are deployed but not scheduled by default. Local processing is the recommended approach for new episodes.

### Verify Deployment

Your site should now be live at `https://[your-site].browse.show`

Test that:
- [ ] Site loads correctly
- [ ] Basic navigation works
- [ ] Search interface is present (but no content yet)

## 🔄 Step 5: Generate Content with Local Ingestion

After your site is deployed, run the ingestion pipeline to populate it with podcast content:

```bash
# Run the complete ingestion pipeline
pnpm run ingestion:run-pipeline:interactive

# When prompted:
# 1. Select your site
# 2. Choose "Full pipeline" for initial setup
# 3. Confirm you want to proceed
```

### What the Ingestion Pipeline Does

**Step 1: Download Episodes**
- Downloads podcast RSS feed
- Fetches episode metadata
- Downloads audio files to local storage

**Step 2: Generate Transcripts (Local)**
- Uses local Whisper API for transcription
- Significantly cheaper than cloud APIs
- Processes audio files to generate accurate transcripts

**Step 3: Process and Index**
- Converts transcripts to searchable format
- Generates episode summaries and metadata
- Creates search index for fast queries

**Step 4: Upload to AWS**
- Uploads processed content to S3
- Updates search database
- Refreshes CloudFront cache

### Cost Savings with Local Processing

By running the full ingestion pipeline locally, you save significant costs:
- **Cloud API costs**: $0.006 per minute for Whisper API (adds up quickly for long podcasts)
- **Local processing**: Free using whisper.cpp on your machine
- **No Lambda execution costs**: Avoid Lambda compute charges for processing
- **One-time setup**: Process entire podcast archive locally without usage limits
- **Ongoing updates**: Only new episodes need processing

**Example:** A 2-hour podcast episode costs $0.72 via OpenAI Whisper API vs. free with local processing.

## ✅ Step 6: Verify Everything Works

### Test Website Features

Visit `https://[your-site].browse.show` and verify:

- [ ] **Site loads** quickly and correctly
- [ ] **Episodes display** with proper formatting and metadata
- [ ] **Search works** (try searching for episode topics, guest names)
- [ ] **Transcripts load** when clicking on episodes
- [ ] **Dark/light mode** toggles correctly
- [ ] **Mobile responsive** design works properly

### Test Performance

- [ ] **Page loads** in under 3 seconds
- [ ] **Search responds** quickly (under 1 second)
- [ ] **Images and assets load** properly
- [ ] **CDN delivers** content globally

## 🔄 Step 7: Set Up Ongoing Updates

### Automatic Updates (Optional)

Set up scheduled processing for new episodes:

**Option 1: Local Automation (Recommended for Development)**
```bash
# Set up local automation that runs on login
sudo pnpm run ingestion:automation:manage

# This creates a macOS LaunchAgent that:
# - Runs pipeline automatically when you log in
# - Executes at most once per 24 hours
# - Only runs on battery if >50% charged
# - Provides fast exit if already run recently
# - Includes interactive management interface
```

**Option 2: Cloud-Based Automation (Production - Higher Cost)**
```bash
# Enable scheduled Lambda execution (uses paid Whisper API)
# This is NOT recommended due to cost, but available if needed

# To enable during deployment, set terraform variable:
# enable_rss_processing_schedule = true

# This creates EventBridge scheduled events to:
# - Check for new episodes daily (or custom schedule)
# - Process content using OpenAI Whisper API ($0.006/minute)
# - Update search index automatically

# Note: This will incur ongoing costs for transcription
```

### Manual Updates

When you want to add new episodes manually:

```bash
# Run incremental update
pnpm run ingestion:run-pipeline:interactive

# Select "Incremental update" to process only new episodes
```

### Managing Local Automation

If you set up local automation, you can manage it anytime:

```bash
# Interactive management interface
sudo pnpm run ingestion:automation:manage

# This allows you to:
# - Enable/disable automation
# - View execution history
# - Test pipeline manually
# - Check power and timing status
# - View detailed logs
```

## 🔧 Troubleshooting

### Common Deployment Issues

**AWS Authentication Problems**
```bash
# Verify your AWS credentials
aws sts get-caller-identity --profile your-podcast-site

# If using SSO, refresh your session
aws sso login --profile your-podcast-site
```

**Site Not Loading**
```bash
# Check deployment status
pnpm run site:deploy

# Verify resources in AWS console
# Look for CloudFront distribution and S3 bucket
```

**Missing Content**
```bash
# Re-run the ingestion pipeline
pnpm run ingestion:run-pipeline:interactive

# Check local data directory
ls -la aws-local-dev/s3/sites/[your-site]/
```

### Performance Issues

**Slow Search**
- Check if search index was properly created
- Verify Lambda function is running correctly
- Monitor CloudWatch logs for errors

**Missing Episodes**
- Verify RSS feed URL is correct in site configuration
- Check that RSS feed is publicly accessible
- Re-run ingestion pipeline if needed

**Local Automation Issues (macOS)**
```bash
# Check automation status
sudo pnpm run ingestion:automation:manage

# Check LaunchAgent status
launchctl list | grep ingestion-automation

# View automation logs
tail -f scripts/automation-logs/automation.log

# Check power conditions
pmset -g ps
```

## 🔄 Ongoing Maintenance

### Regular Tasks

**Weekly:**
- Check for new episodes: `pnpm run ingestion:run-pipeline:interactive`
- Monitor AWS costs in the billing console
- Verify site performance and uptime

**Monthly:**
- Review AWS resource usage
- Update dependencies: `pnpm update`
- Check for security updates

**Quarterly:**
- Review podcast feed configuration
- Optimize search performance if needed
- Consider adding more podcasts to your site

### Scaling Considerations

**High Traffic:**
- Monitor CloudFront bandwidth and costs
- Consider upgrading Lambda memory allocation
- Set up CloudWatch alerts for errors

**Large Podcast Archives:**
- Monitor S3 storage costs
- Consider lifecycle policies for old audio files
- Optimize search index for performance

## 💰 Cost Estimation

Typical monthly costs for a medium-sized podcast site:

- **S3 Storage**: $1-5 (depending on episode archive size)
- **CloudFront**: $5-20 (depending on traffic)
- **Lambda**: $0-10 (depending on search usage)
- **Route 53**: $0.50 (per hosted zone)

**Total Estimated Monthly Cost: $10-35**

**One-time Setup Costs:**
- **Local transcription**: Free (uses your computer)
- **Initial data processing**: Minimal Lambda costs
- **Domain setup**: Free for *.browse.show subdomains

## 🔒 Security Best Practices

### Access Control
- Use least-privilege IAM policies
- Rotate AWS access keys regularly
- Enable CloudTrail logging for audit trails
- Set up billing alerts to monitor costs

### Application Security
- All traffic uses HTTPS
- API endpoints have proper rate limiting
- Search queries are sanitized
- No sensitive data in client-side code

### Monitoring
- CloudWatch alarms for errors and performance
- Regular security scans of dependencies
- Monitor unusual access patterns
- AWS Config for compliance tracking

## 🆘 Need Help?

### Common Support Resources

1. **Check the logs**: 
   - Local logs: Check terminal output during ingestion
   - AWS logs: CloudWatch Logs for Lambda functions

2. **Verify configuration**:
   - Site config: `sites/my-sites/[your-site]/site.config.json`
   - AWS resources: Check AWS console

3. **Re-run processes**:
   - Deployment: `pnpm run site:deploy`
   - Content: `pnpm run ingestion:run-pipeline:interactive`

### Getting Additional Help

- **AWS Documentation**: Official AWS service documentation
- **Community Support**: browse.show community forums
- **Professional Help**: Consider AWS support plans for production sites

---

**Congratulations!** Your podcast site is now live and fully functional. Visit `https://[your-site].browse.show` to see your searchable podcast archive in action! 🎉

## 📋 Quick Reference

### Essential Commands
```bash
# Initial deployment
pnpm run automation:bootstrap-state  # One-time setup
pnpm run site:deploy                 # Deploy infrastructure & content

# Content management  
pnpm run ingestion:run-pipeline:interactive  # Add/update episodes

# Maintenance
pnpm run automation:deploy           # Set up automatic updates
pnpm validate:sites                  # Verify configuration
```

### Important Files
- **Site config**: `sites/my-sites/[your-site]/site.config.json`
- **Terraform state**: Managed automatically in S3
- **Local data**: `aws-local-dev/s3/sites/[your-site]/`