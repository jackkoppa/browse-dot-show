#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to validate site ID
validate_site_id() {
    local site_id="$1"
    
    # Check if empty
    if [[ -z "$site_id" ]]; then
        print_error "Site ID cannot be empty"
        return 1
    fi
    
    # Check if contains only lowercase, numbers, and hyphens
    if [[ ! "$site_id" =~ ^[a-z0-9-]+$ ]]; then
        print_error "Site ID can only contain lowercase letters, numbers, and hyphens"
        return 1
    fi
    
    # Check if starts with letter
    if [[ ! "$site_id" =~ ^[a-z] ]]; then
        print_error "Site ID must start with a letter"
        return 1
    fi
    
    # Check if directory already exists
    if [[ -d "sites/my-sites/$site_id" ]]; then
        print_error "Site directory already exists: sites/my-sites/$site_id"
        return 1
    fi
    
    return 0
}

# Function to validate domain
validate_domain() {
    local domain="$1"
    
    if [[ -z "$domain" ]]; then
        print_error "Domain cannot be empty"
        return 1
    fi
    
    # Basic domain validation
    if [[ ! "$domain" =~ ^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        print_error "Please enter a valid domain (e.g., example.com or my-site.browse.show)"
        return 1
    fi
    
    return 0
}

# Function to validate RSS URL
validate_rss_url() {
    local url="$1"
    
    if [[ -z "$url" ]]; then
        print_error "RSS URL cannot be empty"
        return 1
    fi
    
    if [[ ! "$url" =~ ^https?:// ]]; then
        print_error "RSS URL must start with http:// or https://"
        return 1
    fi
    
    return 0
}

# Main script
main() {
    echo
    print_info "🚀 Welcome to the Browse.Show Site Creator!"
    echo
    print_info "This script will help you create a new podcast archive site."
    print_info "You'll need:"
    print_info "  - A unique site ID (used for AWS resources)"
    print_info "  - A domain name for your site"
    print_info "  - RSS feed URL(s) for the podcast(s) you want to archive"
    print_info "  - AWS profile configured for deployment"
    echo
    
    # Get site ID
    while true; do
        read -p "Enter your site ID (lowercase, hyphens only): " SITE_ID
        if validate_site_id "$SITE_ID"; then
            break
        fi
        echo
    done
    
    # Get domain
    while true; do
        read -p "Enter your domain (e.g., my-podcast.browse.show): " DOMAIN
        if validate_domain "$DOMAIN"; then
            break
        fi
        echo
    done
    
    # Get site titles
    read -p "Enter short title for your site: " SHORT_TITLE
    read -p "Enter full title for your site: " FULL_TITLE
    read -p "Enter description for your site: " DESCRIPTION
    
    # Get podcast info
    read -p "Enter podcast title: " PODCAST_TITLE
    read -p "Enter RSS feed filename (e.g., my-podcast.xml): " RSS_FILENAME
    
    while true; do
        read -p "Enter RSS feed URL: " RSS_URL
        if validate_rss_url "$RSS_URL"; then
            break
        fi
        echo
    done
    
    # Get AWS profile
    read -p "Enter your AWS profile name (from ~/.aws/config): " AWS_PROFILE
    
    # Optional AWS region
    read -p "Enter AWS region (press Enter for us-east-1): " AWS_REGION
    AWS_REGION=${AWS_REGION:-us-east-1}
    
    echo
    print_info "Creating site with the following configuration:"
    echo "  Site ID: $SITE_ID"
    echo "  Domain: $DOMAIN"
    echo "  Short Title: $SHORT_TITLE"
    echo "  Full Title: $FULL_TITLE"
    echo "  Description: $DESCRIPTION"
    echo "  Podcast Title: $PODCAST_TITLE"
    echo "  RSS Filename: $RSS_FILENAME"
    echo "  RSS URL: $RSS_URL"
    echo "  AWS Profile: $AWS_PROFILE"
    echo "  AWS Region: $AWS_REGION"
    echo
    
    read -p "Continue? (y/N): " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        print_info "Site creation cancelled."
        exit 0
    fi
    
    # Create site directory
    SITE_DIR="sites/my-sites/$SITE_ID"
    print_info "Creating site directory: $SITE_DIR"
    mkdir -p "$SITE_DIR"
    
    # Create podcast ID from title (lowercase, replace spaces with hyphens)
    PODCAST_ID=$(echo "$PODCAST_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')
    
    # Create site.config.json
    print_info "Creating site.config.json"
    cat > "$SITE_DIR/site.config.json" << EOF
{
    "id": "$SITE_ID",
    "domain": "$DOMAIN",
    "shortTitle": "$SHORT_TITLE",
    "fullTitle": "$FULL_TITLE",
    "description": "$DESCRIPTION",
    "includedPodcasts": [
        {
            "id": "$PODCAST_ID",
            "rssFeedFile": "$RSS_FILENAME",
            "title": "$PODCAST_TITLE",
            "status": "active",
            "url": "$RSS_URL"
        }
    ]
}
EOF
    
    # Create .env.aws
    print_info "Creating .env.aws"
    cat > "$SITE_DIR/.env.aws" << EOF
# AWS Configuration for $SITE_ID
AWS_PROFILE=$AWS_PROFILE
AWS_REGION=$AWS_REGION
EOF
    
    # Copy optional files from example if they exist
    if [[ -f "sites/my-sites/example-site/index.css" ]]; then
        print_info "Copying example CSS file (optional)"
        cp "sites/my-sites/example-site/index.css" "$SITE_DIR/index.css"
    fi
    
    print_success "✅ Site created successfully!"
    echo
    print_info "Next steps:"
    echo "  1. Review your configuration in: $SITE_DIR/"
    echo "  2. Set up local directories: pnpm setup:site-directories"
    echo "  3. Test locally: pnpm client:dev"
    echo "  4. Deploy to AWS: pnpm all:deploy"
    echo
    print_info "Your site will be available at: https://$DOMAIN"
    echo
    print_warning "Note: Make sure your AWS profile has the necessary permissions!"
    print_warning "DNS configuration for your domain is required for production deployment."
    echo
}

# Check if we're in the right directory
if [[ ! -f "package.json" ]] || [[ ! -d "sites" ]]; then
    print_error "This script must be run from the root directory of the browse-dot-show repository"
    exit 1
fi

# Create my-sites directory if it doesn't exist
mkdir -p sites/my-sites

main 