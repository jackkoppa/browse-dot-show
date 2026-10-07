variable "github_repository" {
  description = "owner/repo allowed to assume the roles"
  type        = string
}

variable "create_oidc_provider" {
  description = "Create the GitHub OIDC provider (false if the account already has one)"
  type        = bool
  default     = true
}
