variable "schedule_name" {
  description = "The name of the EventBridge schedule"
  type        = string
}

variable "schedule_expression" {
  description = "The schedule expression (e.g. cron(0 0 * * ? *) for daily at midnight)"
  type        = string
}

variable "lambda_function_arn" {
  description = "The ARN of the Lambda function to trigger"
  type        = string
}

variable "site_id" {
  description = "The unique identifier for the site"
  type        = string
} 