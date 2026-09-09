# GitHub Actions authenticates with OIDC. There is no access key anywhere: no
# long-lived credential to rotate, to leak in a log, or to forget in a
# repository secret.
#
# Two roles with different blast radius:
#
#   * deploy  - push an image, sync the release bundle, run the deploy command.
#               Assumable only from github_deploy_ref, so a pull request
#               (including one from a fork) cannot obtain it.
#   * plan    - read-only, for `terraform plan` on pull requests.
#
# There is deliberately no role that can `terraform apply`. An apply can
# create IAM principals and delete the database, so it is performed by a human
# with their own credentials and MFA, following README.md. Automating it would
# mean handing an admin-equivalent role to anything that can trigger a
# workflow.

locals {
  github_oidc_url = "https://token.actions.githubusercontent.com"
  github_oidc_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  client_id_list = ["sts.amazonaws.com"]
  url            = local.github_oidc_url
}

data "aws_iam_policy_document" "github_deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      identifiers = [local.github_oidc_arn]
      type        = "Federated"
    }

    condition {
      test     = "StringEquals"
      values   = ["sts.amazonaws.com"]
      variable = "token.actions.githubusercontent.com:aud"
    }

    condition {
      test     = "StringEquals"
      values   = ["repo:${var.github_repository}:ref:${var.github_deploy_ref}"]
      variable = "token.actions.githubusercontent.com:sub"
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume.json
  description        = "Build, publish, and roll out the Tyche backend from ${var.github_repository}."
  name               = "${local.name}-github-deploy"
  # A workflow run that needs longer than this to deploy is stuck, not slow.
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PublishBackendImage"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  statement {
    sid = "PublishReleaseBundle"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.deploy.arn}/*"]
  }

  statement {
    sid       = "ListReleaseBundle"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.deploy.arn]
  }

  statement {
    sid     = "RunDeployCommand"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.app.arn,
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid = "ReadDeployCommandResult"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
      "ssm:ListCommands",
    ]
    resources = ["*"]
  }

  statement {
    sid = "ReadDeployConfiguration"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
    ]
    resources = [
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/tyche/${var.environment}/config",
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter/tyche/${var.environment}/config/*",
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.name}-github-deploy"
  policy = data.aws_iam_policy_document.github_deploy.json
  role   = aws_iam_role.github_deploy.id
}

# ---------------------------------------------------------------------------
# Plan-only role for pull requests
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "github_plan_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      identifiers = [local.github_oidc_arn]
      type        = "Federated"
    }

    condition {
      test     = "StringEquals"
      values   = ["sts.amazonaws.com"]
      variable = "token.actions.githubusercontent.com:aud"
    }

    condition {
      # Any ref in this repository, because a plan must run on pull requests.
      # The role is read-only apart from the state lock.
      test     = "StringLike"
      values   = ["repo:${var.github_repository}:*"]
      variable = "token.actions.githubusercontent.com:sub"
    }
  }
}

resource "aws_iam_role" "github_plan" {
  assume_role_policy = data.aws_iam_policy_document.github_plan_assume.json
  description        = "Read-only terraform plan for pull requests from ${var.github_repository}."
  name               = "${local.name}-github-plan"
}

resource "aws_iam_role_policy_attachment" "github_plan_readonly" {
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
  role       = aws_iam_role.github_plan.name
}

# A plan still has to read the state and take the lock. The state bucket is
# created out of band during bootstrap, so it is addressed by name.
data "aws_iam_policy_document" "github_plan_state" {
  statement {
    sid = "TerraformState"
    actions = [
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:PutObject",
    ]
    resources = [
      "arn:aws:s3:::${local.name}-tfstate-${data.aws_caller_identity.current.account_id}",
      "arn:aws:s3:::${local.name}-tfstate-${data.aws_caller_identity.current.account_id}/*",
    ]
  }
}

resource "aws_iam_role_policy" "github_plan_state" {
  name   = "${local.name}-github-plan-state"
  policy = data.aws_iam_policy_document.github_plan_state.json
  role   = aws_iam_role.github_plan.id
}
