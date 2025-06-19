aws_region     = "us-east-1"
site_id        = "claretandblue"
s3_bucket_name = "browse-dot-show"

# Custom domain configuration
custom_domain_name = "claretandblue.browse.show"
root_domain_name = "claretandblue.browse.show"
enable_custom_domain_on_cloudfront = true

# Lambda warming
enable_search_lambda_warming = false
search_lambda_warming_schedule = "rate(10 minutes)"

# Logging
log_level = "info" 