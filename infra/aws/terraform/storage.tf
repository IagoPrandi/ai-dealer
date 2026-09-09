data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Container registry
# ---------------------------------------------------------------------------
# One repository, because apps/api and apps/worker ship from the same image
# (see infra/docker/Dockerfile.prod): a single tag per release makes it
# impossible for the API and the worker to run different commits.
resource "aws_ecr_repository" "backend" {
  name = "tyche/backend"

  # Immutable tags mean a tag always identifies exactly one artifact. There is
  # therefore no movable "latest": releases are addressed as sha-<commit> and
  # the deployed tag is recorded on the host for rollback.
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    # AES256 is the free default. A customer-managed KMS key would add cost
    # without changing who can pull the image, which the repository policy and
    # the instance role already control.
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last ${var.ecr_image_retention_count} release images."
      selection = {
        countNumber = var.ecr_image_retention_count
        countType   = "imageCountMoreThan"
        tagStatus   = "any"
      }
      action = { type = "expire" }
    }]
  })
  repository = aws_ecr_repository.backend.name
}

# ---------------------------------------------------------------------------
# Release bundle
# ---------------------------------------------------------------------------
# The compose file, the Caddyfile, the non-secret environment file, and the
# host scripts are versioned artifacts too. CI syncs them here and the host
# pulls them, so a configuration change goes through the same reviewed pipeline
# as a code change and nobody edits files on the box by hand.
resource "aws_s3_bucket" "deploy" {
  bucket = "${local.name}-deploy-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "deploy" {
  bucket                  = aws_s3_bucket.deploy.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "deploy" {
  bucket = aws_s3_bucket.deploy.id

  versioning_configuration {
    # Versioning is what makes a configuration rollback possible: the previous
    # release bundle is still retrievable after a bad sync.
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "deploy" {
  bucket = aws_s3_bucket.deploy.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "deploy" {
  bucket = aws_s3_bucket.deploy.id

  rule {
    id     = "expire-old-bundle-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "main" {
  family = "postgres${var.db_engine_version}"
  name   = local.name

  parameter {
    # Log statements slower than 2s. The rule pipeline is LLM-bound, so a slow
    # query here is a real signal rather than noise.
    name  = "log_min_duration_statement"
    value = "2000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name  = "tyche_${replace(var.environment, "-", "_")}"
  username = "tyche"

  # The master password is generated and rotated by RDS and stored in Secrets
  # Manager. It therefore never appears in the Terraform state, the plan
  # output, or a CI log.
  manage_master_user_password = true

  allocated_storage     = var.db_allocated_storage_gb
  max_allocated_storage = var.db_max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  backup_retention_period = var.db_backup_retention_days
  backup_window           = "05:00-06:00"
  maintenance_window      = "sun:06:30-sun:07:30"
  copy_tags_to_snapshot   = true

  auto_minor_version_upgrade = true
  apply_immediately          = false

  # The audit hash chain, claim records, and prize accounting live here.
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-final"

  # Performance Insights and enhanced monitoring are deliberately off: both
  # add recurring cost, and the CloudWatch alarms in monitoring.tf cover the
  # failure modes this stack can actually act on.
  performance_insights_enabled = false
  monitoring_interval          = 0

  enabled_cloudwatch_logs_exports = ["postgresql"]
}

# ---------------------------------------------------------------------------
# Runtime secrets
# ---------------------------------------------------------------------------
# Secrets Manager rather than SSM Parameter Store because the runtime
# environment is far larger than the 4 KB Parameter Store limit and because RDS
# managed password rotation only integrates with Secrets Manager.
#
# Terraform creates the container but never the contents: the operator writes
# the JSON with `aws secretsmanager put-secret-value`, so no credential is ever
# in the repository, the plan, or the state.
resource "aws_secretsmanager_secret" "runtime" {
  name        = "tyche/${var.environment}/runtime"
  description = "LLM provider keys, Solana RPC URL, turn authority keypair, and operator tokens for the Tyche backend."

  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "runtime_placeholder" {
  secret_id = aws_secretsmanager_secret.runtime.id

  # A first version has to exist for the host to be able to read the secret at
  # all. The placeholder is intentionally invalid so a host that boots before
  # the operator has provisioned the real values fails loudly instead of
  # starting with silently empty configuration.
  secret_string = jsonencode({
    TYCHE_RUNTIME_SECRETS_PROVISIONED = "false"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ---------------------------------------------------------------------------
# Non-secret runtime configuration
# ---------------------------------------------------------------------------
# Values Terraform knows and the host needs. Standard-tier parameters are free,
# which is why they are separated from the paid secret above.
resource "aws_ssm_parameter" "config" {
  for_each = {
    TYCHE_API_DOMAIN          = var.api_domain
    TYCHE_WORKER_DOMAIN       = var.worker_domain
    ACME_EMAIL                = var.acme_email
    WEB_ORIGIN                = join(",", var.web_origins)
    TYCHE_WORKER_CORS_ORIGINS = join(",", var.web_origins)
    TYCHE_DB_HOST             = aws_db_instance.main.address
    TYCHE_DB_PORT             = tostring(aws_db_instance.main.port)
    TYCHE_DB_NAME             = aws_db_instance.main.db_name
    TYCHE_DB_SECRET_ARN       = one(aws_db_instance.main.master_user_secret).secret_arn
    TYCHE_RUNTIME_SECRET_ARN  = aws_secretsmanager_secret.runtime.arn
    TYCHE_ECR_REPOSITORY      = aws_ecr_repository.backend.repository_url
    # Read by the deploy workflow so GitHub only has to know the region and the
    # role ARN; everything else about the target comes from here.
    TYCHE_INSTANCE_ID   = aws_instance.app.id
    TYCHE_DEPLOY_BUCKET = aws_s3_bucket.deploy.bucket
  }

  name  = "/tyche/${var.environment}/config/${each.key}"
  type  = "String"
  value = each.value
  tier  = "Standard"
}
