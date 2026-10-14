terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.31.0"
    }
    archive = {
      source = "hashicorp/archive"
    }
  }

  # State in the homepage state bucket (same account), under its own key
  backend "s3" {
    encrypt = true
    region  = "us-east-1"
  }

  required_version = ">= 1.0.0"
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project   = "browse-dot-show"
      Component = "subscriber-auth"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # Sites with subscriberAccess in their site.config.json, and where they're served
  site_config_dir = "${path.module}/../../sites/origin-sites"
  site_configs    = [for file in fileset(local.site_config_dir, "*/site.config.json") : jsondecode(file("${local.site_config_dir}/${file}"))]
  auth_sites = {
    for site in local.site_configs : site.id => {
      origins = distinct(concat(
        ["https://${site.domain}"],
        [regex("^https?://[^/]+", site.socialAndMetadata.canonicalUrl)],
        lookup(var.extra_site_origins, site.id, [])
      ))
      providers = site.subscriberAccess.providers
    } if try(site.subscriberAccess, null) != null
  }
  allowed_origins = sort(distinct(flatten([for site in values(local.auth_sites) : site.origins])))
}

data "archive_file" "auth_lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../../packages/auth-lambda/aws-dist"
  output_path = "${path.module}/.build/auth-lambda.zip"
}

resource "aws_iam_role" "auth_lambda" {
  name = "browse-dot-show-subscriber-auth-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "auth_lambda_logs" {
  role       = aws_iam_role.auth_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Read its secrets (SecureStrings with the AWS-managed key, which allows decrypting via SSM)
resource "aws_iam_role_policy" "auth_lambda_ssm" {
  name = "read-subscriber-auth-parameters"
  role = aws_iam_role.auth_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "ssm:GetParameter"
      Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.ssm_parameter_prefix}/*"
    }]
  })
}

resource "aws_lambda_function" "auth" {
  function_name    = "browse-dot-show-subscriber-auth"
  filename         = data.archive_file.auth_lambda.output_path
  source_code_hash = data.archive_file.auth_lambda.output_base64sha256
  handler          = "auth-lambda.handler"
  runtime          = "nodejs20.x"
  architectures    = ["arm64"]
  memory_size      = 256
  timeout          = 15
  role             = aws_iam_role.auth_lambda.arn

  environment {
    variables = {
      AUTH_SITES           = jsonencode(local.auth_sites)
      SSM_PARAMETER_PREFIX = var.ssm_parameter_prefix
      LOG_LEVEL            = var.log_level
    }
  }
}

resource "aws_cloudwatch_log_group" "auth" {
  name              = "/aws/lambda/${aws_lambda_function.auth.function_name}"
  retention_in_days = 30
}

resource "aws_apigatewayv2_api" "auth" {
  name          = "browse-dot-show-subscriber-auth"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = length(local.allowed_origins) > 0 ? local.allowed_origins : ["https://browse.show"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_integration" "auth" {
  api_id                 = aws_apigatewayv2_api.auth.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.auth.arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "auth" {
  api_id    = aws_apigatewayv2_api.auth.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.auth.id}"
}

resource "aws_apigatewayv2_stage" "auth" {
  api_id      = aws_apigatewayv2_api.auth.id
  name        = "$default"
  auto_deploy = true

  # Caps traffic (and so cost, and login emails a script could trigger)
  default_route_settings {
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }
}

resource "aws_lambda_permission" "auth_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.auth.execution_arn}/*"
}
