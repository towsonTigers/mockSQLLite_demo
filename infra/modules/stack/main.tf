# -----------------------------------------------------------------------------
# One complete TaskFlow environment. envs/dev and envs/prod both call this
# module, so the environments differ only in their variable values.
# -----------------------------------------------------------------------------

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

locals {
  name            = "${var.project}-${var.env}"
  param_prefix    = "/${var.project}/${var.env}"
  image_tag_param = "${local.param_prefix}/image_tag"
}

data "aws_ecr_repository" "app" {
  name = var.ecr_repository_name
}

module "network" {
  source        = "../network"
  name          = local.name
  cidr_block    = var.vpc_cidr
  instance_type = var.instance_type
}

module "app_host" {
  source                = "../app_host"
  name                  = local.name
  project               = var.project
  env                   = var.env
  region                = var.region
  vpc_id                = module.network.vpc_id
  subnet_id             = module.network.subnet_id
  availability_zone     = module.network.availability_zone
  instance_type         = var.instance_type
  data_volume_gb        = var.data_volume_gb
  ecr_repository_url    = data.aws_ecr_repository.app.repository_url
  image_tag_parameter   = aws_ssm_parameter.image_tag.name
  log_retention_days    = var.log_retention_days
  snapshot_retain_count = var.snapshot_retain_count
  alarm_email           = var.alarm_email
}

module "static_site" {
  source              = "../static_site"
  project             = var.project
  env                 = var.env
  api_origin_domain   = module.app_host.public_dns
  domain_aliases      = var.domain_aliases
  acm_certificate_arn = var.acm_certificate_arn
  web_acl_arn         = var.web_acl_arn
}

# -----------------------------------------------------------------------------
# Hand-off to the release pipeline. Terraform owns these parameters, but the
# deploy workflow writes image_tag, so Terraform ignores changes to its value.
# -----------------------------------------------------------------------------
resource "aws_ssm_parameter" "image_tag" {
  name        = local.image_tag_param
  description = "Image tag the ${var.env} host runs. Written by the deploy workflow."
  type        = "String"
  value       = "bootstrap"
  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "deploy_config" {
  name        = "${local.param_prefix}/deploy_config"
  description = "Values the deploy workflow needs, so it never reads Terraform state."
  type        = "String"
  value       = jsonencode({
    bucket          = module.static_site.bucket_name
    distribution_id = module.static_site.distribution_id
    instance_id     = module.app_host.instance_id
    ecr_url         = data.aws_ecr_repository.app.repository_url
    site_url        = module.static_site.url
    log_group       = module.app_host.log_group
  })
}

# -----------------------------------------------------------------------------
variable "project" {
  type    = string
  default = "taskflow"
}

variable "env" {
  type = string
}

variable "region" {
  type = string
}

variable "ecr_repository_name" {
  type    = string
  default = "taskflow"
}

variable "vpc_cidr" {
  type = string
}

variable "instance_type" {
  type = string
}

variable "data_volume_gb" {
  type    = number
  default = 10
}

variable "log_retention_days" {
  type = number
}

variable "snapshot_retain_count" {
  type = number
}

variable "alarm_email" {
  type    = string
  default = ""
}

variable "domain_aliases" {
  type    = list(string)
  default = []
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "web_acl_arn" {
  type    = string
  default = ""
}

output "site_url" {
  value = module.static_site.url
}

output "instance_id" {
  value = module.app_host.instance_id
}

output "site_bucket" {
  value = module.static_site.bucket_name
}

output "distribution_id" {
  value = module.static_site.distribution_id
}

output "data_volume_id" {
  value = module.app_host.data_volume_id
}
