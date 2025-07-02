terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.31.0"
    }
  }
  
  # Site-specific S3 backend for terraform state
  # The bucket name and key will be configured dynamically via terraform init
  # Each site will use: bucket = "{site_id}-terraform-state", key = "terraform.tfstate"
  backend "s3" {
    # These values will be provided via terraform init -backend-config
    # or via .tfbackend files for each site
    encrypt = true
    region  = "us-east-1"
  }

  required_version = ">= 1.0.0"
}

provider "aws" {
  region = var.aws_region
  
  # Use AWS profile from environment variable (set via site-specific .env.aws-sso)
  profile = var.aws_profile
  
  default_tags {
    tags = {
      Project   = "browse-dot-show"
      Site      = var.site_id
      ManagedBy = "terraform"
    }
  }
}

# Get current AWS account information
data "aws_caller_identity" "current" {}

# Additional provider for us-east-1 (required for CloudFront certificates)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  profile = var.aws_profile
  
  default_tags {
    tags = {
      Project   = "browse-dot-show"
      Site      = var.site_id
      ManagedBy = "terraform"
    }
  }
}

# S3 bucket for storing podcast files and hosting website
module "s3_bucket" {
  source = "./modules/s3"
  
  bucket_name          = "${var.site_id}-${var.s3_bucket_name}"
  site_id              = var.site_id
  cors_allowed_origins = ["*"]  # Adjust as needed
}

# FFmpeg Lambda Layer for media processing
resource "aws_lambda_layer_version" "ffmpeg_layer" {
  filename         = "lambda-layers/ffmpeg-layer.zip"
  layer_name       = "ffmpeg-${var.site_id}"
  source_code_hash = filebase64sha256("lambda-layers/ffmpeg-layer.zip")
  
  compatible_runtimes      = ["nodejs20.x"]
  compatible_architectures = ["arm64"]
  
  description = "FFmpeg static binaries for audio/video processing - ${var.site_id}"
}

# SSL Certificate for custom domain (must be in us-east-1 for CloudFront)
resource "aws_acm_certificate" "custom_domain" {
  count = var.custom_domain_name != "" ? 1 : 0

  domain_name       = var.custom_domain_name
  validation_method = "DNS"

  # CloudFront requires certificates to be in us-east-1
  provider = aws.us_east_1

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.site_id}-ssl-certificate"
    Site = var.site_id
  }
}

# CloudFront distribution
module "cloudfront" {
  source = "./modules/cloudfront"
  
  bucket_name                 = module.s3_bucket.bucket_name
  bucket_regional_domain_name = module.s3_bucket.bucket_regional_domain_name
  site_id                     = var.site_id
  
  # Add custom domain configuration
  custom_domain_name  = var.custom_domain_name
  enable_custom_domain = var.enable_custom_domain_on_cloudfront
  certificate_arn     = (var.enable_custom_domain_on_cloudfront && var.custom_domain_name != "") ? aws_acm_certificate.custom_domain[0].arn : ""
}

# Wait for the S3 bucket to be fully configured
resource "time_sleep" "wait_for_bucket_configuration" {
  depends_on = [module.s3_bucket]
  create_duration = "10s"
}

# Update S3 bucket policy with CloudFront distribution ARN
resource "aws_s3_bucket_policy" "cloudfront_access" {
  bucket = module.s3_bucket.bucket_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action    = "s3:GetObject"
        Resource  = "${module.s3_bucket.bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cloudfront.cloudfront_arn
          }
        }
      }
    ]
  })
  depends_on = [module.cloudfront, time_sleep.wait_for_bucket_configuration]
}

# Lambda for RSS feed processing
module "rss_lambda" {
  source = "./modules/lambda"
  
