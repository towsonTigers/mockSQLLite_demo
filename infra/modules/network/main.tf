# Minimal VPC: one public subnet in an AZ that offers the chosen instance type.
# No NAT gateway (the instance reaches ECR/SSM over its public IP).

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "name" {
  type = string
}

variable "cidr_block" {
  type    = string
  default = "10.20.0.0/16"
}

variable "instance_type" {
  description = "Used to pick an AZ where this type is offered (e.g. t4g is not in every AZ)."
  type        = string
}

data "aws_ec2_instance_type_offerings" "this" {
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}

locals {
  az = sort(data.aws_ec2_instance_type_offerings.this.locations)[0]
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true # required: CloudFront uses the instance's public DNS name
  tags                 = { Name = var.name }
}

# Lock down the default security group (CIS / Checkov CKV2_AWS_12).
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-default-locked" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = var.name }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.this.id
  availability_zone = local.az
  cidr_block        = cidrsubnet(var.cidr_block, 8, 1)
  tags              = { Name = "${var.name}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${var.name}-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

output "vpc_id" {
  value = aws_vpc.this.id
}

output "subnet_id" {
  value = aws_subnet.public.id
}

output "availability_zone" {
  value = local.az
}
