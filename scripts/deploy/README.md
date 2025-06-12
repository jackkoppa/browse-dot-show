# Listen Fair Play - Local Deployment

This directory contains scripts for local deployment of the Listen Fair Play application to AWS using Terraform.

## Prerequisites

1. **Terraform** - Install Terraform
   ```bash
   # For macOS with Homebrew
   brew install terraform

   # For other platforms, see https://developer.hashicorp.com/terraform/install
   ```

2. **AWS CLI** - Install and configure AWS CLI
   ```bash
   # For macOS with Homebrew
   brew install awscli
   
   # For other platforms, see https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
   ```

3. **Node.js** - Make sure you have Node.js 20 or later installed
   ```bash
   # Using nvm (recommended)
   nvm install 20
   nvm use 20
   ```

4. **pnpm** - For managing Node.js dependencies
   ```bash 
   npm install -g pnpm@8
   ```

## AWS Authentication

Log into an AWS Account / Role, with sufficient permissions to create both infrastructure resources & IAM Roles/Policies, in the AWS CLI via SSO. For @jackkoppa, the Role name used is kept at https://github.com/jackkoppa/browse-dot-show-private - you can use your own Account / Role to host the app, so long as it has sufficient permissions.

To configure AWS SSO:
1. Run the AWS SSO configuration command:
   ```bash
   aws configure sso
   ```

2. Follow the prompts to set up your SSO connection. You'll get an output like:
   ```
   To use this profile, specify the profile name using --profile, as shown:
   aws sts get-caller-identity --profile YourProfileName
   ```

3. Add the profile name to your `.env.local` file:
   ```
   AWS_PROFILE=YourProfileName
   ```

4. Before deployment, make sure to login with SSO:
   ```bash
   aws sso login --profile YourProfileName
   ```

## Configuration

1. Create a `.env.local` file in the project root with your configuration:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and fill in your credentials:
   ```
   # AWS Configuration
   AWS_PROFILE=YourProfileName
   AWS_REGION=us-east-1
   
   # OpenAI API Key
   OPENAI_API_KEY=your_openai_api_key
   ```

3. AWS IAM User/Role Requirements:
   - Your AWS user/role needs permissions for:
     - Lambda management
     - S3 bucket creation/management
     - CloudFront distribution management
     - EventBridge scheduler management
     - IAM role creation for Lambda functions

## Deployment

### Deploy to Development Environment

```bash
# Make sure your SSO session is active first
aws sso login --profile YourProfileName

# Then deploy
./scripts/deploy/deploy.sh dev
```


### Destroy an Environment

Be careful when destroying environments, as this will delete all resources created by Terraform!

```bash
# Destroy development environment
./scripts/deploy/destroy.sh dev
```

## What the Deployment Does

The deployment process:

1. Builds the Lambda functions in the `processing` directory
2. Builds the React application in the `client` directory
3. Initializes Terraform and validates the configuration
4. Plans the deployment based on the specified environment
5. After confirmation, applies the Terraform plan
6. Displays outputs such as the CloudFront URL for accessing the application

## Troubleshooting

### AWS SSO Session Issues

If you encounter authentication issues with AWS SSO:

1. Check if your session is active:
   ```bash
   aws sts get-caller-identity --profile YourProfileName
   ```

2. If the session has expired, renew it:
   ```bash
   aws sso login --profile YourProfileName
   ```

3. Verify that the correct profile name is in your `.env.local` file

### Permission Issues

If you encounter permission issues, verify that your AWS user/role has the necessary permissions listed above.

### Terraform State Issues

By default, the Terraform state is stored locally. If multiple people need to deploy, consider:
1. Setting up a remote backend with S3 and DynamoDB (edit `terraform/main.tf`)
2. Sharing the state securely

### Resource Name Conflicts

If you get errors about resource names already existing:
1. Check if you already have resources with the same names
2. Edit the variable files in `terraform/environments/` to use unique names

### AWS Region Considerations

The default AWS region is `us-east-1`. If you need to use a different region:
1. Set the `AWS_REGION` in your `.env.local` file
2. Update any region-specific configurations in Terraform variables 