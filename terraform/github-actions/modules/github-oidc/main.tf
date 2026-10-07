# GitHub Actions OIDC access for one AWS account: the identity provider, a read-only role for
# PR plans and a deploy role for merges to main. Names are fixed: the workflows derive role
# ARNs from the account ID (arn:aws:iam::<account>:role/browse-dot-show-gha-<plan|deploy>).

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

locals {
  github_oidc_url = "token.actions.githubusercontent.com"
  provider_arn    = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://${local.github_oidc_url}"
  client_id_list = ["sts.amazonaws.com"]
  # AWS no longer checks these for GitHub's provider, but this provider version requires them
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://${local.github_oidc_url}"
}

data "aws_iam_policy_document" "trust" {
  for_each = {
    # PR workflows: `sub` is repo:<owner>/<repo>:pull_request. Fork PRs can't get a token.
    plan = ["repo:${var.github_repository}:pull_request"]
    # Pushes to main (and workflow_dispatch on main), from jobs without a GitHub environment
    deploy = ["repo:${var.github_repository}:ref:refs/heads/main"]
  }

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_url}:sub"
      values   = each.value
    }
  }
}

resource "aws_iam_role" "plan" {
  name                 = "browse-dot-show-gha-plan"
  description          = "GitHub Actions: read-only Terraform plans for PRs in ${var.github_repository}"
  assume_role_policy   = data.aws_iam_policy_document.trust["plan"].json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role" "deploy" {
  name                 = "browse-dot-show-gha-deploy"
  description          = "GitHub Actions: deploys (Terraform apply, client uploads) on merges to main in ${var.github_repository}"
  assume_role_policy   = data.aws_iam_policy_document.trust["deploy"].json
  max_session_duration = 7200
}

# Terraform for terraform/sites manages S3, CloudFront, Lambda, API Gateway, IAM roles, ACM,
# EventBridge and CloudWatch Logs, so start broad; only main can assume this role.
resource "aws_iam_role_policy_attachment" "deploy_admin" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
