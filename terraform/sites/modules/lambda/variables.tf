variable "function_name" {
  description = "The name of the Lambda function"
  type        = string
}

variable "handler" {
  description = "The handler for the Lambda function"
  type        = string
}

variable "runtime" {
  description = "The runtime for the Lambda function"
  type        = string
  default     = "nodejs24.x"
}

variable "memory_size" {
  description = "The memory size for the Lambda function in MB"
  type        = number
  default     = 128
}

variable "ephemeral_storage" {
  description = "The ephemeral storage (file storage) size for the Lambda function in MB"
  type        = number
  default     = 512
}

variable "timeout" {
  description = "The timeout for the Lambda function in seconds"
  type        = number
  default     = 30
}

variable "environment_variables" {
  description = "Environment variables for the Lambda function"
  type        = map(string)
  default     = {}
}

variable "source_dir" {
  description = "The directory containing the Lambda function code"
  type        = string
}

variable "s3_bucket_name" {
  description = "The name of the S3 bucket that the Lambda will access"
  type        = string
}

variable "site_id" {
  description = "The unique identifier for the site"
  type        = string
}

variable "lambda_architecture" {
  description = "Lambda function architecture (e.g., [\"x86_64\"] or [\"arm64\"])"
  type        = list(string)
  default     = ["arm64"] # Default to arm64 for decreased costs / better performance
}

variable "layers" {
  description = "List of Lambda layer ARNs to attach to the function"
  type        = list(string)
  default     = []
}

variable "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution, required for invalidation permissions."
  type        = string
  default     = "" # Provide a default or make it mandatory
} 