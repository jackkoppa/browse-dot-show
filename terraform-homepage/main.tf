terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.31.0"
    }
  }
  
  # Homepage-specific S3 backend for terraform state
  backend "s3" {
    # Values will be provided via terraform init -backend-config
    encrypt = true
    region  = "us-east-1"
  }

  required_version = ">= 1.0.0"
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  
  default_tags {
    tags = {
      Project   = "browse-dot-show"
      Component = "homepage"
      ManagedBy = "terraform"
    }
  }
}

# Additional provider for us-east-1 (required for CloudFront certificates)
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile
  
  default_tags {
    tags = {
      Project   = "browse-dot-show"
      Component = "homepage"
      ManagedBy = "terraform"
    }
  }
}

# S3 bucket for hosting homepage static files
resource "aws_s3_bucket" "homepage" {
  bucket = var.bucket_name

  tags = {
    Name = var.bucket_name
    Type = "homepage-hosting"
  }
}

resource "aws_s3_bucket_ownership_controls" "homepage" {
  bucket = aws_s3_bucket.homepage.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "homepage" {
  bucket = aws_s3_bucket.homepage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "homepage" {
  bucket = aws_s3_bucket.homepage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# SSL Certificate for browse.show domain (must be in us-east-1 for CloudFront)
resource "aws_acm_certificate" "homepage" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  # CloudFront requires certificates to be in us-east-1
  provider = aws.us_east_1

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "homepage-ssl-certificate"
    Domain = var.domain_name
  }
}

# CloudFront Origin Access Control for S3
resource "aws_cloudfront_origin_access_control" "homepage" {
  name                              = "${var.bucket_name}-oac"
  description                       = "CloudFront OAC for homepage"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront distribution for homepage
resource "aws_cloudfront_distribution" "homepage" {
  origin {
    domain_name              = aws_s3_bucket.homepage.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.homepage.id
    origin_id                = "S3-${var.bucket_name}"
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"  # Use only North America and Europe edge locations
  aliases             = [var.domain_name]

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600     # 1 hour
    max_ttl     = 86400    # 1 day
  }

  # Cache behavior for static assets (longer cache)
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.bucket_name}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400    # 1 day
    max_ttl     = 31536000 # 1 year
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.homepage.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Route all requests for non-existent files to index.html for SPA support
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  tags = {
    Name = "homepage-distribution"
    Domain = var.domain_name
  }
}

# S3 bucket policy to allow CloudFront access
resource "aws_s3_bucket_policy" "homepage_cloudfront_access" {
  bucket = aws_s3_bucket.homepage.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.homepage.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.homepage.arn
          }
        }
      }
    ]
  })
  
  depends_on = [aws_cloudfront_distribution.homepage]
} 