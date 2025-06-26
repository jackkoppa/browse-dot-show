# Lambda Name Migration Strategy

## Problem
The original lambda name `convert-srt-files-into-indexed-search-entries` + site ID + `-role` exceeded AWS's 64-character limit for IAM role names when using longer site IDs like `listenfairplay`.

## Solution
Shortened the lambda name to `convert-srts-indexed-search`, which results in acceptable name lengths:
- Lambda function: `convert-srts-indexed-search-{site_id}` (56 chars for listenfairplay)
- IAM role: `convert-srts-indexed-search-{site_id}-role` (63 chars for listenfairplay)

## Migration Options for Existing Sites

### Option 1: Terraform State Import/Move (Recommended)
This approach renames resources without destroying them, maintaining continuity.

**Steps for each existing site (claretandblue, hardfork, naddpod):**

1. **Rename the Lambda function in AWS Console or via CLI:**
   ```bash
   # Set your site ID
   SITE_ID="claretandblue"  # or hardfork, naddpod
   
   # Get current function configuration
   aws lambda get-function --function-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}" --profile "browse.show-2_admin-permissions-927984855345"
   
   # Create new function with updated code and new name
   # Note: This approach creates a new function, so you'd need to delete the old one
   ```

2. **Use Terraform import to manage the renamed resources:**
   ```bash
   # Import the renamed lambda function
   terraform import module.indexing_lambda.aws_lambda_function.lambda "convert-srts-indexed-search-${SITE_ID}"
   
   # Import the IAM role
   terraform import module.indexing_lambda.aws_iam_role.lambda_exec "convert-srts-indexed-search-${SITE_ID}-role"
   
   # Import policies and attachments...
   ```

### Option 2: Clean Slate Approach (Simplest)
Delete the old lambda and related resources, then deploy fresh with new names.

**Steps for each existing site:**

1. **Delete existing lambda resources via AWS CLI:**
   ```bash
   SITE_ID="claretandblue"  # or hardfork, naddpod
   AWS_PROFILE="browse.show-2_admin-permissions-927984855345"
   
   # Delete lambda function
   aws lambda delete-function \
     --function-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}" \
     --profile "${AWS_PROFILE}"
   
   # Delete IAM policies
   aws iam delete-role-policy \
     --role-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-role" \
     --policy-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-s3-policy" \
     --profile "${AWS_PROFILE}"
   
   # Detach managed policies
   aws iam detach-role-policy \
     --role-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-role" \
     --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
     --profile "${AWS_PROFILE}"
   
   # Delete IAM role
   aws iam delete-role \
     --role-name "convert-srt-files-into-indexed-search-entries-${SITE_ID}-role" \
     --profile "${AWS_PROFILE}"
   ```

2. **Remove old resources from Terraform state:**
   ```bash
   # Remove from terraform state
   terraform state rm module.indexing_lambda.aws_lambda_function.lambda
   terraform state rm module.indexing_lambda.aws_iam_role.lambda_exec
   terraform state rm module.indexing_lambda.aws_iam_policy.s3_access
   terraform state rm module.indexing_lambda.aws_iam_policy.lambda_invoke
   terraform state rm module.indexing_lambda.aws_iam_policy.cloudfront_invalidation
   terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_basic
   terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_s3
   terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_invoke
   terraform state rm module.indexing_lambda.aws_iam_role_policy_attachment.lambda_cloudfront_invalidation
   ```

3. **Deploy fresh with new configuration:**
   ```bash
   terraform plan -var-file=environments/${SITE_ID}-prod.tfvars ...
   terraform apply -var-file=environments/${SITE_ID}-prod.tfvars ...
   ```

### Option 3: Gradual Migration
Keep old lambda temporarily while deploying new one, then switch over.

## Recommendation
**Use Option 2 (Clean Slate)** for the following reasons:
1. Simplest and most straightforward
2. No risk of Terraform state corruption
3. Lambda functions are stateless, so no data loss
4. Quick to execute
5. Clean separation between old and new

## Post-Migration Steps
After migration, you'll need to:
1. Update any external references to the lambda function name
2. Test the new lambda function
3. Verify the ingestion pipeline works end-to-end
4. Update monitoring/alerting if they reference the old lambda name

## Commands to Execute

I'll provide the exact commands for each site below. Run these **one site at a time** and verify each works before proceeding to the next. 