github_repository = "jackkoppa/browse-dot-show"

# Admin SSO profiles (the same ones the site/homepage deploys use)
accounts = {
  homepage = { profile = "browse.show-0_admin-permissions-297202224084", create_oidc_provider = true } # account 0: homepage, automation user
  sites_1  = { profile = "browse.show-1_admin-permissions-152849157974", create_oidc_provider = true } # 11 sites
  sites_2  = { profile = "browse.show-2_admin-permissions-927984855345", create_oidc_provider = true } # 12 sites
}
