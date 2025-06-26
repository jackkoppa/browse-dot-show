#!/bin/bash

# Migration script for existing sites to handle lambda name changes
# This script implements Option 2 (Clean Slate) from LAMBDA_MIGRATION_STRATEGY.md

set -e

AWS_PROFILE="Administrator-browse.show-base-089994311986"
SITES=("hardfork")

echo "🚀 Lambda Migration Script for Existing Sites"
echo "This will delete old lambda resources and prepare for new deployment"
echo ""

# Function to delete resources for a single site
migrate_site() {
    local SITE_ID=$1
    echo "📍 Migrating site: ${SITE_ID}"
    
    # Switch to correct terraform backend
    echo "  📋 Configuring terraform backend for ${SITE_ID}..."
    terraform init -backend-config="backend-configs/${SITE_ID}.tfbackend" -reconfigure
    
    # Delete AWS resources
    echo "  🗑️  Deleting old lambda function..."
    aws lambda delete-function \
        --function-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}" \
        --profile "${AWS_PROFILE}" \
        --no-cli-pager || echo "    ⚠️  Lambda function not found (might already be deleted)"
    
    echo "  🗑️  Deleting IAM policies..."
    # List and delete inline policies
    aws iam list-role-policies \
        --role-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-role" \
        --profile "${AWS_PROFILE}" \
        --no-cli-pager \
        --query 'PolicyNames[]' \
        --output text | while read -r policy_name; do
        if [ -n "$policy_name" ]; then
            echo "    🗑️  Deleting inline policy: $policy_name"
            aws iam delete-role-policy \
                --role-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-role" \
                --policy-name "$policy_name" \
                --profile "${AWS_PROFILE}" \
                --no-cli-pager || echo "      ⚠️  Failed to delete policy $policy_name"
        fi
    done
    
    echo "  🗑️  Detaching managed policies..."
    aws iam detach-role-policy \
        --role-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-role" \
        --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
        --profile "${AWS_PROFILE}" \
        --no-cli-pager || echo "    ⚠️  Basic execution policy not attached"
    
    echo "  🗑️  Deleting custom IAM policies..."
    aws iam delete-policy \
        --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --profile ${AWS_PROFILE} --query Account --output text):policy/convert-srt-files-into-indexed-search-entries-${SITE_ID}-s3-policy" \
        --profile "${AWS_PROFILE}" \
        --no-cli-pager || echo "    ⚠️  S3 policy not found"
    
    aws iam delete-policy \
        --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --profile ${AWS_PROFILE} --query Account --output text):policy/convert-srt-files-into-indexed-search-entries-${SITE_ID}-lambda-invoke-policy" \
        --profile "${AWS_PROFILE}" \
        --no-cli-pager || echo "    ⚠️  Lambda invoke policy not found"
    
    aws iam delete-policy \
        --policy-arn "arn:aws:iam::$(aws sts get-caller-identity --profile ${AWS_PROFILE} --query Account --output text):policy/convert-srt-files-into-indexed-search-entries-${SITE_ID}-cloudfront-invalidation-policy" \
        --profile "${AWS_PROFILE}" \
        --no-cli-pager || echo "    ⚠️  CloudFront policy not found"
    
    echo "  🗑️  Deleting IAM role..."
    aws iam delete-role \
        --role-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-role" \
        --profile "${AWS_PROFILE}" \
        --no-cli-pager || echo "    ⚠️  IAM role not found"
    
    echo "  📝 Removing resources from Terraform state..."
    terraform state rm module.indexing_lambda.aws_lambda_function.lambda || echo "    ⚠️  Lambda function not in state"
    terraform state rm module.indexing_lambda.aws_iam_role.lambda_exec || echo "    ⚠️  IAM role not in state"
    terraform state rm module.indexing_lambda.aws_iam_policy.s3_access || echo "    ⚠️  S3 policy not in state"
    terraform state rm module.indexing_lambda.aws_iam_policy.lambda_invoke || echo "    ⚠️  Lambda invoke policy not in state"
    terraform state rm module.indexing_lambda.aws_iam_policy.cloudfront_invalidation || echo "    ⚠️  CloudFront policy not in state"
    terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_basic || echo "    ⚠️  Basic policy attachment not in state"
    terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_s3 || echo "    ⚠️  S3 policy attachment not in state"
    terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_invoke || echo "    ⚠️  Lambda invoke policy attachment not in state"
    terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_cloudfront_invalidation || echo "    ⚠️  CloudFront policy attachment not in state"
    
    echo "  ✅ Migration complete for ${SITE_ID}"
    echo ""
}

# Main execution
cd terraform

echo "⚠️  WARNING: This will delete existing lambda resources for the following sites:"
for site in "${SITES[@]}"; do
    echo "  - $site"
done
echo ""
echo "After this script completes, you'll need to redeploy each site to create the new lambda with the shorter name."
echo ""
read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration cancelled"
    exit 1
fi

echo ""
echo "🚀 Starting migration for all sites..."
echo ""

for site in "${SITES[@]}"; do
    migrate_site "$site"
done

echo "🎉 Migration complete for all sites!"
echo ""
echo "Next steps:"
echo "1. Deploy listenfairplay (the new site): pnpm deploy:site listenfairplay"
echo "2. Redeploy each existing site to create new lambda:"
echo "   - pnpm deploy:site claretandblue"
echo "   - pnpm deploy:site hardfork"
echo "   - pnpm deploy:site naddpod"
echo ""
echo "📖 See terraform/LAMBDA_MIGRATION_STRATEGY.md for more details" 