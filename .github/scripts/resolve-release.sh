#!/usr/bin/env bash
#
# Decides what this run should publish and deploy. Three outputs:
#
#   image_tag      - the tag to run
#   build_required - whether the image has to be built and pushed
#   should_deploy  - whether the host should be touched at all
#
# A documentation-only or frontend-only push resolves to should_deploy=false:
# restarting the API costs a short player-visible outage while its in-memory
# state rehydrates from Postgres, so it happens only when the backend actually
# changed.
#
# Values that arrive from the workflow context are read from the environment
# rather than interpolated into this script, and the tag is validated before it
# reaches any command line.
set -euo pipefail

: "${ECR_REPOSITORY:?ECR_REPOSITORY is required}"
CURRENT_SHA="${CURRENT_SHA:?CURRENT_SHA is required}"
BEFORE_SHA="${BEFORE_SHA:-}"
EVENT_NAME="${EVENT_NAME:-push}"
REQUESTED_TAG="${REQUESTED_TAG:-}"

emit() { echo "$1=$2" >>"$GITHUB_OUTPUT"; }

# ---------------------------------------------------------------------------
# Explicit redeploy of an existing tag.
# ---------------------------------------------------------------------------
if [ -n "$REQUESTED_TAG" ]; then
  case "$REQUESTED_TAG" in
    *[!A-Za-z0-9._-]*)
      echo "::error::Refusing tag with unexpected characters: $REQUESTED_TAG"
      exit 1
      ;;
  esac

  if ! aws ecr describe-images \
    --repository-name "${ECR_REPOSITORY#*/}" \
    --image-ids "imageTag=$REQUESTED_TAG" >/dev/null 2>&1; then
    echo "::error::Tag $REQUESTED_TAG does not exist in $ECR_REPOSITORY."
    exit 1
  fi

  echo "Redeploying existing tag $REQUESTED_TAG"
  emit image_tag "$REQUESTED_TAG"
  emit build_required false
  emit should_deploy true
  exit 0
fi

IMAGE_TAG="sha-$CURRENT_SHA"
emit image_tag "$IMAGE_TAG"

# ---------------------------------------------------------------------------
# Does this commit change the backend?
# ---------------------------------------------------------------------------
# Paths that end up inside the image or in the release bundle. contracts/solana
# is included because the worker runs tokenomics-calculator, which is compiled
# from it.
BACKEND_PATHS='^(apps/(api|worker)/|packages/|contracts/solana/|deployments/|infra/(docker|aws)/|pnpm-lock\.yaml|pnpm-workspace\.yaml|package\.json|\.npmrc)'

backend_changed=true
if [ "$EVENT_NAME" = "push" ] && [ -n "$BEFORE_SHA" ] &&
  [ "$BEFORE_SHA" != "0000000000000000000000000000000000000000" ] &&
  git cat-file -e "$BEFORE_SHA^{commit}" 2>/dev/null; then
  changed_files="$(git diff --name-only "$BEFORE_SHA" "$CURRENT_SHA")"
  if grep -qE "$BACKEND_PATHS" <<<"$changed_files"; then
    backend_changed=true
  else
    backend_changed=false
  fi
  echo "Changed files in this push:"
  echo "$changed_files"
else
  # A manual run, a force push, or a first push on the branch: there is no
  # reliable range to diff, so treat it as a backend change rather than
  # silently skipping a deploy.
  echo "No comparable base commit; treating this run as a backend change."
fi

if [ "$backend_changed" = false ]; then
  echo "No backend paths changed; skipping the rollout."
  emit build_required false
  emit should_deploy false
  exit 0
fi

emit should_deploy true

# ---------------------------------------------------------------------------
# The repository has immutable tags, so re-running a workflow for a commit
# whose image already exists must reuse it instead of failing on PutImage.
# ---------------------------------------------------------------------------
if aws ecr describe-images \
  --repository-name "${ECR_REPOSITORY#*/}" \
  --image-ids "imageTag=$IMAGE_TAG" >/dev/null 2>&1; then
  echo "$IMAGE_TAG already published; reusing it."
  emit build_required false
else
  echo "Building $IMAGE_TAG."
  emit build_required true
fi
