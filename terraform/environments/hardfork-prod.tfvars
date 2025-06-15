aws_region     = "us-east-1"
site_id        = "hardfork"
s3_bucket_name = "browse-dot-show"

# Custom domain configuration
custom_domain_name = "hardfork.browse.show"
root_domain_name = "hardfork.browse.show"
enable_custom_domain_on_cloudfront = false  # Set to true after DNS setup

# Lambda warming
enable_search_lambda_warming = false
search_lambda_warming_schedule = "rate(10 minutes)"

# Logging
log_level = "info" 