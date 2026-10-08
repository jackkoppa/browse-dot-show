# GitHub Actions → AWS via OIDC, in each of the three accounts. Applied once, locally, by the
# developer (`pnpm bds infra github-actions deploy`) with the admin SSO profiles below.
# See docs/github-actions-deploys.md.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.31.0"
    }
  }

  # State: the homepage state bucket in account 0, under its own key (terraform.tfbackend)
  backend "s3" {
    encrypt = true
    region  = "us-east-1"
  }

  required_version = ">= 1.0.0"
}

provider "aws" {
  alias   = "homepage"
  region  = "us-east-1"
  profile = var.accounts.homepage.profile
  default_tags { tags = local.tags }
}

provider "aws" {
  alias   = "sites_1"
  region  = "us-east-1"
  profile = var.accounts.sites_1.profile
  default_tags { tags = local.tags }
}

provider "aws" {
  alias   = "sites_2"
  region  = "us-east-1"
  profile = var.accounts.sites_2.profile
  default_tags { tags = local.tags }
}

locals {
  tags = {
    Project   = "browse-dot-show"
    Component = "github-actions"
    ManagedBy = "terraform"
  }
}

module "homepage" {
  source               = "./modules/github-oidc"
  providers            = { aws = aws.homepage }
  github_repository    = var.github_repository
  create_oidc_provider = var.accounts.homepage.create_oidc_provider
}

module "sites_1" {
  source               = "./modules/github-oidc"
  providers            = { aws = aws.sites_1 }
  github_repository    = var.github_repository
  create_oidc_provider = var.accounts.sites_1.create_oidc_provider
}

module "sites_2" {
  source               = "./modules/github-oidc"
  providers            = { aws = aws.sites_2 }
  github_repository    = var.github_repository
  create_oidc_provider = var.accounts.sites_2.create_oidc_provider
}
