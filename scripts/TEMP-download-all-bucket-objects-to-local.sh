#!/bin/bash

# Usage:
# ./scripts/TEMP-download-all-bucket-objects-to-local.sh
#
# Options:
#   --excludeExtensions=ext1,ext2,...   Comma-separated list of file extensions to exclude from download.
#                                       Example: --excludeExtensions=mp3,json
#
# This script downloads all objects from a specified S3 bucket to a local directory.
# It checks for AWS CLI installation, AWS authentication (profile or default),
# and creates the local destination directory if it doesn't exist.
# It will prompt for confirmation before proceeding.

set -e

echo "WARNING: In normal development, downloading all objects from the S3 bucket is not required."
echo "It may also overwrite local files in ./aws-local-dev-TEMP"
read -p "Are you sure you want to continue? (yes/no): " confirmation

CONFIRMATION_LOWER=$(echo "$confirmation" | tr '[:upper:]' '[:lower:]')

if [[ "$CONFIRMATION_LOWER" != "yes" ]]; then
    echo "Operation cancelled by the user."
    exit 0
fi

echo "Proceeding with S3 bucket download..."

# Define S3 bucket and local destination
S3_BUCKET_URI="s3://listen-fair-play-s3-dev"
LOCAL_DESTINATION_DIR="./aws-local-dev-TEMP" # Using path relative to home directory

# Initialize EXCLUDE_PARAMS
EXCLUDE_PARAMS=""

# Parse command-line arguments
for arg in "$@"
do
    case $arg in
        --excludeExtensions=*)
        EXTENSIONS_CSV="${arg#*=}"
        IFS=',' read -ra EXT_ARRAY <<< "$EXTENSIONS_CSV"
        for ext in "${EXT_ARRAY[@]}"; do
            EXCLUDE_PARAMS="$EXCLUDE_PARAMS --exclude "*.$ext""
        done
        shift # Remove --excludeExtensions=... from processing
        ;;
        *)
        # Unknown option
        ;;
    esac
done

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
else
    AWS_VERSION=$(aws --version | cut -d ' ' -f 1 | cut -d '/' -f 2)
    echo "✅ AWS CLI v$AWS_VERSION installed"
fi

# Load environment variables from .env.prod if it exists in the script's directory or workspace root
SCRIPT_DIR=$(dirname "$0")
ENV_FILE_SCRIPT_DIR="$SCRIPT_DIR/.env.prod"
ENV_FILE_ROOT=".env.prod"

if [ -f "$ENV_FILE_SCRIPT_DIR" ]; then
    echo " sourcing $ENV_FILE_SCRIPT_DIR"
    source "$ENV_FILE_SCRIPT_DIR"
elif [ -f "$ENV_FILE_ROOT" ]; then
    echo "sourcing $ENV_FILE_ROOT"
    source "$ENV_FILE_ROOT"
else
    echo "ℹ️  .env.prod file not found in script directory or workspace root. Assuming AWS_PROFILE is globally available or not needed if using default profile."
fi


# Check AWS SSO authentication
if [ -n "$AWS_PROFILE" ]; then
    echo "Attempting to verify AWS SSO authentication with profile: $AWS_PROFILE"
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        echo "❌ AWS SSO credentials for profile '$AWS_PROFILE' are not working or expired."
        echo "  Please run 'aws sso login --profile $AWS_PROFILE' to authenticate."
        exit 1
    else
        echo "✅ AWS SSO authentication verified with profile: $AWS_PROFILE"
    fi
elif aws sts get-caller-identity &> /dev/null; then
    echo "✅ AWS authentication verified with default credentials/profile."
else
    echo "❌ AWS_PROFILE is not set (e.g., in .env.prod) and default AWS credentials are not working or expired."
    echo "  If using SSO, please add AWS_PROFILE to .env.prod and run 'aws sso login --profile <your-profile>'."
    echo "  Alternatively, configure your default AWS credentials."
    exit 1
fi

# Create local destination directory if it doesn't exist
echo "Ensuring local destination directory '$LOCAL_DESTINATION_DIR' exists..."
mkdir -p "$LOCAL_DESTINATION_DIR"
if [ $? -ne 0 ]; then
    echo "❌ Failed to create local directory: $LOCAL_DESTINATION_DIR"
    exit 1
fi
echo "✅ Local destination directory ensured."

# Download all objects from the S3 bucket
echo "Downloading all objects from $S3_BUCKET_URI to $LOCAL_DESTINATION_DIR..."

if [ -n "$AWS_PROFILE" ]; then
    # Use eval to correctly interpret the EXCLUDE_PARAMS string with spaces and quotes
    eval aws s3 sync "$S3_BUCKET_URI" "$LOCAL_DESTINATION_DIR" --profile "$AWS_PROFILE" $EXCLUDE_PARAMS
else
    eval aws s3 sync "$S3_BUCKET_URI" "$LOCAL_DESTINATION_DIR" $EXCLUDE_PARAMS
fi

if [ $? -eq 0 ]; then
    echo "✅ Successfully downloaded all objects from $S3_BUCKET_URI to $LOCAL_DESTINATION_DIR"
else
    echo "❌ Failed to download objects from $S3_BUCKET_URI. Check the output above for errors."
    exit 1
fi

echo "Script finished." 