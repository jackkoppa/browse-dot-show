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

variable "domain_names" {
  description = "Custom domains (aliases) the distribution serves; certificate_arn must cover all of them"
  type        = list(string)
  default     = []
}

variable "certificate_arn" {
  description = "ARN of the SSL certificate for the custom domains (empty for CloudFront's default certificate)"
  type        = string
  default     = ""
}
