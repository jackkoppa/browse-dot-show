output "s3_bucket_name" {
  description = "Name of the S3 bucket hosting the homepage"
  value       = aws_s3_bucket.homepage.bucket
}

output "cloudfront_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.homepage.domain_name
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.homepage.id
}

output "ssl_certificate_arn" {
  description = "ARN of the SSL certificate"
  value       = aws_acm_certificate.homepage.arn
}

output "ssl_certificate_validation_options" {
  description = "Certificate validation options for DNS validation"
  value       = aws_acm_certificate.homepage.domain_validation_options
}

output "homepage_url" {
  description = "URL of the deployed homepage"
  value       = "https://${var.domain_name}"
} 