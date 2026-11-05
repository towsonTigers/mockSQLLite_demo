variable "region" {
  type    = string
  default = "us-east-1"
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
