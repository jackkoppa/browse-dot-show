variable "site_id" {
  description = "Unique identifier for the site"
  type        = string
  default     = "pickleballstudio"
}

variable "domain_name" {
  description = "Domain name for the site"
  type        = string
  default     = "pickleballstudio.browse.show"
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}
