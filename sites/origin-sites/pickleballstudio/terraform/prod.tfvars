# TODO: Configure these values when deploying pickleballstudio for the first time
# This file should be modeled after other sites like myfavoritemurder or lordsoflimited

# TODO: Set the correct AWS region
aws_region     = "us-east-1"

# TODO: Set the correct AWS profile for pickleballstudio's account
aws_profile    = "browse.show-TODO-admin-permissions-ACCOUNT_ID"

# TODO: Confirm site_id matches the directory name
site_id        = "pickleballstudio"

# TODO: Set the correct S3 bucket name
s3_bucket_name = "browse-dot-show"

# TODO: Determine if this site should create the automation role or if it already exists in the account
create_automation_role = false  # Set to true if this is the first site in a new AWS account

# TODO: Set the correct custom domain configuration
custom_domain_name = "pickleballstudio.browse.show"
root_domain_name = "pickleballstudio.browse.show"
enable_custom_domain_on_cloudfront = true

# TODO: Configure Lambda memory sizes based on podcast length and complexity
srt_indexing_lambda_memory_size = 4608
search_lambda_memory_size = 3584

# TODO: Configure Lambda warming if needed
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# TODO: Set appropriate log level
log_level = "info" 