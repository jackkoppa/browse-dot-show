resource "aws_cloudfront_origin_access_control" "default" {
  name                              = "${var.bucket_name}-oac"
  description                       = "CloudFront OAC for ${var.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name              = var.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.default.id
    origin_id                = "S3-${var.bucket_name}"
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100"  # Use only North America and Europe edge locations

  # Add custom domain aliases only when enabled and domain is configured
  aliases = (var.enable_custom_domain && var.custom_domain_name != "") ? [var.custom_domain_name] : []

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.bucket_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  # Cache behavior for audio files (.mp3)
  ordered_cache_behavior {
    path_pattern     = "*.mp3"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.bucket_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400    # 1 day
    max_ttl                = 31536000 # 1 year
  }

  # Cache behavior for transcript files (.srt)
  ordered_cache_behavior {
    path_pattern     = "*.srt"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.bucket_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400    # 1 day
    max_ttl                = 31536000 # 1 year
  }

  # Cache behavior for episode-manifest files - always fetch fresh
  ordered_cache_behavior {
    path_pattern     = "episode-manifest/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.bucket_name}"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0        # No caching - always fetch fresh
    max_ttl                = 0        # No caching - always fetch fresh
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    # Use custom certificate only when enabled, otherwise use CloudFront default
    cloudfront_default_certificate = !(var.enable_custom_domain && var.certificate_arn != "")
    acm_certificate_arn           = (var.enable_custom_domain && var.certificate_arn != "") ? var.certificate_arn : null
    ssl_support_method            = (var.enable_custom_domain && var.certificate_arn != "") ? "sni-only" : null
    minimum_protocol_version      = (var.enable_custom_domain && var.certificate_arn != "") ? "TLSv1.2_2021" : null
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
    Name = "${var.bucket_name}-distribution"
    Site = var.site_id
  }
} 