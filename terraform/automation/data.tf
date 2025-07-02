# TODO: Future enhancement - read remote state from each deployed site's terraform configuration
# Currently using hardcoded account IDs since automation account doesn't have terraform state access yet
# data "terraform_remote_state" "sites" {
#   for_each = toset(var.deployed_sites)
#   
#   backend = "s3"
#   
#   config = {
#     bucket = "${each.value}-terraform-state"
#     key    = "terraform.tfstate"
#     region = var.aws_region
#   }
# }

# Get current AWS account ID for the automation account
data "aws_caller_identity" "current" {}

# Get current AWS region
data "aws_region" "current" {} 