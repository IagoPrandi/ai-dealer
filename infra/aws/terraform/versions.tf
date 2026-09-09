terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state with native S3 locking (no DynamoDB table needed since
  # Terraform 1.10). Bootstrap the bucket once, out of band, then run
  # `terraform init -backend-config=backend.hcl`. See README.md.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "tyche"
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "ai-dealer"
    }
  }
}
