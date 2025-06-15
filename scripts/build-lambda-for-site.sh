#!/bin/bash

# build-lambda-for-site.sh - Build a lambda for a specific site
# Usage: ./build-lambda-for-site.sh <lambda-package-name> <site-id>
# Example: ./build-lambda-for-site.sh @browse-dot-show/rss-retrieval-lambda listenfairplay

set -e

LAMBDA_PACKAGE_NAME=$1
SITE_ID=$2

if [ -z "$LAMBDA_PACKAGE_NAME" ]; then
    echo "Error: Lambda package name is required"
    echo "Usage: $0 <lambda-package-name> <site-id>"
    exit 1
fi

if [ -z "$SITE_ID" ]; then
    echo "Error: Site ID is required"
    echo "Usage: $0 <lambda-package-name> <site-id>"
    exit 1
fi

# Find the site directory
SITE_DIR=""
if [ -d "sites/my-sites/$SITE_ID" ]; then
    SITE_DIR="sites/my-sites/$SITE_ID"
elif [ -d "sites/origin-sites/$SITE_ID" ]; then
    SITE_DIR="sites/origin-sites/$SITE_ID"
else
    echo "Error: Site '$SITE_ID' not found in sites/my-sites/ or sites/origin-sites/"
    exit 1
fi

# Check if .env.aws exists
if [ ! -f "$SITE_DIR/.env.aws" ]; then
    echo "Error: .env.aws file not found for site '$SITE_ID' at $SITE_DIR/.env.aws"
    exit 1
fi

echo "🏗️  Building lambda '$LAMBDA_PACKAGE_NAME' for site '$SITE_ID'"
echo "📁 Using site directory: $SITE_DIR"
echo "🌐 Using environment file: $SITE_DIR/.env.aws"

# Set CURRENT_SITE_ID and build with site's environment
export CURRENT_SITE_ID=$SITE_ID

# Determine lambda directory based on package name
LAMBDA_DIR=""
if [[ "$LAMBDA_PACKAGE_NAME" == *"search"* ]]; then
    LAMBDA_DIR="packages/search/$(echo $LAMBDA_PACKAGE_NAME | sed 's/@browse-dot-show\///')"
else
    LAMBDA_DIR="packages/ingestion/$(echo $LAMBDA_PACKAGE_NAME | sed 's/@browse-dot-show\///' | sed 's/-lambda//')-lambda"
fi

echo "📦 Lambda directory: $LAMBDA_DIR"
cd "$LAMBDA_DIR"

# Run the build with the site's AWS environment
dotenvx run -f "../../../$SITE_DIR/.env.aws" -- rolldown -c rolldown.config.ts && pnpm __prepare-for-aws

echo "✅ Lambda '$LAMBDA_PACKAGE_NAME' built successfully for site '$SITE_ID'" 