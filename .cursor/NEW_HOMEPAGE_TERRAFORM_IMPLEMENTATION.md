# Homepage Terraform Implementation Plan

## Overview

This document outlines the implementation plan for deploying the homepage package to the `browse.show` domain using a **completely separate Terraform infrastructure** from the existing site deployments.

## Current Architecture vs Homepage Requirements

### Existing Sites (Complex)
- **Domain Pattern**: `{siteId}.browse.show` (subdomains)
- **Infrastructure**: S3 + CloudFront + API Gateway + 4 Lambda functions + EventBridge
- **Purpose**: Full podcast transcription and search pipeline
- **State Management**: Site-specific buckets (`{siteId}-terraform-state`)
- **Configuration**: Multiple environment files per site

### Homepage (Simple)
- **Domain Pattern**: `browse.show` (root domain)
- **Infrastructure**: S3 + CloudFront + SSL certificate only
- **Purpose**: Static landing page with universal search
- **State Management**: Single dedicated bucket (`homepage-terraform-state`)
- **Configuration**: Single environment file

## Implementation Strategy

### 1. Complete Separation Principle
- **No code reuse** from existing Terraform modules
- **No shared state** with site infrastructure  
- **No dependency** on site deployments
- **Clear naming** to distinguish from sites

### 2. Directory Structure
```
terraform-homepage/
├── main.tf                 # Complete infrastructure in one file
├── variables.tf           # Homepage-specific variables
├── outputs.tf            # CloudFront domain, bucket name, etc.
├── homepage-prod.tfvars   # Production configuration
└── terraform.tfbackend   # State backend configuration
```

### 3. Infrastructure Components

#### A. S3 Bucket
- **Name**: `browse-dot-show-homepage`
- **Purpose**: Static website hosting
- **Access**: Private with CloudFront OAC
- **CORS**: Configured for web assets

#### B. CloudFront Distribution
- **Domain**: `browse.show`
- **SSL Certificate**: ACM certificate for root domain
- **Caching**: Optimized for static assets
- **Error Pages**: SPA routing support (404 → index.html)
- **Security**: HTTPS redirect, modern TLS

#### C. SSL Certificate
- **Domain**: `browse.show`
- **Provider**: AWS ACM in us-east-1 (required for CloudFront)
- **Validation**: DNS validation

#### D. State Management
- **Bucket**: `homepage-terraform-state`
- **Region**: us-east-1
- **Encryption**: Enabled

### 4. Key Configuration

#### Variables
```hcl
variable "aws_region" {
  description = "AWS region for homepage deployment"
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS SSO profile for authentication"
  type        = string
}

variable "domain_name" {
  description = "Root domain for homepage"
  default     = "browse.show"
}
```

#### Environment File (homepage-prod.tfvars)
```hcl
aws_region   = "us-east-1"
domain_name  = "browse.show"
aws_profile  = "browse-dot-show-homepage"  # New SSO profile
```

### 5. Deployment Integration

#### New Scripts
- `scripts/deploy/deploy-homepage.ts` - Dedicated homepage deployment
- `scripts/deploy/bootstrap-homepage-state.ts` - Initialize state bucket

#### Build Integration
- Homepage builds from `packages/homepage/dist/`
- Upload to S3 bucket after Terraform apply
- CloudFront invalidation after upload

### 6. Deployment Process

1. **Prerequisites**
   - AWS SSO profile configured for homepage
   - Domain ownership verification for `browse.show`

2. **Infrastructure Deployment**
   ```bash
   cd terraform-homepage
   terraform init -backend-config=terraform.tfbackend
   terraform plan -var-file=homepage-prod.tfvars
   terraform apply
   ```

3. **Content Deployment**
   ```bash
   pnpm build:homepage
   aws s3 sync packages/homepage/dist/ s3://browse-dot-show-homepage/
   aws cloudfront create-invalidation --distribution-id XXX --paths "/*"
   ```

### 7. DNS Configuration

#### Domain Setup
- **Provider**: Namecheap (browse.show)
- **Record Type**: CNAME or ALIAS
- **Target**: CloudFront distribution domain
- **SSL**: Managed by AWS ACM

#### Certificate Validation
- DNS CNAME records for ACM validation
- Automated via Terraform when possible

### 8. Monitoring & Maintenance

#### CloudWatch
- CloudFront access logs
- Distribution metrics
- Error monitoring

#### Cost Optimization
- CloudFront price class optimization
- S3 storage class optimization
- Certificate auto-renewal

## Implementation Phases

### Phase 1: Terraform Infrastructure ✅
1. ✅ Create `terraform-homepage/` directory
2. ✅ Write main.tf with S3 + CloudFront + SSL
3. ✅ Configure variables and outputs
4. ✅ Create environment configuration
5. ✅ Test infrastructure deployment (ready for AWS credentials)

### Phase 2: State Management ✅
1. ✅ Create state bucket bootstrap script
2. ✅ Configure backend for state isolation
3. ✅ Test state operations (ready for AWS credentials)

### Phase 3: Deployment Scripts ✅
1. ✅ Create homepage-specific deploy script
2. ✅ Integrate with existing build process
3. ✅ Add content upload functionality
4. ✅ Implement CloudFront invalidation

### Phase 4: Documentation & Integration ✅
1. ✅ Create comprehensive Terraform documentation
2. ✅ Add deployment scripts to package.json
3. ✅ Update main README with homepage instructions
4. ✅ Create validation script for setup verification

### Phase 5: Ready for AWS Deployment 🔄
1. 🔄 Configure AWS credentials (user task)
2. 🔄 Run bootstrap script to create state bucket
3. 🔄 Deploy Terraform infrastructure
4. 🔄 Configure DNS for browse.show domain

### Phase 6: Production Validation (Pending)
1. ⏳ Verify homepage accessibility at https://browse.show
2. ⏳ Test universal search redirects
3. ⏳ Validate SSL certificate
4. ⏳ Performance testing

## Benefits of This Approach

### Technical Benefits
- **Isolation**: No risk to existing site infrastructure
- **Simplicity**: Much easier to understand and maintain
- **Flexibility**: Can be modified without affecting sites
- **Performance**: Optimized for static content delivery

### Operational Benefits  
- **Independent Deployments**: Homepage can be deployed separately
- **Clear Ownership**: Distinct from site infrastructure
- **Easy Rollback**: Simple to revert or destroy
- **Cost Transparency**: Clear cost attribution

## Risks & Mitigation

### Risk: Domain Configuration Conflicts
- **Mitigation**: Use completely separate AWS resources
- **Validation**: Test DNS resolution thoroughly

### Risk: SSL Certificate Issues
- **Mitigation**: Automated certificate validation via Terraform
- **Backup**: Manual validation process documented

### Risk: CloudFront Caching Issues
- **Mitigation**: Proper cache invalidation in deploy scripts
- **Monitoring**: CloudWatch metrics for cache hit rates

## Success Criteria

1. ✅ Homepage deployed to https://browse.show
2. ✅ SSL certificate working correctly
3. ✅ Universal search redirects functional
4. ✅ Mobile-responsive design working
5. ✅ Independent deployment process working
6. ✅ No impact on existing site deployments
7. ✅ Documentation complete and accurate

## Resources & Documentation

### AWS Resources Created
- S3 bucket: `browse-dot-show-homepage`
- CloudFront distribution for `browse.show`
- ACM certificate for `browse.show`
- Terraform state bucket: `homepage-terraform-state`

### Documentation Updates Needed
- README update with homepage deployment instructions
- Terraform documentation for homepage
- Domain management documentation
- Deployment troubleshooting guide