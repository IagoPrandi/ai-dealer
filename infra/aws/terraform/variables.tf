variable "region" {
  description = "AWS region. Keep it close to the player base and to the Solana RPC provider."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name. Every resource is prefixed with it, so a staging stack can be applied from the same module with a separate state file."
  type        = string
  default     = "production"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,15}$", var.environment))
    error_message = "environment must be lowercase alphanumeric with dashes, 3-16 characters."
  }
}

# ---------------------------------------------------------------------------
# DNS and origins
# ---------------------------------------------------------------------------
variable "api_domain" {
  description = "Public hostname for apps/api, for example api.tywish.com. Caddy requests a certificate for it, so it must already resolve to the instance before the first deploy."
  type        = string
}

variable "worker_domain" {
  description = "Public hostname for apps/worker, for example worker.tywish.com."
  type        = string
}

variable "web_origins" {
  description = "Browser origins allowed to call the API and the worker cross-origin. Becomes WEB_ORIGIN (api) and TYCHE_WORKER_CORS_ORIGINS (worker). Include the Vercel production domain and any custom web domain."
  type        = list(string)

  validation {
    condition     = length(var.web_origins) > 0
    error_message = "At least one web origin is required; without it the browser cannot call the API cross-origin."
  }
}

variable "acme_email" {
  description = "Contact address Let us Encrypt uses for certificate expiry notices."
  type        = string
}

variable "route53_zone_id" {
  description = "Optional Route 53 hosted zone id. When set, A records for api_domain and worker_domain are created automatically; otherwise point them at the Elastic IP yourself."
  type        = string
  default     = null
}

# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------
variable "instance_type" {
  description = <<-EOT
    Single host running api + worker + redis + Caddy.

    t3.medium (2 vCPU / 4 GiB) is the default because it is the cheapest shape
    that comfortably holds the in-memory game state of apps/api plus roughly
    1000 concurrent SSE readers. Below about 300 concurrent players t3.small is
    enough (~US$ 7/month less). If CPUSurplusCreditsCharged stays high the
    instance is undersized for sustained load: move to c7i-flex.large or
    m7i-flex.large instead of paying burst surcharges indefinitely.
  EOT
  type        = string
  default     = "t3.medium"
}

variable "cpu_credits" {
  description = "Burstable credit mode. unlimited is deliberate: a throttled API is a player-visible outage, and the surplus-credit alarm makes the extra cost visible instead of silent. Set standard to hard-cap cost at the price of throttling under sustained load."
  type        = string
  default     = "unlimited"

  validation {
    condition     = contains(["standard", "unlimited"], var.cpu_credits)
    error_message = "cpu_credits must be standard or unlimited."
  }
}

variable "root_volume_gb" {
  description = "Root EBS volume: OS, Docker, and the pulled backend images (the image is about 600 MB and two tags are kept locally for rollback)."
  type        = number
  default     = 30
}

variable "data_volume_gb" {
  description = "Separate EBS volume mounted at /var/lib/tyche for the issued certificates and the Redis append-only file. Kept off the root volume so replacing the instance does not re-request certificates and burn ACME rate limits."
  type        = number
  default     = 5
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
variable "db_instance_class" {
  description = "RDS class, sized from the code: every pg pool uses the driver default of 10 connections and at most about six pools exist across api and worker, so roughly 60 connections against the ~112 this class allows. Raise it when the DatabaseConnections or CPU alarm fires, not preemptively."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "Postgres major version. 18 matches the postgres:18.1 image in docker-compose.yml so local reproduction stays faithful."
  type        = string
  default     = "18"
}

variable "db_allocated_storage_gb" {
  description = "Initial gp3 storage."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage_gb" {
  description = "Storage autoscaling ceiling. audit_logs and solana_event_raw grow every turn, so autoscaling avoids a manual resize during a live turn."
  type        = number
  default     = 100
}

variable "db_backup_retention_days" {
  description = "Automated backup and point-in-time-recovery window."
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Multi-AZ doubles the database cost and buys a failover the single-instance API cannot exploit, since a deploy or restart is downtime either way. Off by default; turn it on when the API becomes horizontally scalable."
  type        = bool
  default     = false
}

# ---------------------------------------------------------------------------
# CI/CD
# ---------------------------------------------------------------------------
variable "github_repository" {
  description = "owner/repo allowed to assume the deploy role through GitHub OIDC. Only workflow runs from this repository can push images or run the deploy command."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be in owner/repo form."
  }
}

variable "github_deploy_ref" {
  description = "Git ref whose workflow runs may deploy. Defaults to the default branch so a pull request, including one from a fork, can never obtain the deploy role."
  type        = string
  default     = "refs/heads/main"
}

variable "create_github_oidc_provider" {
  description = "Set false when the account already has the GitHub Actions OIDC provider, since only one per account is allowed."
  type        = bool
  default     = true
}

variable "ecr_image_retention_count" {
  description = "Number of image tags kept in ECR. Enough to roll back several releases without paying for unbounded storage."
  type        = number
  default     = 15
}

# ---------------------------------------------------------------------------
# Guardrails
# ---------------------------------------------------------------------------
variable "monthly_budget_usd" {
  description = "AWS Budgets threshold. This stack is expected to run near US$ 32/month; the alert fires before a misconfiguration becomes a surprise invoice."
  type        = number
  default     = 60
}

variable "alarm_email" {
  description = "Address subscribed to the alarm and budget SNS topic. Confirm the subscription email after the first apply or nothing is ever delivered."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch retention for deploy command output."
  type        = number
  default     = 30
}