  function_name        = "retrieve-rss-feeds-and-download-audio-files-${var.site_id}"
  handler              = "retrieve-rss-feeds-and-download-audio-files.handler"
  runtime              = "nodejs20.x"
  timeout              = 300
  memory_size          = 2560
  environment_variables = {
    S3_BUCKET_NAME            = module.s3_bucket.bucket_name
    LOG_LEVEL                 = var.log_level
    CLOUDFRONT_DISTRIBUTION_ID = module.cloudfront.cloudfront_id
    SITE_ID                   = var.site_id
  }
  source_dir           = "../../packages/ingestion/rss-retrieval-lambda/aws-dist"
  s3_bucket_name       = module.s3_bucket.bucket_name
  site_id              = var.site_id
  lambda_architecture  = ["arm64"]

}

# Lambda for Whisper transcription
module "whisper_lambda" {
  source = "./modules/lambda"
  
  function_name        = "process-new-audio-files-via-whisper-${var.site_id}"
  handler              = "process-new-audio-files-via-whisper.handler"
  runtime              = "nodejs20.x"
  timeout              = 900
  memory_size          = 1024
  environment_variables = {
    S3_BUCKET_NAME     = module.s3_bucket.bucket_name
    OPENAI_API_KEY     = var.openai_api_key
    LOG_LEVEL          = var.log_level
    SITE_ID            = var.site_id
  }
  source_dir           = "../../packages/ingestion/process-audio-lambda/aws-dist"
  s3_bucket_name       = module.s3_bucket.bucket_name
  site_id              = var.site_id
  lambda_architecture  = ["arm64"]
  layers               = [aws_lambda_layer_version.ffmpeg_layer.arn]
}

# EventBridge schedule for daily RSS processing
module "eventbridge_schedule" {
  source = "./modules/eventbridge"
  
  schedule_name        = "daily-rss-processing-${var.site_id}"
  schedule_expression  = "cron(0 1,8,16 * * ? *)"  # Run at 1 AM, 8 AM, and 4 PM UTC daily
  lambda_function_arn  = module.rss_lambda.lambda_function_arn
  site_id              = var.site_id
}

# IAM permissions to allow Lambda 1 to trigger Lambda 2
resource "aws_lambda_permission" "allow_lambda1_to_invoke_lambda2" {
  statement_id  = "AllowExecutionFromLambda1"
  action        = "lambda:InvokeFunction"
  function_name = module.whisper_lambda.lambda_function_name
  principal     = "lambda.amazonaws.com"
  source_arn    = module.rss_lambda.lambda_function_arn
}

# Lambda for SRT to Search Entries conversion
module "indexing_lambda" {
  source = "./modules/lambda"

  function_name        = "convert-srts-indexed-search-${var.site_id}"
  handler              = "convert-srts-indexed-search.handler"
  runtime              = "nodejs20.x"
  timeout              = 600 # See PROCESSING_TIME_LIMIT_MINUTES in convert-srts-indexed-search.ts
  memory_size          = 3008 
  ephemeral_storage    = 2048 # Space for the Orama index file
  environment_variables = {
    S3_BUCKET_NAME     = module.s3_bucket.bucket_name
    LOG_LEVEL          = var.log_level
    SITE_ID            = var.site_id
  }
  source_dir           = "../../packages/ingestion/srt-indexing-lambda/aws-dist"
  s3_bucket_name       = module.s3_bucket.bucket_name
  site_id              = var.site_id
  lambda_architecture  = ["arm64"]
}

# IAM permissions to allow Lambda 2 (Whisper) to trigger Lambda 3 (Indexing)
resource "aws_lambda_permission" "allow_lambda2_to_invoke_lambda3" {
  statement_id  = "AllowExecutionFromLambda2"
  action        = "lambda:InvokeFunction"
  function_name = module.indexing_lambda.lambda_function_name
  principal     = "lambda.amazonaws.com"
  source_arn    = module.whisper_lambda.lambda_function_arn
}

# Lambda for Search
module "search_lambda" {
  source = "./modules/lambda"

