data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda_function_${var.function_name}.zip"
  source_dir  = var.source_dir
}

resource "aws_lambda_function" "lambda" {
  function_name     = var.function_name
  filename          = data.archive_file.lambda_zip.output_path
  source_code_hash  = data.archive_file.lambda_zip.output_base64sha256
  handler           = var.handler
  runtime           = var.runtime
  memory_size       = var.memory_size
  timeout           = var.timeout
  role              = aws_iam_role.lambda_exec.arn
  architectures     = var.lambda_architecture
  layers            = var.layers

  ephemeral_storage {
    size = var.ephemeral_storage
  }

  environment {
    variables = var.environment_variables
  }

  tags = {
    Name = var.function_name
    Site = var.site_id
  }
}

# IAM role for the Lambda function
resource "aws_iam_role" "lambda_exec" {
  name = "${var.function_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.function_name}-role"
    Site = var.site_id
  }
}

# Basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# S3 access policy
resource "aws_iam_policy" "s3_access" {
  name        = "${var.function_name}-s3-policy"
  description = "IAM policy for accessing S3 from Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}",
          "arn:aws:s3:::${var.s3_bucket_name}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_s3" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.s3_access.arn
}

# Lambda invoke policy (for Lambda 1 to invoke Lambda 2)
resource "aws_iam_policy" "lambda_invoke" {
  name        = "${var.function_name}-lambda-invoke-policy"
  description = "IAM policy for invoking other Lambda functions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_invoke" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_invoke.arn
}

# CloudFront invalidation policy
resource "aws_iam_policy" "cloudfront_invalidation" {
  name        = "${var.function_name}-cloudfront-invalidation-policy"
  description = "IAM policy for CloudFront cache invalidation from Lambda"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "cloudfront:CreateInvalidation"
        Resource = "*" # Allow invalidation on any CloudFront distribution
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_cloudfront_invalidation" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.cloudfront_invalidation.arn
} 