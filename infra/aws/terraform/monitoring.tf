# Alarms are chosen for what an operator can actually act on with a
# single-instance backend. Each CloudWatch alarm costs US$ 0.10/month, so this
# is a short list rather than a dashboard.

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  endpoint  = var.alarm_email
  protocol  = "email"
  topic_arn = aws_sns_topic.alerts.arn
}

# Deploy command output. Container logs stay on the host in rotated json-file
# form so `docker compose logs` keeps working during an incident; see the
# comment in docker-compose.prod.yml for the CloudWatch alternative.
resource "aws_cloudwatch_log_group" "deploy" {
  name              = "/tyche/${var.environment}/deploy"
  retention_in_days = var.log_retention_days
}

# ---------------------------------------------------------------------------
# Instance
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "instance_unreachable" {
  alarm_name          = "${local.name}-instance-unreachable"
  alarm_description   = "EC2 or hypervisor status check failing. The recovery action reboots or migrates the instance; the API rehydrates its state from Postgres on boot."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed"
  statistic           = "Maximum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  period              = 60
  evaluation_periods  = 3
  treat_missing_data  = "breaching"

  dimensions = { InstanceId = aws_instance.app.id }

  alarm_actions = [
    aws_sns_topic.alerts.arn,
    "arn:aws:automate:${var.region}:ec2:recover",
  ]
  ok_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "instance_cpu" {
  alarm_name          = "${local.name}-instance-cpu-high"
  alarm_description   = "Sustained CPU above 80%. At this point the single API process is the bottleneck: resize the instance rather than waiting for players to notice."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  period              = 300
  evaluation_periods  = 3
  treat_missing_data  = "notBreaching"

  dimensions = { InstanceId = aws_instance.app.id }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "instance_burst_surcharge" {
  # Only meaningful on a burstable instance running in unlimited mode.
  count = var.cpu_credits == "unlimited" && startswith(var.instance_type, "t") ? 1 : 0

  alarm_name          = "${local.name}-instance-burst-surcharge"
  alarm_description   = "The instance is paying for surplus CPU credits. Persistent surcharges mean the burstable shape is the wrong one: move to c7i-flex.large or m7i-flex.large."
  namespace           = "AWS/EC2"
  metric_name         = "CPUSurplusCreditsCharged"
  statistic           = "Sum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  period              = 3600
  evaluation_periods  = 6
  treat_missing_data  = "notBreaching"

  dimensions = { InstanceId = aws_instance.app.id }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name          = "${local.name}-db-storage-low"
  alarm_description   = "Under 4 GiB of free database storage. Autoscaling should handle it; this fires if it does not."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  comparison_operator = "LessThanThreshold"
  threshold           = 4294967296
  period              = 300
  evaluation_periods  = 2
  treat_missing_data  = "breaching"

  dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "db_connections" {
  alarm_name          = "${local.name}-db-connections-high"
  alarm_description   = "Above 80 connections. The api and worker pools use the pg default of 10 each, so this means a pool is being recreated without being ended."
  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Maximum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  period              = 300
  evaluation_periods  = 2
  treat_missing_data  = "notBreaching"

  dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "db_cpu_credits" {
  alarm_name          = "${local.name}-db-cpu-credits-low"
  alarm_description   = "The burstable database is running out of CPU credits, which throttles every query the API makes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUCreditBalance"
  statistic           = "Minimum"
  comparison_operator = "LessThanThreshold"
  threshold           = 30
  period              = 300
  evaluation_periods  = 3
  treat_missing_data  = "notBreaching"

  dimensions = { DBInstanceIdentifier = aws_db_instance.main.identifier }

  alarm_actions = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$tyche"]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    notification_type         = "ACTUAL"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    notification_type         = "FORECASTED"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }
}

# Budgets publishes through SNS, which requires an explicit topic policy.
data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid       = "AllowBudgets"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      identifiers = ["budgets.amazonaws.com"]
      type        = "Service"
    }
  }

  statement {
    sid       = "AllowCloudWatchAlarms"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      identifiers = ["cloudwatch.amazonaws.com"]
      type        = "Service"
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}
