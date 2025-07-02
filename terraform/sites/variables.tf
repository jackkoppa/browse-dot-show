variable "aws_region" {
  description = "The AWS region to deploy resources into"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "The AWS profile to use for authentication (for SSO)"
  type        = string
  default     = null
}

variable "site_id" {
  description = "The unique identifier for the site (e.g., listenfairplay, hardfork, naddpod)"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", var.site_id))
    error_message = "Site ID must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen."
  }
}

variable "s3_bucket_name" {
  description = "The name of the S3 bucket for storing podcast files and hosting the website (will be prefixed with site_id)"
  type        = string
  default     = "browse-dot-show"
}

variable "automation_account_id" {
  description = "AWS account ID for the central automation account"
  type        = string
  default     = "297202224084"
}

variable "create_automation_role" {
  description = "Whether this site should create the automation role (only one site per AWS account should create it)"
  type        = bool
  default     = false
}

variable "openai_api_key" {
  description = "OpenAI API key for Whisper transcription"
  type        = string
  sensitive   = true
  default     = ""
}

variable "log_level" {
  description = "log level (trace, debug, info, warn, or error)"
  type        = string
  default     = "info"
}

variable "custom_domain_name" {
  description = "The custom domain name for the website (e.g., listenfairplay.com)"
  type        = string
  default     = ""
}

variable "root_domain_name" {
  description = "The root domain name (e.g., listenfairplay.com)"
  type        = string
  default     = ""
}

variable "enable_custom_domain_on_cloudfront" {
  description = "Whether to enable custom domain on CloudFront (set to false initially, then true after DNS validation)"
  type        = bool
  default     = false
}

variable "enable_search_lambda_warming" {
  description = "Whether to enable scheduled warming of the search lambda to reduce cold starts"
  type        = bool
  default     = false
}

variable "search_lambda_warming_schedule" {
  description = "Schedule expression for search lambda warming (e.g., 'rate(10 minutes)' or 'cron(*/7 * * * ? *)')"
  type        = string
  default     = "rate(5 minutes)"
}

variable "search_lambda_memory_size" {
  description = "Memory size in MB for the search lambda function"
  type        = number
  default     = 3008
}