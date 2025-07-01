terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.31.0"
    }
  }
  
  # Backend configuration will be provided via backend config file
  backend "s3" {
    # Values provided via terraform init -backend-config
    encrypt = true
    region  = "us-east-1"
  }

  required_version = ">= 1.0.0"
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = var.tags
  }
}

# IAM user for automation with long-lived credentials
resource "aws_iam_user" "automation_user" {
  name = var.automation_user_name
  path = "/automation/"
  
  tags = merge(var.tags, {
    Name = var.automation_user_name
  })
}

# Access key for the automation user
resource "aws_iam_access_key" "automation_key" {
  user = aws_iam_user.automation_user.name
}

# Policy allowing the automation user to assume roles in site accounts
resource "aws_iam_user_policy" "assume_site_roles" {
  name = "AllowAssumeAutomationRoles"
  user = aws_iam_user.automation_user.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Resource = [
          for site_id in var.deployed_sites :
          "arn:aws:iam::${try(data.terraform_remote_state.sites[site_id].outputs.account_id, "*")}:role/browse-dot-show-automation-role"
        ]
      }
    ]
  })
}

# Policy for basic AWS operations needed for automation
resource "aws_iam_user_policy" "basic_automation_permissions" {
  name = "BasicAutomationPermissions"
  user = aws_iam_user.automation_user.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sts:GetCallerIdentity",
          "sts:DecodeAuthorizationMessage"
        ]
        Resource = "*"
      }
    ]
  })
} 