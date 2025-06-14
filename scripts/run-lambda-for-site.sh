#!/bin/bash

# run-lambda-for-site.sh - Run a lambda for a specific site
# Usage: ./run-lambda-for-site.sh <lambda-package-name> <main-file> <site-id>
# Example: ./run-lambda-for-site.sh @browse-dot-show/rss-retrieval-lambda retrieve-rss-feeds-and-download-audio-files.ts listenfairplay

set -e

LAMBDA_PACKAGE_NAME=$1
MAIN_FILE=$2
SITE_ID=$3

if [ -z "$LAMBDA_PACKAGE_NAME" ]; then
    echo "Error: Lambda package name is required"
    echo "Usage: $0 <lambda-package-name> <main-file> <site-id>"
    exit 1
fi

if [ -z "$MAIN_FILE" ]; then
    echo "Error: Main file is required"
    echo "Usage: $0 <lambda-package-name> <main-file> <site-id>"
    exit 1
fi

if [ -z "$SITE_ID" ]; then
    echo "Error: Site ID is required"
    echo "Usage: $0 <lambda-package-name> <main-file> <site-id>"
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

echo "🚀 Running lambda '$LAMBDA_PACKAGE_NAME' for site '$SITE_ID'"
echo "📁 Using site directory: $SITE_DIR"
echo "🌐 Using environment file: $SITE_DIR/.env.aws"

# Set CURRENT_SITE_ID and run with site's environment
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

# Run the lambda with the site's AWS environment
dotenvx run -f "../../../$SITE_DIR/.env.aws" -- tsx "$MAIN_FILE"

echo "✅ Lambda '$LAMBDA_PACKAGE_NAME' completed for site '$SITE_ID'" 