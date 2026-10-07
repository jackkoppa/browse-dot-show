variable "automation_user_name" {
  description = "Name for the IAM user that will perform automated operations"
  type        = string
  default     = "browse-dot-show-automation"
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