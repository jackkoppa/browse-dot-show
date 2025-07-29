aws_region     = "us-east-1"
aws_profile    = "browse.show-2_admin-permissions-927984855345"
site_id        = "limitedresources"
s3_bucket_name = "browse-dot-show"

# Automation role configuration
create_automation_role = false  # Role already exists from hardfork in same account

# Custom domain configuration
custom_domain_name = "limitedresources.browse.show"
root_domain_name = "limitedresources.browse.show"
enable_custom_domain_on_cloudfront = true

# SRT indexing Lambda configuration
srt_indexing_lambda_memory_size = 10239 # Max observed memory as of 2025-07-29: _____ MB

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Search lambda configuration
search_lambda_memory_size = 10239 # Max observed memory as of 2025-07-29: _____ MB

# Logging
log_level = "info" 