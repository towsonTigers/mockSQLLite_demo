variable "name" {
  description = "Resource name prefix, e.g. taskflow-dev. Must start with the project name (IAM scoping)."
  type        = string
}

variable "project" {
  type = string
}

variable "env" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "availability_zone" {
  description = "AZ of subnet_id; the data volume must be in the same AZ."
  type        = string
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}

variable "data_volume_gb" {
  type    = number
  default = 10
}

variable "ecr_repository_url" {
  type = string
}

variable "image_tag_parameter" {
  description = "SSM parameter name holding the image tag to run, e.g. /taskflow/dev/image_tag."
  type        = string
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "snapshot_retain_count" {
  type    = number
  default = 7
}

variable "detailed_monitoring" {
  type    = bool
  default = false
}

variable "alarm_email" {
  description = "Optional email for alarm notifications (confirm the subscription email)."
  type        = string
  default     = ""
}
