#!/usr/bin/env bash
# Configure GitHub environments + variables from the bootstrap stack's outputs.
#
# Prereqs: gh CLI logged in with admin on the repo, terraform, jq.
# Usage (from repo root, after `terraform apply` in infra/bootstrap):
#   ./scripts/configure-github.sh [owner/repo]
set -euo pipefail

REPO="${1:-towsonTigers/mockSQLLite_demo}"
OUT="$(terraform -chdir=infra/bootstrap output -json)"
val() { jq -r "$1" <<<"$OUT"; }

echo "Configuring $REPO"

# ---- repository-level variables (not secret: role ARNs are not credentials)
gh variable set AWS_REGION        --repo "$REPO" --body "$(val .region.value)"
gh variable set TF_STATE_BUCKET   --repo "$REPO" --body "$(val .state_bucket.value)"
gh variable set TF_PLAN_ROLE_ARN  --repo "$REPO" --body "$(val .plan_role_arn.value)"
gh variable set ECR_PUSH_ROLE_ARN --repo "$REPO" --body "$(val .ecr_push_role_arn.value)"

ME_ID="$(gh api user --jq .id)"

for ENV in dev prod; do
  echo "Environment: $ENV"
  if [ "$ENV" = "prod" ]; then
    # Required reviewer (you) + deploy only from protected branches (main).
    jq -n --argjson id "$ME_ID" '{
      wait_timer: 0,
      prevent_self_review: false,
      reviewers: [{type: "User", id: $id}],
      deployment_branch_policy: {protected_branches: true, custom_branch_policies: false}
    }' | gh api -X PUT "repos/$REPO/environments/$ENV" --input - >/dev/null
  else
    jq -n '{deployment_branch_policy: {protected_branches: true, custom_branch_policies: false}}' \
      | gh api -X PUT "repos/$REPO/environments/$ENV" --input - >/dev/null
  fi

  gh variable set TF_APPLY_ROLE_ARN --repo "$REPO" --env "$ENV" --body "$(val ".apply_role_arns.value.$ENV")"
  gh variable set DEPLOY_ROLE_ARN   --repo "$REPO" --env "$ENV" --body "$(val ".deploy_role_arns.value.$ENV")"
done

cat <<MSG

Done. Remaining manual step (needs repo admin, one time):
  Settings > Branches > add a rule (or ruleset) for "main":
    - Require a pull request before merging
    - Require status checks: "Backend tests", "Frontend build", "fmt + security scan"
  "protected_branches: true" above means environments only deploy from a
  protected branch, so dev/prod deploys will wait until this rule exists.
MSG
