aws_region     = "us-east-1"
aws_profile    = "Administrator-browse.show-base-089994311986"
site_id        = "hardfork"
s3_bucket_name = "browse-dot-show"

# Custom domain configuration
custom_domain_name = "hardfork.browse.show"
root_domain_name = "hardfork.browse.show"
enable_custom_domain_on_cloudfront = true

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Logging
log_level = "info" 