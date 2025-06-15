aws_region     = "us-east-1"
site_id        = "listenfairplay"
s3_bucket_name = "browse-dot-show"

# Custom domain configuration
custom_domain_name = "listenfairplay.com"
root_domain_name = "listenfairplay.com"
enable_custom_domain_on_cloudfront = true

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Logging
log_level = "info" 