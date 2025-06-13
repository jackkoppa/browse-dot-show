#!/bin/bash

set -e

# Deploy only to production (Phase 7: simplified environment model)
ENV="prod"

# Get selected site from environment (set by site selection wrapper)
SITE_ID=${SITE_ID:-""}
if [ -z "$SITE_ID" ]; then
    echo "Error: No site selected. SITE_ID environment variable must be set."
    echo "Use: SITE_ID=your-site-id ./scripts/deploy/destroy.sh"
    exit 1
fi

echo "🌐 Destroying site: $SITE_ID"

# Run prerequisite check
./scripts/deploy/check-prerequisites.sh
if [ $? -ne 0 ]; then
  echo "Prerequisite check failed. Please address the issues above before destroying."
  exit 1
fi

# Check if .env.prod exists and source it
if [ -f ".env.prod" ]; then
  echo "Loading environment variables from .env.prod"
  source .env.prod
else
  echo "Warning: .env.prod file not found. Make sure to create it with necessary credentials."
  exit 1
fi

# Validate required environment variables
if [ -z "$OPENAI_API_KEY" ]; then
  echo "Error: OpenAI API key is missing."
  echo "Make sure .env.prod contains:"
  echo "  OPENAI_API_KEY=your_openai_api_key"
  exit 1
fi

# Set AWS region if not already set
export AWS_REGION=${AWS_REGION:-us-east-1}

# Set AWS profile if specified
if [ -n "$AWS_PROFILE" ]; then
  echo "Using AWS SSO profile: $AWS_PROFILE"
  export AWS_PROFILE=$AWS_PROFILE
  
  # Check if SSO session is active
  if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
    echo "AWS SSO session is not active or has expired"
    echo "Please run: aws sso login --profile $AWS_PROFILE"
    exit 1
  fi
fi

# Warn if trying to destroy production
if [ "$ENV" == "prod" ]; then
  echo "WARNING: You are about to destroy the PRODUCTION environment!"
  read -p "Type 'destroy-prod' to confirm: " confirmation
  if [ "$confirmation" != "destroy-prod" ]; then
    echo "Destruction cancelled."
    exit 1
  fi
fi

# Run Terraform destroy
echo "Destroying $ENV environment..."
cd terraform

# Initialize Terraform (if needed)
terraform init

# Set profile flag if using AWS profile
PROFILE_FLAG=""
if [ -n "$AWS_PROFILE" ]; then
  PROFILE_FLAG="-var=aws_profile=$AWS_PROFILE"
fi

# Destroy the infrastructure
terraform destroy \
  -var-file=environments/${SITE_ID}-prod.tfvars \
  -var="openai_api_key=$OPENAI_API_KEY" \
  -var="site_id=$SITE_ID" \
  $PROFILE_FLAG \
  -auto-approve

echo "======= Destruction Complete =======" 