#!/bin/bash

set -e

# Use production environment (Phase 7: simplified environment model)
ENV="prod"

# Get SITE_ID from environment variables (should be set by calling script)
SITE_ID=${2:-$SITE_ID}
if [ -z "$SITE_ID" ]; then
  echo "Error: SITE_ID must be provided as second argument or environment variable"
  echo "Usage: ./upload-client.sh prod SITE_ID"
  exit 1
fi

# Source environment variables (shared and site-specific)
if [ -f ".env.prod" ]; then
  echo "Loading environment variables from .env.prod"
  source ".env.prod"
else
  echo "Error: .env.prod file not found"
  exit 1
fi

# Load site-specific environment variables
SITE_ENV_FILE="sites/origin-sites/${SITE_ID}/.env.aws-sso"
if [ -f "$SITE_ENV_FILE" ]; then
  echo "Loading site-specific environment variables from $SITE_ENV_FILE"
  source "$SITE_ENV_FILE"
else
  echo "Error: Site-specific environment file not found: $SITE_ENV_FILE"
  exit 1
fi

# Validate AWS profile
if [ -z "$AWS_PROFILE" ]; then
  echo "Error: AWS_PROFILE is not set in environment files"
  exit 1
fi

# Check if AWS SSO session is active
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
  echo "AWS SSO session is not active or has expired for profile $AWS_PROFILE"
  echo "Please run: aws sso login --profile $AWS_PROFILE"
  exit 1
fi

# Get the S3 bucket name and CloudFront domain from Terraform output
cd "$(dirname "$0")/../../terraform"
BUCKET_NAME=$(terraform output -raw s3_bucket_name)
CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_distribution_domain_name)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)
SEARCH_API_URL=$(terraform output -raw search_api_invoke_url)

# S3 files are hosted at the same domain as the client
# (note: locally, this is a local server, handled in App.tsx)
S3_HOSTED_FILES_BASE_URL="/"

# Go back to the project root
cd ..

echo "Building client with search API URL: $SEARCH_API_URL"
echo "Building client with manifest base URL: $S3_HOSTED_FILES_BASE_URL"

export VITE_SEARCH_API_URL="$SEARCH_API_URL"
export VITE_S3_HOSTED_FILES_BASE_URL="$S3_HOSTED_FILES_BASE_URL"
export SITE_ID="$SITE_ID"

pnpm client:build:specific-site "$SITE_ID"

echo "Uploading client files to S3 bucket: $BUCKET_NAME"
echo "CloudFront domain: $CLOUDFRONT_DOMAIN"

# Site-specific dist directory
CLIENT_DIST_DIR="packages/client/dist-${SITE_ID}"

# Check if source files exist
if [ ! -f "${CLIENT_DIST_DIR}/index.html" ]; then
  echo "Error: ${CLIENT_DIST_DIR}/index.html not found"
  echo "Make sure you've run the client build for site: $SITE_ID"
  exit 1
fi

if [ ! -d "${CLIENT_DIST_DIR}/assets" ]; then
  echo "Error: ${CLIENT_DIST_DIR}/assets directory not found"
  echo "Make sure you've run the client build for site: $SITE_ID"
  exit 1
fi

# Upload index.html to root
echo "Uploading index.html from ${CLIENT_DIST_DIR}..."
aws s3 cp "${CLIENT_DIST_DIR}/index.html" s3://$BUCKET_NAME/index.html --profile "$AWS_PROFILE"

# Upload favicon.ico to root (if it exists)
if [ -f "${CLIENT_DIST_DIR}/favicon.ico" ]; then
  echo "Uploading favicon.ico from ${CLIENT_DIST_DIR}..."
  aws s3 cp "${CLIENT_DIST_DIR}/favicon.ico" s3://$BUCKET_NAME/favicon.ico --profile "$AWS_PROFILE"
fi

# Upload assets directory (this will delete old assets but preserve other bucket contents)
echo "Uploading assets directory from ${CLIENT_DIST_DIR}..."
aws s3 sync "${CLIENT_DIST_DIR}/assets/" s3://$BUCKET_NAME/assets/ --delete --profile "$AWS_PROFILE"

# Invalidate CloudFront cache for specific client files only
echo "Invalidating CloudFront cache for client files..."
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_ID" \
  --paths "/index.html" "/assets/*" \
  --profile "$AWS_PROFILE" \
  --no-cli-pager

echo "Upload complete. Your site should be available at:"
echo "https://$CLOUDFRONT_DOMAIN" 