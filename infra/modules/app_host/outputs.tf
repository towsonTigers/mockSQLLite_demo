output "instance_id" {
  value = aws_instance.app.id
}

output "public_dns" {
  description = "Used as the CloudFront /api/* origin."
  value       = aws_instance.app.public_dns
}

output "data_volume_id" {
  value = aws_ebs_volume.data.id
}

output "log_group" {
  value = aws_cloudwatch_log_group.app.name
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}
