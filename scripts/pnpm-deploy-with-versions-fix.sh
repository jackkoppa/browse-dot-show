# open issue: https://github.com/pnpm/pnpm/issues/6269

# workaround: https://github.com/pnpm/pnpm/issues/6269#issuecomment-1482879661

# Usage: ./scripts/pnpm-deploy-with-versions-fix.sh <package-name>
# Example: ./scripts/pnpm-deploy-with-versions-fix.sh @browse-dot-show/rss-retrieval-lambda
#
# This script runs `pnpm deploy`, with a workaround for the pnpm versions issue.
# It takes the package name as a command line argument.

# Check if package name is provided
if [ -z "$1" ]; then
  echo "Error: Package name is required"
  echo "Usage: ./scripts/pnpm-deploy-with-versions-fix.sh <package-name>"
  exit 1
fi

# Store package name from command line argument
PACKAGE_NAME="$1"

pnpm --filter $PACKAGE_NAME deploy --prod temp-packed-dist \
	&& pnpm pack \
	&& tar -zxvf *.tgz package/package.json \
	&& mv package/package.json aws-dist/package.json \
	&& rm -rf temp-packed-dist \
	&& rm *.tgz \
	&& rm -rf package