variable "aws_region" {
  description = "The AWS region to deploy homepage resources into"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "The AWS profile to use for authentication (for SSO)"
  type        = string
  default     = null
}

variable "domain_name" {
  description = "The domain name for the homepage (e.g., browse.show)"
  type        = string
  default     = "browse.show"
}

variable "bucket_name" {
  description = "The name of the S3 bucket for hosting homepage static files"
  type        = string
  default     = "browse-dot-show-homepage"
} 