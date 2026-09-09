#!/usr/bin/env bash
#
# Reads the deploy target from SSM Parameter Store and exposes it as step
# outputs. Terraform writes those parameters, so GitHub only has to know the
# region and the role ARN: an instance replacement or a domain change needs no
# repository configuration change.
set -euo pipefail

ENVIRONMENT="${TYCHE_ENVIRONMENT:-production}"
CONFIG_PATH="/tyche/$ENVIRONMENT/config"

config="$(aws ssm get-parameters-by-path \
  --path "$CONFIG_PATH" \
  --query 'Parameters[].{name:Name,value:Value}' \
  --output json)"

value_of() {
  jq -r --arg key "$CONFIG_PATH/$1" \
    'map(select(.name == $key)) | .[0].value // empty' <<<"$config"
}

declare -A outputs=(
  [instance_id]=TYCHE_INSTANCE_ID
  [ecr_repository]=TYCHE_ECR_REPOSITORY
  [deploy_bucket]=TYCHE_DEPLOY_BUCKET
  [api_domain]=TYCHE_API_DOMAIN
  [worker_domain]=TYCHE_WORKER_DOMAIN
)

missing=()
for output in "${!outputs[@]}"; do
  parameter="${outputs[$output]}"
  resolved="$(value_of "$parameter")"
  if [ -z "$resolved" ]; then
    missing+=("$CONFIG_PATH/$parameter")
    continue
  fi
  echo "$output=$resolved" >>"$GITHUB_OUTPUT"
  echo "$output=$resolved"
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "::error::Missing SSM parameters: ${missing[*]}. Apply infra/aws/terraform first."
  exit 1
fi
