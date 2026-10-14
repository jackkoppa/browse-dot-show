output "auth_api_url" {
  description = "The auth API's base URL, for the site client builds (VITE_SUBSCRIBER_AUTH_API_URL)"
  value       = aws_apigatewayv2_api.auth.api_endpoint
}

output "auth_sites" {
  description = "Sites the auth lambda serves, with their origins and providers"
  value       = local.auth_sites
}
