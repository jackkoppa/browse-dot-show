aws_region     = "us-east-1"
aws_profile    = "browse.show-1_admin-permissions-152849157974"
site_id        = "myfavoritemurder"
s3_bucket_name = "browse-dot-show"

# Automation role configuration  
create_automation_role = false  # Role already exists from claretandblue in same account

# Custom domain configuration
custom_domain_name = "myfavoritemurder.browse.show"
root_domain_name = "myfavoritemurder.browse.show"
enable_custom_domain_on_cloudfront = true

# SRT indexing Lambda configuration
srt_indexing_lambda_memory_size = 9728 # Max observed memory as of 2025-07-15: 9149 MB

# Lambda warming
enable_search_lambda_warming = true
# search_lambda_warming_schedule = "rate(5 minutes)"

# Search lambda configuration
search_lambda_memory_size = 8192 # Max observed memory as of 2025-07-15: 6803 MB
search_lambda_timeout = 65 # 45 seconds is the default. As of 2025-07-15, 50 seconds has been enough for `myfavoritemurder` cold start. So leaving buffer here.

# API Gateway configuration
api_gateway_timeout = 30 # TODO - update to 60, once/if https://github.com/hashicorp/terraform-provider-aws/issues/42851 is resolved - needed because cold start is long for big index

# Logging
log_level = "info" 