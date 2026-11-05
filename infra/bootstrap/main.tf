# -----------------------------------------------------------------------------
# Bootstrap stack: run ONCE from a workstation with admin credentials.
#
# Creates everything GitHub Actions needs before it can run Terraform itself:
#   - S3 bucket for remote state (native S3 locking, no DynamoDB)
#   - GitHub OIDC identity provider (optional, if the account lacks one)
#   - Shared ECR repository (one image is promoted dev -> prod)
#   - IAM roles assumed by workflows via OIDC:
#       taskflow-gha-plan            PRs + main: read-only plan
#       taskflow-gha-ecr-push        main: push images
#       taskflow-gha-apply-<env>     environment:<env>: terraform apply
#       taskflow-gha-deploy-<env>    environment:<env>: app release
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # State for this stack stays local by default (it is tiny and rarely changes).
  # After the first apply you can move it into the bucket it created:
  #   1. uncomment the block below and fill in the bucket name
  #   2. terraform init -migrate-state
  # backend "s3" {
  #   bucket       = "taskflow-tfstate-<account-id>"
  #   key          = "bootstrap/terraform.tfstate"
  #   region       = "us-east-1"
  #   encrypt      = true
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  partition    = data.aws_partition.current.partition
  repo         = "${var.github_owner}/${var.github_repo}"
  state_bucket = "${var.project}-tfstate-${local.account_id}"
  oidc_url     = "token.actions.githubusercontent.com"
  oidc_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : (
    "arn:${local.partition}:iam::${local.account_id}:oidc-provider/${local.oidc_url}"
  )
}

# -----------------------------------------------------------------------------
# Remote state bucket
# -----------------------------------------------------------------------------
resource "aws_s3_bucket" "tfstate" {
  bucket = local.state_bucket
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "tfstate_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.tfstate.arn,
      "${aws_s3_bucket.tfstate.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "tfstate" {
  bucket     = aws_s3_bucket.tfstate.id
  policy     = data.aws_iam_policy_document.tfstate_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

# -----------------------------------------------------------------------------
# GitHub OIDC provider
# -----------------------------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://${local.oidc_url}"
  client_id_list = ["sts.amazonaws.com"]
  # AWS validates GitHub's certificate against its own trusted CAs, so a
  # thumbprint is no longer used; the provider accepts an empty list.
}

# -----------------------------------------------------------------------------
# Shared ECR repository
# -----------------------------------------------------------------------------
resource "aws_ecr_repository" "app" {
  name                 = var.project
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the most recent ${var.ecr_keep_images} images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.ecr_keep_images
      }
      action = { type = "expire" }
    }]
  })
}
