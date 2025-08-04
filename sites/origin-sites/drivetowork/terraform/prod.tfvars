aws_region     = "us-east-1"
aws_profile    = "SETUP_AWS_PROFILE_AFTER_ACCOUNT_CREATION"
site_id        = "drivetowork"
s3_bucket_name = "browse-dot-show"

# Automation role configuration  
create_automation_role = false  # Role already exists from claretandblue in same account

# Custom domain configuration
custom_domain_name = "drivetowork.browse.show"
root_domain_name = "drivetowork.browse.show"
enable_custom_domain_on_cloudfront = true

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Logging
log_level = "info"

#########
# IMPORTANT TODO - See /sites/limitedresources - same issue for this site, re: max size

## OPTIONAL

## Search lambda configuration
# Search lambda configuration
search_lambda_memory_size = 5632  # Max observed memory as of 2025-08-03: 4548 MB

# SRT indexing Lambda configuration
srt_indexing_lambda_memory_size = 500 # Unfortunately, even the max of 10240 is not enough, so this just will not work. See above for future work.