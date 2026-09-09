output "public_ip" {
  description = "Elastic IP. Point the A records for api_domain and worker_domain here before the first deploy, otherwise the certificate request fails."
  value       = aws_eip.app.public_ip
}

output "instance_id" {
  description = "Target of the deploy command and of `aws ssm start-session`."
  value       = aws_instance.app.id
}

output "ecr_repository_url" {
  description = "Image repository. Releases are tagged sha-<commit>."
  value       = aws_ecr_repository.backend.repository_url
}

output "deploy_bucket" {
  description = "Release bundle bucket: compose file, Caddyfile, non-secret environment, host scripts."
  value       = aws_s3_bucket.deploy.bucket
}

output "runtime_secret_arn" {
  description = "Secret holding the LLM keys, the Solana RPC URL, and the turn authority keypair. Populate it with `aws secretsmanager put-secret-value` before the first deploy."
  value       = aws_secretsmanager_secret.runtime.arn
}

output "database_endpoint" {
  description = "Private RDS endpoint. Reachable only from the application security group."
  value       = aws_db_instance.main.address
}

output "database_master_secret_arn" {
  description = "RDS-managed master credentials. Read by the host to build DATABASE_URL; never in Terraform state."
  value       = one(aws_db_instance.main.master_user_secret).secret_arn
}

# ---------------------------------------------------------------------------
# Values to store as GitHub Actions repository variables
# ---------------------------------------------------------------------------
output "github_actions_variables" {
  description = "Copy these into GitHub as repository variables (Settings, Actions, Variables). None of them is a secret: the deploy role is assumed through OIDC, so there is no access key to store."
  value = {
    AWS_REGION          = var.region
    AWS_DEPLOY_ROLE_ARN = aws_iam_role.github_deploy.arn
    AWS_PLAN_ROLE_ARN   = aws_iam_role.github_plan.arn
    ECR_REPOSITORY      = aws_ecr_repository.backend.repository_url
    DEPLOY_BUCKET       = aws_s3_bucket.deploy.bucket
    DEPLOY_INSTANCE_ID  = aws_instance.app.id
    TYCHE_API_DOMAIN    = var.api_domain
    TYCHE_WORKER_DOMAIN = var.worker_domain
  }
}
