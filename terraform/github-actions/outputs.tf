output "role_arns" {
  description = "Plan and deploy role ARNs per account"
  value = {
    homepage = { plan = module.homepage.plan_role_arn, deploy = module.homepage.deploy_role_arn }
    sites_1  = { plan = module.sites_1.plan_role_arn, deploy = module.sites_1.deploy_role_arn }
    sites_2  = { plan = module.sites_2.plan_role_arn, deploy = module.sites_2.deploy_role_arn }
  }
}
