# Custom Domain Configuration

This infrastructure supports custom domain deployments using AWS CloudFront with SSL certificates from AWS Certificate Manager.

## Example Setup

The `listenfairplay` site is configured to serve at **https://listenfairplay.com**:

- **Domain**: `listenfairplay.com`
- **DNS Provider**: Namecheap (manually managed)
- **SSL Certificate**: AWS Certificate Manager (auto-renewing)
- **CDN**: AWS CloudFront with custom domain alias

## First-Time Deployment Process

When deploying a site with a custom domain for the first time, you'll encounter an SSL certificate validation error. This is **expected behavior**. Here's the complete process:

### Step 1: Initial Deployment (Will Fail)
Run your normal deployment command:
```bash
pnpm deploy:site
```

You'll see an error like:
```
Error: creating CloudFront Distribution: InvalidViewerCertificate: The specified SSL certificate doesn't exist, isn't in us-east-1 region, isn't valid, or doesn't include a valid certificate chain.
```

**This is normal!** The deployment script will automatically detect this and provide you with next steps.

### Step 2: DNS Validation Setup
The deployment script will attempt to show you the DNS validation records automatically. You need to:

1. **Get the CNAME validation record** (shown in the deployment output)
2. **Add it to your domain registrar's DNS settings**
   - Log into your domain registrar (e.g., Namecheap, GoDaddy, etc.)
   - Go to DNS management for your domain
   - Add the CNAME record exactly as provided by AWS
3. **Wait for validation** (usually 5-10 minutes)

### Step 3: Final Deployment (Will Succeed)
Once DNS validation is complete, run the deployment again:
```bash
pnpm deploy:site
```

This time it should succeed completely!

## Configuration Details

### Key Terraform Variables
```hcl
custom_domain_name = "your-domain.com"
enable_custom_domain_on_cloudfront = true
```

### AWS Resources Created
- ACM SSL Certificate in `us-east-1` (required for CloudFront)
- CloudFront distribution with custom domain alias
- Updated CORS configuration for API Gateway

### Manual Alternative

If you prefer to set up DNS validation manually:

1. Go to AWS Certificate Manager (ACM) in the `us-east-1` region
2. Find your certificate (search for your site name)
3. Copy the DNS validation CNAME record
4. Add it to your domain registrar's DNS settings
5. Wait for the certificate status to change to "Issued"
6. Re-run the deployment

## Maintenance

- SSL certificate auto-renews through AWS
- No ongoing DNS management required unless changing domains
- Both `listenfairplay.com` and the original CloudFront domain remain functional 