output "schedule_arn" {
  description = "The ARN of the EventBridge schedule"
  value       = aws_scheduler_schedule.lambda_schedule.arn
}

output "schedule_name" {
  description = "The name of the EventBridge schedule"
  value       = aws_scheduler_schedule.lambda_schedule.name
} 