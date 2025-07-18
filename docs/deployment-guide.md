# Deployment Guide

This guide will walk you through deploying your podcast site to AWS with proper authentication and configuration.

## 🎯 Overview

Your site will be deployed to AWS with:
- **S3**: Static website hosting
- **CloudFront**: Global CDN for fast loading
- **Lambda**: Backend API functions
- **Auth0**: User authentication (SSO)
- **Route 53**: Custom domain management

## 🔧 Prerequisites

### Required Software
```bash
# Node.js and pnpm (already installed)
node --version  # Should be >=20.0.0
pnpm --version  # Should be >=10.0.0

# AWS CLI
aws --version
# If not installed: brew install awscli (Mac) or visit aws.amazon.com/cli

# Terraform
terraform --version
# If not installed: brew install terraform (Mac) or visit terraform.io
```

### AWS Account Setup
1. **AWS Account**: You need an AWS account with billing enabled
2. **Administrative Access**: IAM permissions for S3, CloudFront, Lambda, Route 53
3. **Domain**: A domain name (can purchase through AWS Route 53)

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

## 🔑 Step 2: Configure Auth0 SSO

### Create Auth0 Account

1. Visit [auth0.com](https://auth0.com) and create a free account
2. Create a new "Single Page Application"
3. Note your domain, client ID, and client secret

### Configure Auth0 Application

**Allowed Callback URLs:**
```
https://your-site.browse.show/callback,
http://localhost:3000/callback
```

**Allowed Logout URLs:**
```
https://your-site.browse.show,
http://localhost:3000
```

**Allowed Web Origins:**
```
https://your-site.browse.show,
http://localhost:3000
```

### Environment Configuration

Create your environment file:

```bash
# Copy the template
cp terraform/sites/[your-site]/.env.example terraform/sites/[your-site]/.env

# Edit with your values
vim terraform/sites/[your-site]/.env
```

Add these Auth0 values:
```bash
# Auth0 Configuration
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=https://your-site.browse.show

# AWS Configuration
AWS_PROFILE=your-podcast-site
AWS_REGION=us-east-1

# Site Configuration
SITE_ID=your-site
DOMAIN_NAME=your-site.browse.show
```

## 🌐 Step 3: Configure Domain

### Option A: Use browse.show Subdomain

If using a `*.browse.show` subdomain (recommended for testing):

1. Your domain is automatically configured as `your-site.browse.show`
2. DNS will be managed by the browse.show team
3. SSL certificate will be automatically provisioned

### Option B: Use Custom Domain

If you want to use your own domain:

1. **Purchase domain** through AWS Route 53 or your preferred registrar
2. **Update site config** to use your domain:
```json
{
  "domain": "your-custom-domain.com"
}
```

3. **Update Terraform variables:**
```bash
# In terraform/sites/[your-site]/variables.tf
variable "domain_name" {
  default = "your-custom-domain.com"
}
```

## 🚀 Step 4: Deploy Infrastructure

### Initialize Terraform

```bash
cd terraform/sites/[your-site]

# Initialize Terraform
terraform init

# Review the planned changes
terraform plan
```

### Deploy to AWS

```bash
# Apply the infrastructure
terraform apply

# Type 'yes' when prompted
```

This will create:
- S3 bucket for your website
- CloudFront distribution
- Lambda functions for search API
- Route 53 DNS records (if using custom domain)
- SSL certificate

### Verify Deployment

```bash
# Check that resources were created
aws s3 ls --profile your-podcast-site
aws cloudfront list-distributions --profile your-podcast-site
```

## 📦 Step 5: Deploy Site Content

### Build and Upload

```bash
# Return to project root
cd ../../..

# Build your site for production
pnpm client:build:specific-site

# When prompted, select your site

# Upload to S3
pnpm client:upload-all-sites
```

### Verify Site is Live

Visit your domain to confirm the site is working:
- `https://your-site.browse.show` (for subdomain)
- `https://your-custom-domain.com` (for custom domain)

## 🔄 Step 6: Set Up Content Pipeline

### Initial Data Load

```bash
# Trigger podcast data ingestion
pnpm ingestion:run-pipeline:interactive

# Select your site when prompted
# Choose "Full pipeline" to download and process all episodes
```

### Schedule Regular Updates

Set up automatic podcast updates:

```bash
# Deploy the ingestion pipeline
pnpm automation:deploy

# This creates CloudWatch scheduled events to:
# - Check for new episodes daily
# - Process new audio weekly
# - Update search index continuously
```

## ✅ Step 7: Verify Everything Works

### Test Website Features

- [ ] **Site loads** at your domain
- [ ] **Search works** (try searching for episode topics)
- [ ] **Episodes display** with proper formatting
- [ ] **Transcripts load** when clicking on episodes
- [ ] **Dark/light mode** toggles correctly
- [ ] **Mobile responsive** design works

### Test Authentication

- [ ] **Login button** appears on site
- [ ] **Auth0 login** redirects properly
- [ ] **User session** persists after login
- [ ] **Logout** works correctly

### Test Performance

- [ ] **Page loads** in under 3 seconds
- [ ] **Search responds** quickly
- [ ] **Images load** properly
- [ ] **CDN delivers** content globally

## 🔧 Troubleshooting

### Common Deployment Issues

**Terraform Fails**
```bash
# Check AWS credentials
aws sts get-caller-identity --profile your-podcast-site

# Verify permissions
aws iam list-attached-user-policies --user-name your-username
```

**Site Not Loading**
```bash
# Check CloudFront distribution status
aws cloudfront list-distributions --profile your-podcast-site

# Verify S3 bucket contents
aws s3 ls s3://your-site-bucket --profile your-podcast-site
```

**Auth0 Issues**
- Verify callback URLs match exactly
- Check that domain is correct in .env file
- Ensure client secret is not exposed in frontend code

**DNS Problems**
```bash
# Check DNS propagation
dig your-site.browse.show
nslookup your-site.browse.show
```

### Performance Issues

**Slow Loading**
- Check CloudFront cache hit ratio in AWS console
- Verify assets are properly compressed
- Test from different geographic locations

**Search Performance**
- Monitor Lambda function metrics
- Check if search index needs rebuilding
- Verify database connections

## 🔄 Ongoing Maintenance

### Regular Updates

**Monthly:**
- Review AWS billing and usage
- Check for security updates in dependencies
- Monitor search performance metrics

**Quarterly:**
- Update podcast feed configurations
- Review and rotate Auth0 secrets
- Test disaster recovery procedures

### Scaling Considerations

**High Traffic:**
- Monitor CloudFront bandwidth usage
- Consider upgrading Lambda memory/timeout
- Set up CloudWatch alerts for errors

**Large Podcast Archives:**
- Monitor S3 storage costs
- Consider lifecycle policies for old episodes
- Optimize search index size

## 💰 Cost Estimation

Typical monthly costs for a medium-sized podcast site:

- **S3 Storage**: $1-5 (depending on episode archive size)
- **CloudFront**: $5-20 (depending on traffic)
- **Lambda**: $0-10 (depending on search usage)
- **Route 53**: $0.50 (per hosted zone)
- **Auth0**: Free tier covers most personal projects

**Total Estimated Monthly Cost: $10-50**

## 🔒 Security Best Practices

### Access Control
- Use least-privilege IAM policies
- Rotate AWS access keys regularly
- Enable CloudTrail logging
- Set up billing alerts

### Application Security
- Keep Auth0 secrets secure and rotated
- Use HTTPS everywhere
- Enable CORS properly
- Validate all user inputs

### Monitoring
- Set up CloudWatch alarms
- Monitor unusual access patterns
- Enable AWS Config for compliance
- Regular security scans

---

**Congratulations!** Your podcast site is now live and searchable. Visit your domain to see it in action, and don't forget to share it with your podcast community! 🎉

## 📞 Getting Help

If you encounter issues:

1. **Check the logs**: CloudWatch Logs for Lambda functions
2. **Review documentation**: AWS and Auth0 official docs
3. **Community support**: Browse.show community forums
4. **Professional help**: Consider AWS support plans for production sites