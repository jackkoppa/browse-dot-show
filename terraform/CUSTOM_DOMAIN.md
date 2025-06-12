# Custom Domain Configuration

This infrastructure is configured to serve the application at **https://listenfairplay.com** using AWS CloudFront with a custom SSL certificate.

## Current Setup

- **Domain**: `listenfairplay.com`
- **DNS Provider**: Namecheap (manually managed)
- **SSL Certificate**: AWS Certificate Manager (auto-renewing)
- **CDN**: AWS CloudFront with custom domain alias
- **Environment**: `dev`

## Configuration Details

### Key Terraform Variables
```hcl
custom_domain_name = "listenfairplay.com"
enable_custom_domain_on_cloudfront = true
```

### AWS Resources Created
- ACM SSL Certificate in `us-east-1` (required for CloudFront)
- CloudFront distribution with custom domain alias
- Updated CORS configuration for API Gateway

### DNS Records (Namecheap)
- Certificate validation CNAME (automatically validated)
- Main domain CNAME: `listenfairplay.com` → CloudFront distribution domain

## Setting Up Fresh (Reference)

If you need to set up a custom domain from scratch:

1. **Two-Step Deployment Required**: Since DNS is managed outside AWS, certificate validation must be done manually
2. **Initial Deploy**: Set `enable_custom_domain_on_cloudfront = false`, deploy, then add DNS validation records
3. **Final Deploy**: After certificate validation, set `enable_custom_domain_on_cloudfront = true` and deploy again

For detailed historical setup instructions, see commit history (e.g. [here](https://github.com/jackkoppa/browse-dot-show/commit/df6ab4871b0c9d024f44a39fd5c0ee8f1a129dd1)) for the original setup process.

## Maintenance

- SSL certificate auto-renews through AWS
- No ongoing DNS management required unless changing domains
- Both `listenfairplay.com` and the original CloudFront domain remain functional 