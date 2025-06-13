variable "bucket_name" {
  description = "The name of the S3 bucket"
  type        = string
}

variable "site_id" {
  description = "The unique identifier for the site"
  type        = string
}

variable "cors_allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
  default     = ["*"]
}

variable "cloudfront_distribution_arn" {
  description = "The ARN of the CloudFront distribution that can access the S3 bucket"
  type        = string
  default     = null
} 