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
srt_indexing_lambda_memory_size = 500 # Unfortunately, even the max of 10240 is not enough, so this just will not work. See below for future work.

#########
# IMPORTANT TODO 
# CLOUDWATCH LOG FOR REFERENCE - 2025-07-29T12:24:53.550-04:00
# REPORT RequestId: 806ab12b-e660-4a4a-8d9a-eee01e457f98	
# Duration: 376256.59 ms	Billed Duration: 376257 ms	Memory Size: 10239 MB	Max Memory Used: 10239 MB	
# Init Duration: 551.73 ms	Status: error	Error Type: Runtime.OutOfMemory

# Our current architecture - 1 indexing Lambda per site, 1 search Lambda per site - 
# has reached its scaling limit, at a duration of ~900 hours of audio per site
# The potential long-term fix: N number of indexing Lambdas, N number of search Lambdas. 
# With an orchestration Lambda for each.
# The biggest difficulty will be with searching: 
# the orchestration Lambda will need to search 2/3/4 Lambdas that each have their own Orama index, 
# then combine the results from those accordingly into a client-facing response
# Hard - but not impossible - for pagination & sorting, primarily
#########

# Lambda warming
enable_search_lambda_warming = true
search_lambda_warming_schedule = "rate(5 minutes)"

# Search lambda configuration
search_lambda_memory_size = 9216 # Max observed memory as of 2025-07-29: 8267 MB # TODO: Determine new value based on above
search_lambda_timeout = 75 # 45 seconds is the default. 64 seconds is the observed max as of 2025-07-29. Update in future w/ re-architecture plans above

# Logging
log_level = "info" 