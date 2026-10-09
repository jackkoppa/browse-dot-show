variable "aws_region" {
  description = "The AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "The AWS profile to use (SSO); null in CI"
  type        = string
  default     = null
}

variable "ssm_parameter_prefix" {
  description = "Prefix of the SSM parameters holding the auth lambda's secrets (see README.md)"
  type        = string
  default     = "/browse-dot-show/auth"
}

variable "extra_site_origins" {
  description = "Extra origins per site that may use the auth API, besides the site's domain and canonical URL (e.g. additional domains)"
  type        = map(list(string))
  default     = {}
}

variable "log_level" {
  description = "log level (trace, debug, info, warn, or error)"
  type        = string
  default     = "info"
}

variable "throttling_rate_limit" {
  description = "Steady-state requests per second the auth API accepts"
  type        = number
  default     = 5
}

variable "throttling_burst_limit" {
  description = "Burst of requests the auth API accepts"
  type        = number
  default     = 10
}
