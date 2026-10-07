# Local values for automation configuration

locals {
  # Deployed sites and their AWS accounts, from the committed .site-account-mappings.json
  # (written by `bds site deploy`)
  site_account_mappings = jsondecode(file("${path.root}/../../.site-account-mappings.json"))
  site_account_ids      = { for site_id, mapping in local.site_account_mappings : site_id => mapping.accountId }
  deployed_sites        = sort(keys(local.site_account_ids))

  # The automation user may assume browse-dot-show-automation-role in every account that
  # hosts a site (one role per account, shared by its sites)
  site_account_id_list = sort(distinct(values(local.site_account_ids)))
  automation_role_arns = [for account_id in local.site_account_id_list : "arn:aws:iam::${account_id}:role/browse-dot-show-automation-role"]
}
