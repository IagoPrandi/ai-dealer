# One instance runs the whole backend. That is not a compromise, it is what the
# code allows: apps/api holds the operational game state in process memory and
# rehydrates it from Postgres on boot, and apps/worker owns singleton
# automation loops. A second replica of either would double-drive turns and
# serve divergent state, so horizontal scale is a code change, not a
# Terraform change.

data "aws_ssm_parameter" "al2023_ami" {
  # Amazon Linux 2023 tracks the current kernel and ships the SSM agent, the
  # AWS CLI v2, and the NVMe udev rules the data volume mount relies on.
  name = "/aws/service/ami-amzn2023-ami-kernel-default-x86_64"
}

resource "aws_eip" "app" {
  domain = "vpc"

  tags = { Name = local.name }
}

resource "aws_eip_association" "app" {
  allocation_id = aws_eip.app.id
  instance_id   = aws_instance.app.id
}

# Certificates and the Redis append-only file live on their own volume so that
# replacing the instance (an AMI change, an instance-type change) does not
# re-request certificates and consume Let's Encrypt rate limits.
resource "aws_ebs_volume" "data" {
  availability_zone = aws_subnet.public[0].availability_zone
  encrypted         = true
  size              = var.data_volume_gb
  type              = "gp3"

  tags = { Name = "${local.name}-data" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  instance_id = aws_instance.app.id
  volume_id   = aws_ebs_volume.data.id

  # Detaching on instance replacement must not destroy the volume.
  skip_destroy = true
}

resource "aws_instance" "app" {
  ami                    = data.aws_ssm_parameter.al2023_ami.value
  iam_instance_profile   = aws_iam_instance_profile.app.name
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.app.id]

  # No key pair on purpose: shell access is SSM Session Manager only, so there
  # is no private key to leak and no port 22 to scan.
  key_name = null

  # Only burstable (t*) families accept a credit specification. The block is
  # dynamic so switching to the c7i-flex or m7i-flex shape the README recommends
  # for sustained load does not fail the apply.
  dynamic "credit_specification" {
    for_each = startswith(var.instance_type, "t") ? [1] : []

    content {
      cpu_credits = var.cpu_credits
    }
  }

  metadata_options {
    http_endpoint = "enabled"
    # IMDSv2 only: a server-side request forgery in the API cannot read the
    # instance role credentials without also forging the PUT token exchange.
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    delete_on_termination = true
    encrypted             = true
    volume_size           = var.root_volume_gb
    volume_type           = "gp3"

    tags = { Name = "${local.name}-root" }
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    aws_region      = var.region
    data_device     = "/dev/sdf"
    deploy_bucket   = aws_s3_bucket.deploy.bucket
    ecr_repository  = aws_ecr_repository.backend.repository_url
    environment     = var.environment
    ssm_config_path = "/tyche/${var.environment}/config"
  })

  tags = { Name = local.name }

  depends_on = [aws_internet_gateway.main]

  lifecycle {
    # A new AMI id in SSM must not silently replace a running instance during
    # an unrelated apply; replace it deliberately with -replace.
    ignore_changes = [ami]
  }
}

# ---------------------------------------------------------------------------
# Instance role
# ---------------------------------------------------------------------------
resource "aws_iam_role" "app" {
  name = "${local.name}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "app_ssm" {
  # Provides the Session Manager and Run Command channels.
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  role       = aws_iam_role.app.name
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.name}-instance"
  role = aws_iam_role.app.name
}

data "aws_iam_policy_document" "app_runtime" {
  statement {
    sid       = "PullBackendImage"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "ReadBackendRepository"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  statement {
    sid = "ReadReleaseBundle"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
    ]
    resources = ["${aws_s3_bucket.deploy.arn}/*"]
  }

  statement {
    sid       = "ListReleaseBundle"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.deploy.arn]
  }

  statement {
    sid     = "ReadRuntimeConfiguration"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/tyche/${var.environment}/config",
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/tyche/${var.environment}/config/*",
    ]
  }

  statement {
    sid     = "ReadRuntimeSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.runtime.arn,
      # The RDS-managed master password. Its name carries a random suffix, so
      # the resource is addressed through the cluster attribute rather than a
      # literal ARN.
      one(aws_db_instance.main.master_user_secret).secret_arn,
    ]
  }
}

resource "aws_iam_role_policy" "app_runtime" {
  name   = "${local.name}-runtime"
  policy = data.aws_iam_policy_document.app_runtime.json
  role   = aws_iam_role.app.id
}
