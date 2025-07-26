aws_region     = "us-east-1"
aws_profile    = "browse.show-1_admin-permissions-152849157974"
site_id        = "SITE_ID"
s3_bucket_name = "browse-dot-show"

# Automation role configuration  
create_automation_role = false  # Role already exists from claretandblue in same account

# Custom domain configuration
custom_domain_name = "SITE_ID.browse.show"
root_domain_name = "SITE_ID.browse.show"
enable_custom_domain_on_cloudfront = true

# SRT indexing Lambda configuration
srt_indexing_lambda_memory_size = 5632 # Adjust based on your podcast size

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Search lambda configuration
search_lambda_memory_size = 4096  # Adjust based on your podcast size

# Logging
log_level = "info" 