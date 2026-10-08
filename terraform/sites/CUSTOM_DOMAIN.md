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
pnpm bds site deploy
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
pnpm bds site deploy
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

## Additional Domains

A site can also be served at extra domains, such as a podcast's own subdomain: `libero` is at `libero.browse.show` and `search.liberopodcast.com`. The podcast's owner adds DNS records at their DNS host; the site still deploys from this repo.

CloudFront takes a single certificate, so the extra domains get a second certificate (`aws_acm_certificate.with_additional_domains`) that covers the custom domain plus `additional_domain_names`. CloudFront keeps the original certificate until the new one is validated, so the live site never depends on someone else's DNS.

### Step 1: Create the certificate (PR 1)

In the site's `terraform/prod.tfvars`:

```hcl
additional_domain_names                 = ["search.example.com"]
enable_additional_domains_on_cloudfront = false
```

Merging creates the certificate, pending validation. Get its validation records (one per domain; the custom domain's is usually in DNS already, from its own certificate):

```bash
aws acm list-certificates --region us-east-1 --certificate-statuses PENDING_VALIDATION \
  --query "CertificateSummaryList[?DomainName=='<custom domain>'].CertificateArn"
aws acm describe-certificate --region us-east-1 --certificate-arn <arn> \
  --query 'Certificate.DomainValidationOptions[].[DomainName,ValidationStatus,ResourceRecord.Name,ResourceRecord.Value]' --output table
```

(or `terraform output additional_domains_certificate_validation_records` for the site's stack.)

**ACM gives up on a certificate not validated within 72 hours.** Merge PR 1 shortly before the domain's owner can add the records. If it expires, delete it in ACM and re-run the deploy; Terraform creates a fresh one.

### Step 2: The domain's owner adds two records

At the extra domain's DNS host, two CNAME records:

| Name | Value | Purpose |
|------|-------|---------|
| validation record name from ACM (starts with `_`) | validation record value (ends with `acm-validations.aws.`) | Proves control of the domain, so ACM issues the certificate |
| the subdomain (e.g. `search`) | the site's CloudFront domain (`.site-account-mappings.json`) | Sends visitors to the site |

Most DNS hosts (Squarespace, Namecheap, GoDaddy) want only the part before the domain in the name field (`search`, not `search.example.com`). Until step 3, the second record leads to a certificate error in browsers; that's expected.

### Step 3: Serve the domains (PR 2)

Once ACM shows the certificate as **Issued**, set `enable_additional_domains_on_cloudfront = true` and merge. CloudFront switches to the new certificate and adds the aliases, and the search API's CORS allows the new origins. CloudFront takes a few minutes to deploy.

### Changing the list later

Changing `additional_domain_names` replaces the certificate, and the new one needs validating before CloudFront can use it. Set `enable_additional_domains_on_cloudfront = false` in the same change, then repeat steps 2 and 3. To remove the extra domains, set `additional_domain_names = []` and the flag to `false`.

## Maintenance

- SSL certificate auto-renews through AWS
- No ongoing DNS management required unless changing domains
- Both `listenfairplay.com` and the original CloudFront domain remain functional 