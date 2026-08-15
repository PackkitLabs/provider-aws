import type { AwsArchetype, ResolvedAwsOptions } from './types.js';

// The AWS service actions the deploy role needs to manage each archetype's infra.
// Broad within the archetype, on `*`; tighten to specific ARNs for production.
const INFRA_ACTIONS: Record<AwsArchetype, string[]> = {
	'static-site': ['s3:*', 'cloudfront:*'],
	service: ['ecr:*', 'apprunner:*', 'logs:*'],
	worker: ['ecr:*', 'ecs:*', 'ec2:*', 'logs:*', 'application-autoscaling:*'],
};

// Service/worker create their own IAM roles (App Runner access role, ECS task roles),
// so the deploy role must manage roles — but only this project's, scoped by name.
const NEEDS_ROLE_MANAGEMENT: Record<AwsArchetype, boolean> = {
	'static-site': false,
	service: true,
	worker: true,
};

// The bootstrap module solves the two chicken-and-eggs the issue called out:
//   1. the S3 bucket that holds Terraform state must exist before the main config's
//      backend can use it, so it's created here with LOCAL state;
//   2. the GitHub OIDC provider + IAM deploy role must exist before CI can assume a
//      role to deploy — so they're created here too (no long-lived AWS keys, ever).
// Run once, by a human with admin credentials. Its own state stays local (gitignored).

export function bootstrapVersionsTf(): string {
	return `terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
`;
}

export function bootstrapProviderTf(): string {
	return `provider "aws" {
  region = var.region
}
`;
}

export function bootstrapVariablesTf(opts: ResolvedAwsOptions): string {
	const repoDefault = opts.repository
		? `\n  default     = "${opts.repository.owner}/${opts.repository.name}"`
		: '';
	const branchDefault = opts.repository?.branch ?? 'main';
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

variable "github_repository" {
  description = "The GitHub repo (owner/name) whose Actions may assume the deploy role."
  type        = string${repoDefault}
}

variable "github_branch" {
  description = "Branch allowed to run apply (plans run on any ref)."
  type        = string
  default     = "${branchDefault}"
}
`;
}

export function bootstrapMainTf(archetype: AwsArchetype): string {
	// A second statement scoping IAM role management to this project's own roles.
	const roleManagement = NEEDS_ROLE_MANAGEMENT[archetype]
		? `
  statement {
    sid       = "ManageProjectRoles"
    effect    = "Allow"
    actions   = ["iam:*"]
    resources = ["arn:aws:iam::*:role/\${var.name}-*", "arn:aws:iam::*:policy/\${var.name}-*"]
  }
`
		: '';

	return `data "aws_caller_identity" "current" {}

# --- Terraform state backend (S3 with native locking, no DynamoDB) ---

resource "aws_s3_bucket" "state" {
  bucket = "\${var.name}-tfstate-\${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# --- GitHub Actions OIDC -> IAM deploy role (no long-lived keys) ---

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS has managed GitHub's OIDC certificate chain since 2023, so no thumbprint is
  # required — and pinning one causes perpetual drift (AWS repopulates the list) and
  # a future outage when GitHub rotates its certificate. Let AWS own it.
  lifecycle {
    ignore_changes = [thumbprint_list]
  }
}

locals {
  github_owner = split("/", var.github_repository)[0]
  github_repo  = split("/", var.github_repository)[1]
}

data "aws_iam_policy_document" "trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Scope to this repository. Match BOTH subject formats: the legacy
    # "repo:owner/name:*" and the immutable "repo:owner@<id>/name@<id>:*" that GitHub
    # emits for repositories created/renamed after 2026-07-15 (the numeric ids don't
    # exist at scaffold time, so they're wildcarded). The owner and repo *names* are
    # anchored — each is followed by a literal "@" or "/" — so "\${owner}evil" can
    # never match. Any ref may assume the role (plan on PRs); the workflow gates apply.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:\${var.github_repository}:*",
        "repo:\${local.github_owner}@*/\${local.github_repo}@*:*",
      ]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "\${var.name}-deploy"
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

# Permissions to manage this archetype's infra + read/write Terraform state.
# Pragmatic for a template; tighten actions/resources for production.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "TerraformState"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn, "\${aws_s3_bucket.state.arn}/*"]
  }

  statement {
    sid       = "Infra"
    effect    = "Allow"
    actions   = [${INFRA_ACTIONS[archetype].map((a) => `"${a}"`).join(', ')}]
    resources = ["*"]
  }
${roleManagement}}

resource "aws_iam_role_policy" "deploy" {
  name   = "\${var.name}-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
`;
}

export function bootstrapOutputsTf(): string {
	return `output "state_bucket" {
  description = "Pass to \`tofu init -backend-config=\\"bucket=<this>\\"\` in ../ and set as the AWS_STATE_BUCKET repo variable."
  value       = aws_s3_bucket.state.id
}

output "deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN repo variable so CI can assume it via OIDC."
  value       = aws_iam_role.deploy.arn
}
`;
}
