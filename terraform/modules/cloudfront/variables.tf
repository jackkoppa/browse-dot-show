variable "bucket_name" {
  description = "The name of the S3 bucket"
  type        = string
}

variable "bucket_regional_domain_name" {
  description = "The regional domain name of the S3 bucket"
  type        = string
}

variable "site_id" {
  description = "The unique identifier for the site"
  type        = string
}

variable "custom_domain_name" {
  description = "Custom domain name for the CloudFront distribution"
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ARN of the SSL certificate for the custom domain"
  type        = string
  default     = ""
}

variable "enable_custom_domain" {
  description = "Whether to enable custom domain on CloudFront"
  type        = bool
  default     = false
} 