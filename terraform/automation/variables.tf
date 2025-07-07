variable "automation_user_name" {
  description = "Name for the IAM user that will perform automated operations"
  type        = string
  default     = "browse-dot-show-automation"
}

variable "deployed_sites" {
  description = "List of site IDs that are deployed and need automation access"
  type        = list(string)
  default     = ["claretandblue", "hardfork", "listenfairplay", "naddpod", "searchengine", "myfavoritemurder"]
}

variable "site_account_ids" {
  description = "Map of site IDs to their AWS account IDs (hardcoded for now)"
  type        = map(string)
  default     = {}
}

variable "aws_region" {
  description = "The AWS region for automation resources"
  type        = string
  default     = "us-east-1"
}

variable "automation_account_id" {
  description = "AWS account ID where the automation user will be created"
  type        = string
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "browse-dot-show"
    Component   = "automation"
    ManagedBy   = "terraform"
    Environment = "automation"
  }
} 