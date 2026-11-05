variable "region" {
  description = "AWS region for state, ECR and the application stacks."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix for all resources. The apply role can only manage IAM resources with this prefix."
  type        = string
  default     = "taskflow"
}

variable "github_owner" {
  description = "GitHub user or organization that owns the repository."
  type        = string
  default     = "towsonTigers"
}

variable "github_repo" {
  description = "Repository name."
  type        = string
  default     = "mockSQLLite_demo"
}

variable "github_owner_id" {
  description = "Numeric ID of the repo owner (immutable OIDC subject). gh api users/<owner> --jq .id"
  type        = string
  default     = "11334406"
}

variable "github_repo_id" {
  description = "Numeric ID of the repository (immutable OIDC subject). gh api repos/<owner>/<repo> --jq .id"
  type        = string
  default     = "1367596155"
}

variable "environments" {
  description = "Deployment environments. Each must match a GitHub environment name."
  type        = list(string)
  default     = ["dev", "prod"]
}

variable "create_oidc_provider" {
  description = "Set false if the account already has a token.actions.githubusercontent.com OIDC provider."
  type        = bool
  default     = true
}

variable "ecr_keep_images" {
  description = "How many images to keep in ECR (older ones expire)."
  type        = number
  default     = 30
}
