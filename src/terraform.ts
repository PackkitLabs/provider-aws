import type { ResolvedAwsOptions } from './types.js';

// OpenTofu/Terraform emitters for a static site: a private, versioned, encrypted
// S3 bucket fronted by CloudFront via Origin Access Control (OAC — the modern
// replacement for OAI). Everything here is provider-neutral output text; the host
// writes it into the repo. Authored to be `tofu fmt`-clean and `tofu validate`-clean.

const AWS_PROVIDER_VERSION = '~> 5.0';
const REQUIRED_TF_VERSION = '>= 1.10'; // native S3 state locking (use_lockfile)

export function versionsTf(): string {
	return `terraform {
  required_version = "${REQUIRED_TF_VERSION}"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "${AWS_PROVIDER_VERSION}"
    }
  }
}
`;
}

// Partial S3 backend: bucket + region are supplied at init time (they come from the
// bootstrap outputs), so the checked-in config carries no account-specific values.
// Native state locking (use_lockfile) means no DynamoDB table — one less resource
// and no per-request cost. See infra/README.md for the `tofu init` invocation.
export function backendTf(): string {
	return `terraform {
  backend "s3" {
    key          = "static-site/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
`;
}

// The name + region variables every archetype shares. Service/worker append their
// own (e.g. image_tag) to this.
export function baseVariables(opts: ResolvedAwsOptions): string {
	return `variable "name" {
  description = "Resource name prefix (lowercase, hyphens)."
  type        = string
  default     = "${opts.name}"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "${opts.region}"
}
`;
}

export function variablesTf(opts: ResolvedAwsOptions): string {
	return baseVariables(opts);
}

export function providerTf(): string {
	return `provider "aws" {
  region = var.region
}
`;
}

// Shared by service + worker: an ECR repository the CI pipeline pushes the container
// image to. Untagged images expire so old layers don't accrue storage cost.
export function ecrTf(): string {
	return `resource "aws_ecr_repository" "app" {
  name                 = var.name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}
`;
}

export function staticSiteTf(): string {
	return `data "aws_caller_identity" "current" {}

locals {
  bucket_name = "\${var.name}-site-\${data.aws_caller_identity.current.account_id}"
}

# --- Origin bucket: private, versioned, encrypted; only CloudFront may read it ---

resource "aws_s3_bucket" "site" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# --- CloudFront distribution with Origin Access Control ---

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "\${var.name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "\${var.name} static site"
  price_class         = "PriceClass_100" # cost: only US/Canada/Europe edges

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "s3-\${aws_s3_bucket.site.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-\${aws_s3_bucket.site.id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # managed CachingOptimized
  }

  # Single-page-app friendly: hand client-routed paths back to index.html instead
  # of surfacing S3's 403/404.
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

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Let the distribution (and only this distribution) read the bucket.
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "\${aws_s3_bucket.site.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.site.arn
        }
      }
    }]
  })
}
`;
}

export function outputsTf(): string {
	return `output "bucket_name" {
  description = "S3 bucket holding the built site — sync your build output here."
  value       = aws_s3_bucket.site.id
}

output "distribution_id" {
  description = "CloudFront distribution ID — invalidate it after each deploy."
  value       = aws_cloudfront_distribution.site.id
}

output "site_url" {
  description = "The site's CloudFront URL."
  value       = "https://\${aws_cloudfront_distribution.site.domain_name}"
}
`;
}

export function infraGitignore(): string {
	return `# OpenTofu / Terraform
.terraform/
.terraform.lock.hcl
*.tfstate
*.tfstate.*
*.tfplan
crash.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json
`;
}
