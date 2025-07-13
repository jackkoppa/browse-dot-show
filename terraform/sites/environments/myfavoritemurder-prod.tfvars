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
srt_indexing_lambda_memory_size = 8192 # Currently, myfavoritemurder has the largest index size, and thus we need the most memory for its indexing Lambda

# Lambda warming
enable_search_lambda_warming = false # Re-enable when search works reliably (i.e. enough memory, currently testing 8192 MB)
# search_lambda_warming_schedule = "rate(5 minutes)"

# Search lambda configuration
search_lambda_memory_size = 8192 # Currently, myfavoritemurder has the largest index size, and thus we need the most memory for its search Lambda
search_lambda_timeout = 75 # 45 seconds is the default; so far, 55 has seemed to be enough for `myfavoritemurder` cold start. So leaving buffer here.

# Logging
log_level = "info" 