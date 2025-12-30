aws_region     = "us-east-1"
aws_profile    = "SETUP_AWS_PROFILE_AFTER_ACCOUNT_CREATION"
site_id        = "iwltrubbish"
s3_bucket_name = "browse-dot-show"

# Automation role configuration  
create_automation_role = false  # Role already exists from claretandblue in same account

# Custom domain configuration
custom_domain_name = "iwantlistenthisrubbish.com"
root_domain_name = "iwantlistenthisrubbish.com"
enable_custom_domain_on_cloudfront = false  # TEMPORARILY disabled to avoid CNAME conflict with old deployment

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Logging
log_level = "info"

## OPTIONAL

## Search lambda configuration
search_lambda_memory_size = 8192 # Max observed memory as of 2025-12-29: ______ MB -- TODO: Confirm
search_lambda_timeout = 65 # 45 seconds is the default. As of 2025-12-29, ____ seconds has been enough for `iwltrubbish` cold start. TODO: Test further

# SRT indexing Lambda configuration
srt_indexing_lambda_memory_size = 9728 # Max observed memory as of 2025-12-29: ______ MB -- TODO: Confirm