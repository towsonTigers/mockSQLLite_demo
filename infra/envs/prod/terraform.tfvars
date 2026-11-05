region                = "us-east-1"
vpc_cidr              = "10.30.0.0/16"
instance_type         = "t4g.small"
data_volume_gb        = 10
log_retention_days    = 30
snapshot_retain_count = 30
alarm_email           = "" # e.g. "you@example.com"; confirm the subscription email AWS sends

# Custom domain (optional). Certificate must be in us-east-1.
# domain_aliases      = ["taskflow.example.com"]
# acm_certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
