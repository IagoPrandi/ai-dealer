#!/usr/bin/env bash
#
# Runs `tyche-deploy <tag>` (or `tyche-deploy rollback`) on the instance through
# SSM Run Command and waits for it.
#
# Run Command is the deploy channel instead of SSH: the runner needs no inbound
# access to the host, no key pair exists to leak, and every invocation is
# recorded in the SSM command history and in CloudWatch.
#
# The AWS CLI `command-executed` waiter caps out at 100 seconds, which is
# shorter than the health gate in deploy.sh, so the polling loop here is
# explicit.
set -euo pipefail

INSTANCE_ID="${INSTANCE_ID:?INSTANCE_ID is required}"
ENVIRONMENT="${TYCHE_ENVIRONMENT:-production}"
TARGET="${1:?usage: run-deploy-command.sh <image-tag>|rollback}"
POLL_TIMEOUT_SECONDS=900

case "$TARGET" in
  *[!A-Za-z0-9._-]*)
    echo "::error::Refusing to send a command containing unexpected characters: $TARGET"
    exit 1
    ;;
esac

echo "Sending 'tyche-deploy $TARGET' to $INSTANCE_ID"
command_id="$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "tyche-deploy $TARGET" \
  --parameters "commands=[\"tyche-deploy $TARGET\"]" \
  --timeout-seconds 600 \
  --cloud-watch-output-config "CloudWatchOutputEnabled=true,CloudWatchLogGroupName=/tyche/$ENVIRONMENT/deploy" \
  --query Command.CommandId --output text)"

echo "Command id: $command_id"

status="Pending"
deadline=$((SECONDS + POLL_TIMEOUT_SECONDS))
while [ "$SECONDS" -lt "$deadline" ]; do
  # The invocation is not queryable for a moment after send-command returns.
  status="$(aws ssm get-command-invocation \
    --command-id "$command_id" \
    --instance-id "$INSTANCE_ID" \
    --query Status --output text 2>/dev/null || echo Pending)"

  case "$status" in
    Pending | InProgress | Delayed)
      sleep 10
      ;;
    *)
      break
      ;;
  esac
done

invocation="$(aws ssm get-command-invocation \
  --command-id "$command_id" \
  --instance-id "$INSTANCE_ID" \
  --output json)"

echo "--- host output ---"
jq -r '.StandardOutputContent // ""' <<<"$invocation"

stderr_content="$(jq -r '.StandardErrorContent // ""' <<<"$invocation")"
if [ -n "$stderr_content" ]; then
  echo "--- host errors ---"
  echo "$stderr_content"
fi

status="$(jq -r '.Status' <<<"$invocation")"
echo "--- status: $status ---"

if [ "$status" != "Success" ]; then
  echo "::error::Deploy command finished with status $status. Full output: CloudWatch log group /tyche/$ENVIRONMENT/deploy, command $command_id."
  exit 1
fi
