# Homepage Terraform Infrastructure

This directory contains the Terraform configuration for deploying the homepage to `browse.show`. This is **completely separate** from the site-specific infrastructure in the main `terraform/` directory.

## Overview

The homepage infrastructure is much simpler than individual sites:
- **No Lambda functions** - Static hosting only
- **No API Gateway** - No search functionality needed
- **No EventBridge** - No automated processing
- **Root domain** - `browse.show` instead of `{site}.browse.show`

## Infrastructure Components

- **S3 Bucket**: `browse-dot-show-homepage` for static file hosting
- **CloudFront Distribution**: CDN with SSL certificate for `browse.show`
- **ACM Certificate**: SSL certificate for the root domain
- **Terraform State**: Isolated state in `homepage-terraform-state` bucket

## Prerequisites

1. **AWS Credentials**: Configure AWS SSO profile or default credentials
2. **Domain Access**: Ownership of `browse.show` domain (managed via Namecheap)
3. **Terraform**: Installed and available in PATH

## Initial Setup

### 1. Bootstrap Terraform State

```bash
# From project root
tsx scripts/deploy/bootstrap-homepage-state.ts
```

This creates the `homepage-terraform-state` S3 bucket with:
- Versioning enabled
- Encryption enabled
- Public access blocked

### 2. Initialize Terraform

```bash
cd terraform-homepage
terraform init -backend-config=terraform.tfbackend
```

## Deployment

### Option 1: Full Deployment Script (Recommended)

```bash
# From project root
tsx scripts/deploy/deploy-homepage.ts
```

This script will:
1. Run tests and linting (optional)
2. Build the homepage package
3. Deploy Terraform infrastructure
4. Upload files to S3
5. Create CloudFront invalidation

### Option 2: Manual Deployment

```bash
# 1. Build homepage
pnpm --filter homepage build

# 2. Deploy infrastructure
cd terraform-homepage
terraform plan -var-file=homepage-prod.tfvars
terraform apply

# 3. Upload files
aws s3 sync ../packages/homepage/dist/ s3://browse-dot-show-homepage/ --delete

# 4. Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

## DNS Configuration

After Terraform deployment, you need to configure DNS for `browse.show`:

1. Get the CloudFront distribution domain:
   ```bash
   terraform output cloudfront_distribution_domain_name
   ```

2. In Namecheap DNS settings for `browse.show`:
   - Type: CNAME (or ALIAS if available)
   - Host: @ (root domain)
   - Value: [CloudFront domain from step 1]

3. SSL certificate validation (automatic via DNS):
   ```bash
   terraform output ssl_certificate_validation_options
   ```

## Configuration Files

- `main.tf`: Complete infrastructure definition
- `variables.tf`: Input variables
- `outputs.tf`: Output values (bucket name, distribution ID, etc.)
- `homepage-prod.tfvars`: Production configuration
- `terraform.tfbackend`: State backend configuration

## Key Differences from Site Infrastructure

| Aspect | Sites (`terraform/`) | Homepage (`terraform-homepage/`) |
|--------|---------------------|----------------------------------|
| Domain | `{site}.browse.show` | `browse.show` |
| Lambdas | 4 functions | None |
| API Gateway | Yes | No |
| EventBridge | Yes | No |
| State Bucket | `{site}-terraform-state` | `homepage-terraform-state` |
| Complexity | High | Low |

## Troubleshooting

### SSL Certificate Issues
- Certificate validation can take 5-30 minutes
- Ensure DNS records are correctly configured
- Check certificate status in AWS Console

### CloudFront Caching
- Changes may take up to 15 minutes to propagate
- Use invalidations to force cache refresh
- Check cache headers in browser dev tools

### S3 Upload Issues
- Ensure AWS credentials are valid
- Check bucket permissions
- Verify build artifacts exist in `packages/homepage/dist/`

## Cleanup

To destroy the homepage infrastructure:

```bash
cd terraform-homepage
terraform destroy -var-file=homepage-prod.tfvars
```

**Note**: This will not delete the Terraform state bucket - that must be done manually if needed.

## Monitoring

- **CloudFront**: Monitor via AWS Console → CloudFront
- **S3**: Check bucket metrics in AWS Console → S3
- **SSL**: Certificate status in AWS Console → Certificate Manager

## Cost

The homepage infrastructure costs significantly less than sites:
- S3: ~$0.01/GB storage + requests
- CloudFront: ~$0.085/GB transfer + requests  
- Certificate: Free
- No Lambda, API Gateway, or EventBridge costs 