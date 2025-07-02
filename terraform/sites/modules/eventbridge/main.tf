resource "aws_scheduler_schedule" "lambda_schedule" {
  name       = var.schedule_name
  
  flexible_time_window {
    mode = "OFF"
  }
  
  schedule_expression = var.schedule_expression
  
  target {
    arn      = var.lambda_function_arn
    role_arn = aws_iam_role.scheduler_role.arn
  }
}

# IAM role for EventBridge scheduler
resource "aws_iam_role" "scheduler_role" {
  name = "${var.schedule_name}-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })
  
  tags = {
    Name = "${var.schedule_name}-role"
    Site = var.site_id
  }
}

# Lambda invoke permission for EventBridge
resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_arn
  principal     = "scheduler.amazonaws.com"
  source_arn    = aws_scheduler_schedule.lambda_schedule.arn
}

# IAM policy for EventBridge to invoke Lambda
resource "aws_iam_policy" "scheduler_lambda_policy" {
  name        = "${var.schedule_name}-lambda-policy"
  description = "IAM policy for EventBridge to invoke Lambda"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = var.lambda_function_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "scheduler_lambda" {
  role       = aws_iam_role.scheduler_role.name
  policy_arn = aws_iam_policy.scheduler_lambda_policy.arn
} 