output "automation_user_name" {
  description = "Name of the automation IAM user"
  value       = aws_iam_user.automation_user.name
}

output "automation_user_arn" {
  description = "ARN of the automation IAM user"
  value       = aws_iam_user.automation_user.arn
}

output "automation_access_key_id" {
  description = "Access key ID for the automation user"
  value       = aws_iam_access_key.automation_key.id
  sensitive   = false
}

output "automation_secret_access_key" {
  description = "Secret access key for the automation user"
  value       = aws_iam_access_key.automation_key.secret
  sensitive   = true
}

output "deployed_sites" {
  description = "List of sites that have automation access configured"
  value       = var.deployed_sites
}

output "site_account_ids" {
  description = "Map of site IDs to their AWS account IDs"
  value = {
    for site_id in var.deployed_sites :
    site_id => var.site_account_ids[site_id]
  }
}

output "automation_role_arns" {
  description = "Map of site IDs to their automation role ARNs"
  value = {
    for site_id in var.deployed_sites :
    site_id => "arn:aws:iam::${var.site_account_ids[site_id]}:role/browse-dot-show-automation-role"
  }
}

# Output for .env.automation file template
output "env_automation_template" {
  description = "Template for .env.automation file"
  value = <<-EOT
# AWS credentials for automated ingestion runs
# These credentials should have permissions to assume roles in all site accounts

# The AWS profile to use for automation
SCHEDULED_RUN_MAIN_AWS_PROFILE=browse-dot-show-automation

# AWS credentials for the automation user
AWS_ACCESS_KEY_ID=${aws_iam_access_key.automation_key.id}
AWS_SECRET_ACCESS_KEY=${aws_iam_access_key.automation_key.secret}
AWS_REGION=${var.aws_region}

# Site account mappings (for reference)
${join("\n", [for site_id, account_id in {
  for site_id in var.deployed_sites :
  site_id => var.site_account_ids[site_id]
} : "# ${site_id}_ACCOUNT_ID=${account_id}"])}
EOT
  sensitive = true
} 