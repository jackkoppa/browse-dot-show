aws_region     = "us-east-1"
aws_profile    = "browse.show-1_admin-permissions-152849157974"
site_id        = "lordsoflimited"
s3_bucket_name = "browse-dot-show"

# Automation role configuration  
create_automation_role = false  # Role already exists from claretandblue in same account

# Custom domain configuration
custom_domain_name = "lordsoflimited.browse.show"
root_domain_name = "lordsoflimited.browse.show"
enable_custom_domain_on_cloudfront = true

# SRT indexing Lambda configuration
srt_indexing_lambda_memory_size = 4608 # Max observed memory as of 2025-07-16: 4095 MB

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Search lambda configuration
search_lambda_memory_size = 3584  # Max observed memory as of 2025-07-16: 2736 MB

# Logging
log_level = "info" 