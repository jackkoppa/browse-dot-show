aws_region     = "us-east-1"
aws_profile    = "browse.show-1_admin-permissions-152849157974"
site_id        = "claretandblue"
s3_bucket_name = "browse-dot-show"

# Automation role configuration
create_automation_role = true  # claretandblue was first site in this account, so it creates the role

# Custom domain configuration
custom_domain_name = "claretandblue.browse.show"
root_domain_name = "claretandblue.browse.show"
enable_custom_domain_on_cloudfront = true

# SRT indexing Lambda configuration
srt_indexing_lambda_memory_size = 7168 # Max observed memory as of 2025-07-15: 5698 MB

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Search lambda configuration
search_lambda_memory_size = 5120  # Max observed memory as of 2025-07-15: 4205 MB

# Logging
log_level = "info"