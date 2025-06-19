aws_region     = "us-east-1"
site_id        = "naddpod"
s3_bucket_name = "browse-dot-show"

# Custom domain configuration
custom_domain_name = "naddpod.browse.show"
root_domain_name = "naddpod.browse.show"
enable_custom_domain_on_cloudfront = true

# Lambda warming
enable_search_lambda_warming = false
search_lambda_warming_schedule = "rate(10 minutes)"

# Search lambda configuration
search_lambda_memory_size = 3004 # TODO - switch to >= 5120 if AWS Support is able to increase the current hard cap for the account of 3 GB

# Logging
log_level = "info" 