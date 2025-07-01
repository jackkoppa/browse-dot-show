# Listen Fair Play - Terraform Configuration

This directory contains the Terraform configuration for deploying the Listen Fair Play application to AWS.

## Architecture

The infrastructure consists of the following components:

1. **S3 Bucket**: Stores audio files, transcriptions, and hosts the static website
2. **CloudFront**: CDN for delivering content
3. **Lambda Functions**:
   - RSS feed retrieval and audio download
   - Whisper API transcription
   - SRT to Search Entries conversion and indexing
   - Search indexed transcripts
4. **API Gateway**: Provides an HTTP endpoint for the search Lambda
5. **EventBridge Scheduler**: Triggers the RSS Lambda function daily

## Search Lambda Warming

To improve user experience by reducing cold start delays, the search Lambda can be configured with an automated warming schedule.

Set `enable_search_lambda_warming = true` in your `.tfvars` file, then re-deploy.

Optionally adjust `search_lambda_warming_schedule` (e.g., `"rate(5 minutes)"` or `"cron(*/7 * * * ? *)"`)


## Environment Strategy

To minimize costs and match expected usage patterns:
- **Production (`prod`)**: The main environment that runs continuously
- **Development (`dev`)**: Temporary environment for testing changes before deploying to production

## Directory Structure

- `/terraform`: Main Terraform configuration
  - `/modules`: Reusable Terraform modules
    - `/s3`: S3 bucket configuration
    - `/cloudfront`: CloudFront distribution
    - `/lambda`: Lambda function setup
    - `/eventbridge`: EventBridge scheduler
  - `/environments`: Environment-specific variable files
    - `dev.tfvars`: Development environment variables
    - `prod.tfvars`: Production environment variables

## Prerequisites

1. Install Terraform (version 1.0.0 or later)
2. Configure AWS CLI with appropriate credentials
3. Build the Lambda functions:
   ```
   cd ../processing
   pnpm build
   cd ../search # Assuming search is at the same level as processing
   pnpm build
   cd ../ # Return to project root or scripts directory
   ```

## Usage

See [/scripts/deploy/README.md](../scripts/deploy/README.md) for usage instructions.