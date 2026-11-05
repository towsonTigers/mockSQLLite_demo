terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial backend config: bucket and region are passed at init time,
  #   terraform init -backend-config="bucket=$TF_STATE_BUCKET" -backend-config="region=us-east-1"
  backend "s3" {
    key          = "envs/prod/terraform.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "taskflow"
      Environment = "prod"
      ManagedBy   = "terraform"
      Repository  = "towsonTigers/mockSQLLite_demo"
    }
  }
}

module "stack" {
  source                = "../../modules/stack"
  env                   = "prod"
  region                = var.region
  vpc_cidr              = var.vpc_cidr
  instance_type         = var.instance_type
  data_volume_gb        = var.data_volume_gb
  log_retention_days    = var.log_retention_days
  snapshot_retain_count = var.snapshot_retain_count
  alarm_email           = var.alarm_email
  domain_aliases        = var.domain_aliases
  acm_certificate_arn   = var.acm_certificate_arn
}

output "site_url" {
  value = module.stack.site_url
}

output "instance_id" {
  value = module.stack.instance_id
}

output "site_bucket" {
  value = module.stack.site_bucket
}

output "distribution_id" {
  value = module.stack.distribution_id
}
