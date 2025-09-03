output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = module.s3_bucket.bucket_name
}

output "cloudfront_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = module.cloudfront.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = module.cloudfront.cloudfront_id
}

output "rss_lambda_function_name" {
  description = "Name of the RSS processing Lambda function"
  value       = module.rss_lambda.lambda_function_name
}

output "whisper_lambda_function_name" {
  description = "Name of the Whisper transcription Lambda function"
  value       = module.whisper_lambda.lambda_function_name
}

output "search_api_invoke_url" {
  description = "The invoke URL for the Search API Gateway"
  value       = aws_apigatewayv2_stage.search_api_stage.invoke_url
}

# Note: Terraform state bucket is managed by bootstrap script, not terraform
# Bucket name follows pattern: {site_id}-browse-dot-show-tf-state

output "search_lambda_function_name" {
  description = "Name of the Search Lambda function"
  value       = module.search_lambda.lambda_function_name
}

output "search_lambda_warming_enabled" {
  description = "Whether search lambda warming is enabled"
  value       = var.enable_search_lambda_warming
}

output "search_lambda_warming_schedule" {
  description = "Schedule expression for search lambda warming (if enabled)"
  value       = var.enable_search_lambda_warming ? var.search_lambda_warming_schedule : "disabled"
}

output "indexing_lambda_function_name" {
  description = "Name of the SRT indexing Lambda function"
  value       = module.indexing_lambda.lambda_function_name
}

output "account_id" {
  description = "AWS Account ID where this site is deployed"
  value       = data.aws_caller_identity.current.account_id
}

output "rss_processing_schedule_enabled" {
  description = "Whether RSS processing schedule is enabled"
  value       = var.enable_rss_processing_schedule
}

output "rss_processing_schedule_expression" {
  description = "Schedule expression for RSS processing (if enabled)"
  value       = var.enable_rss_processing_schedule ? var.rss_processing_schedule_expression : "disabled"
} 