  function_name        = "search-indexed-transcripts-${var.site_id}"
  handler              = "search-indexed-transcripts.handler"
  runtime              = "nodejs20.x"
  timeout              = 45 # While we hope all warm requests are < 500ms, we need sufficient time for cold starts, to load the Orama index file
  memory_size          = var.search_lambda_memory_size # Configurable per-site, default 3008
  ephemeral_storage    = 2048 # Space for the Orama index file
  environment_variables = {
    S3_BUCKET_NAME     = module.s3_bucket.bucket_name
    LOG_LEVEL          = var.log_level
    SITE_ID            = var.site_id
    FILE_STORAGE_ENV   = "prod-s3"
  }
  source_dir           = "../../packages/search/search-lambda/aws-dist"
  s3_bucket_name       = module.s3_bucket.bucket_name
  site_id              = var.site_id
  lambda_architecture  = ["arm64"]
}

# EventBridge schedule for search lambda warming (conditional)
module "search_lambda_warming_schedule" {
  count  = var.enable_search_lambda_warming ? 1 : 0
  source = "./modules/eventbridge"
  
  schedule_name        = "search-lambda-warming-${var.site_id}"
  schedule_expression  = var.search_lambda_warming_schedule
  lambda_function_arn  = module.search_lambda.lambda_function_arn
  site_id              = var.site_id
}

# API Gateway for Search Lambda
resource "aws_apigatewayv2_api" "search_api" {
  name          = "search-transcripts-api-${var.site_id}"
  protocol_type = "HTTP"
  target        = module.search_lambda.lambda_function_arn

  cors_configuration {
    allow_origins = concat(
      ["https://${module.cloudfront.cloudfront_domain_name}"],
      (var.enable_custom_domain_on_cloudfront && var.custom_domain_name != "") ? ["https://${var.custom_domain_name}"] : []
    )
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "search_api_stage" {
  api_id      = aws_apigatewayv2_api.search_api.id
  name        = "prod"
  auto_deploy = true
}

# Implicit integration is created by setting `target` in aws_apigatewayv2_api for simple Lambda proxy.
# For more complex routing or request/response transformations, explicit aws_apigatewayv2_integration and aws_apigatewayv2_route would be needed.

# IAM permission for API Gateway to invoke Search Lambda
resource "aws_lambda_permission" "allow_apigw_to_invoke_search_lambda" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.search_lambda.lambda_function_name
  principal     = "apigateway.amazonaws.com"

  # The source_arn should be specific to the API Gateway execution ARN for the route and stage
  source_arn = "${aws_apigatewayv2_api.search_api.execution_arn}/prod/*"
}

# IAM role for automation account to assume (only create if this is the first site in the account)
resource "aws_iam_role" "automation_role" {
  count = var.create_automation_role ? 1 : 0
  name  = "browse-dot-show-automation-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.automation_account_id}:user/automation/browse-dot-show-automation"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
  
  tags = {
    Name = "${var.site_id}-automation-role"
    Site = var.site_id
  }
}

# Data source to reference existing automation role if not creating it
data "aws_iam_role" "existing_automation_role" {
  count = var.create_automation_role ? 0 : 1
  name  = "browse-dot-show-automation-role"
}

# Local value to reference the correct role ARN regardless of whether we created it or not
locals {
  automation_role_arn = var.create_automation_role ? aws_iam_role.automation_role[0].arn : data.aws_iam_role.existing_automation_role[0].arn
  automation_role_id  = var.create_automation_role ? aws_iam_role.automation_role[0].id : data.aws_iam_role.existing_automation_role[0].id
}

# Automation permissions for S3 and Lambda (always create, but reference the correct role)
resource "aws_iam_role_policy" "automation_permissions" {
  name = "browse-dot-show-automation-permissions-${var.site_id}"
  role = local.automation_role_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:DeleteObject"
        ]
        Resource = "${module.s3_bucket.bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = "lambda:InvokeFunction"
        Resource = module.indexing_lambda.lambda_function_arn
      }
    ]
  })
}

# Note: Terraform state bucket is created by the bootstrap script
# See: scripts/deploy/bootstrap-terraform-state.sh 