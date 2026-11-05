output "region" {
  value = var.region
}

output "state_bucket" {
  description = "Set as GitHub repository variable TF_STATE_BUCKET."
  value       = aws_s3_bucket.tfstate.bucket
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "plan_role_arn" {
  description = "GitHub repository variable TF_PLAN_ROLE_ARN."
  value       = aws_iam_role.plan.arn
}

output "ecr_push_role_arn" {
  description = "GitHub repository variable ECR_PUSH_ROLE_ARN."
  value       = aws_iam_role.ecr_push.arn
}

output "apply_role_arns" {
  description = "GitHub environment variable TF_APPLY_ROLE_ARN, per environment."
  value       = { for k, r in aws_iam_role.apply : k => r.arn }
}

output "deploy_role_arns" {
  description = "GitHub environment variable DEPLOY_ROLE_ARN, per environment."
  value       = { for k, r in aws_iam_role.deploy : k => r.arn }
}
