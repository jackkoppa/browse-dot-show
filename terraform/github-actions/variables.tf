variable "github_repository" {
  description = "owner/repo whose workflows may assume the roles"
  type        = string
}

variable "accounts" {
  description = "The three AWS accounts: an admin SSO profile for each, and whether to create the GitHub OIDC provider there"
  type = object({
    homepage = object({ profile = string, create_oidc_provider = bool })
    sites_1  = object({ profile = string, create_oidc_provider = bool })
    sites_2  = object({ profile = string, create_oidc_provider = bool })
  })
}
