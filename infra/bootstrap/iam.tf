# -----------------------------------------------------------------------------
# IAM roles for GitHub Actions (OIDC)
#
# The OIDC "sub" claim is what scopes each role:
#   repo:OWNER/REPO:pull_request            any PR workflow run
#   repo:OWNER/REPO:ref:refs/heads/main     pushes / schedules / dispatch on main
#   repo:OWNER/REPO:environment:prod        a job that declares `environment: prod`
#
# GitHub only issues an environment-scoped token after that environment's
# protection rules (required reviewers, branch policy) pass, so the prod roles
# cannot be assumed without an approval.
# -----------------------------------------------------------------------------

# GitHub issues the subject in one of two formats, depending on repo/org
# settings: the classic "repo:owner/name:..." or the immutable form that
# embeds numeric IDs, "repo:owner@<owner_id>/name@<repo_id>:...". The IDs pin
# trust to this exact repo even if it is renamed or the name is re-used.
# Both forms are trusted so a settings change on GitHub can't break logins.
locals {
  sub_prefixes = compact([
    "repo:${local.repo}",
    var.github_owner_id != "" && var.github_repo_id != "" ? "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}" : "",
  ])
  sub_pr   = [for p in local.sub_prefixes : "${p}:pull_request"]
  sub_main = [for p in local.sub_prefixes : "${p}:ref:refs/heads/main"]
}

data "aws_iam_policy_document" "trust_plan" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:sub"
      values   = concat(local.sub_pr, local.sub_main)
    }
  }
}

data "aws_iam_policy_document" "trust_main" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:sub"
      values   = local.sub_main
    }
  }
}

data "aws_iam_policy_document" "trust_env" {
  for_each = toset(var.environments)
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_url}:sub"
      values   = [for p in local.sub_prefixes : "${p}:environment:${each.key}"]
    }
  }
}

# Shared statement: read/write Terraform state objects and lock files.
data "aws_iam_policy_document" "state_access" {
  statement {
    sid       = "StateBucketList"
    actions   = ["s3:ListBucket", "s3:GetBucketVersioning"]
    resources = [aws_s3_bucket.tfstate.arn]
  }
  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/envs/*"]
  }
}

# -----------------------------------------------------------------------------
# Plan role: ReadOnlyAccess + state. Writes are limited to state/lock objects.
# -----------------------------------------------------------------------------
resource "aws_iam_role" "plan" {
  name                 = "${var.project}-gha-plan"
  assume_role_policy   = data.aws_iam_policy_document.trust_plan.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "terraform-state"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.state_access.json
}

# -----------------------------------------------------------------------------
# ECR push role (main branch only)
# -----------------------------------------------------------------------------
resource "aws_iam_role" "ecr_push" {
  name               = "${var.project}-gha-ecr-push"
  assume_role_policy = data.aws_iam_policy_document.trust_main.json
}

data "aws_iam_policy_document" "ecr_push" {
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.app.arn]
  }
}

resource "aws_iam_role_policy" "ecr_push" {
  name   = "ecr-push"
  role   = aws_iam_role.ecr_push.id
  policy = data.aws_iam_policy_document.ecr_push.json
}

# -----------------------------------------------------------------------------
# Apply roles (one per environment)
#
# Scoped to the services this stack uses. IAM writes are limited to resources
# named "<project>-*", so the role cannot escalate by creating arbitrary roles.
# -----------------------------------------------------------------------------
resource "aws_iam_role" "apply" {
  for_each             = toset(var.environments)
  name                 = "${var.project}-gha-apply-${each.key}"
  assume_role_policy   = data.aws_iam_policy_document.trust_env[each.key].json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "apply" {
  statement {
    sid = "ServicesUsedByStack"
    actions = [
      "ec2:*",
      "s3:*",
      "cloudfront:*",
      "ssm:*",
      "logs:*",
      "cloudwatch:*",
      "sns:*",
      "dlm:*",
      "ecr:Describe*",
      "ecr:List*",
      "ecr:GetAuthorizationToken",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  statement {
    sid = "IamForProjectResourcesOnly"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole",
      "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy",
      "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
      "iam:PutRolePolicy", "iam:GetRolePolicy", "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
      "iam:GetInstanceProfile", "iam:TagInstanceProfile", "iam:UntagInstanceProfile",
      "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
      "iam:ListInstanceProfilesForRole", "iam:PassRole",
    ]
    resources = [
      "arn:${local.partition}:iam::${local.account_id}:role/${var.project}-*",
      "arn:${local.partition}:iam::${local.account_id}:instance-profile/${var.project}-*",
    ]
  }

  statement {
    sid       = "IamReadOnlyForPlanning"
    actions   = ["iam:Get*", "iam:List*"]
    resources = ["*"]
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:${local.partition}:iam::${local.account_id}:role/aws-service-role/*"]
  }

  statement {
    sid       = "DenyStateBucketTampering"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutBucketVersioning"]
    resources = [aws_s3_bucket.tfstate.arn]
  }
}

resource "aws_iam_role_policy" "apply" {
  for_each = aws_iam_role.apply
  name     = "terraform-apply"
  role     = each.value.id
  policy   = data.aws_iam_policy_document.apply.json
}

# -----------------------------------------------------------------------------
# Deploy roles (one per environment): ship a new image + frontend build.
# -----------------------------------------------------------------------------
resource "aws_iam_role" "deploy" {
  for_each           = toset(var.environments)
  name               = "${var.project}-gha-deploy-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.trust_env[each.key].json
}

data "aws_iam_policy_document" "deploy" {
  for_each = toset(var.environments)

  statement {
    sid       = "ReadWriteEnvParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:PutParameter"]
    resources = ["arn:${local.partition}:ssm:${var.region}:${local.account_id}:parameter/${var.project}/${each.key}/*"]
  }

  statement {
    sid       = "RunShellOnTaggedInstance"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${local.partition}:ec2:${var.region}:${local.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Environment"
      values   = [each.key]
    }
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = [var.project]
    }
  }

  statement {
    sid       = "UseRunShellScriptDocument"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${local.partition}:ssm:${var.region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "ReadCommandResults"
    actions   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:ListCommands"]
    resources = ["*"]
  }

  statement {
    sid       = "SiteBucketList"
    actions   = ["s3:ListBucket"]
    resources = ["arn:${local.partition}:s3:::${var.project}-${each.key}-site-${local.account_id}"]
  }

  statement {
    sid       = "SiteBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:${local.partition}:s3:::${var.project}-${each.key}-site-${local.account_id}/*"]
  }

  statement {
    sid       = "InvalidateCdn"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = ["arn:${local.partition}:cloudfront::${local.account_id}:distribution/*"]
  }

  statement {
    sid       = "CheckImageExists"
    actions   = ["ecr:DescribeImages"]
    resources = [aws_ecr_repository.app.arn]
  }
}

resource "aws_iam_role_policy" "deploy" {
  for_each = aws_iam_role.deploy
  name     = "app-deploy"
  role     = each.value.id
  policy   = data.aws_iam_policy_document.deploy[each.key].json
}
