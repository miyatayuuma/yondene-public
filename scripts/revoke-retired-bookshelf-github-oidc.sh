#!/usr/bin/env bash
# Retire ONLY the two verified GitHub federation providers for the former
# reading-shelf Actions writer. This script does not access Firestore or GAS.
# Default mode is READ ONLY. --apply requires explicit operator confirmation.
set -Eeuo pipefail
PROJECT_ID=kodomo-reading-shelf-87f11
PROJECT_NUMBER=565070188680
POOL=reading-shelf-github
SERVICE_ACCOUNT=reading-shelf-gh-sync@kodomo-reading-shelf-87f11.iam.gserviceaccount.com
MODE="${1:---check}"
if [[ "$MODE" != "--check" && "$MODE" != "--apply" ]]; then
  echo "Usage: bash $0 [--check|--apply]" >&2
  exit 2
fi
command -v gcloud >/dev/null || { echo "gcloud CLI is required" >&2; exit 1; }
actual="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[[ "$actual" == "$PROJECT_NUMBER" ]] || {
  echo "Wrong project number; no IAM changes made" >&2; exit 1;
}
# The provider identity MUST match the old repository numeric claim.
providers=(
  "repo-main:1366987408:miyatayuuma/legacy-games"
  "repo-yondene:1421471195:miyatayuuma/yondene"
)
echo "Project number verified; scope: former GitHub-only bookshelf writer."
for item in "${providers[@]}"; do
  IFS=: read -r provider repo_id repository <<< "$item"
  if ! desc="$(gcloud iam workload-identity-pools providers describe "$provider" \
    --workload-identity-pool="$POOL" --location=global --project="$PROJECT_ID" \
    --format=json 2>/dev/null)"; then
    echo "$provider: provider not present, skipping"
    continue
  fi
  # Only retire this exact old repository's provider. Refuse unrelated IAM.
  if [[ "$desc" != *"assertion.repository_id=='$repo_id'"* ]] ||
     [[ "$desc" != *"token.actions.githubusercontent.com"* ]]; then
    echo "$provider: expected GitHub repository binding missing; REFUSING" >&2
    exit 1
  fi
  echo "$provider: verified old repository=$repository"
done
policy="$(gcloud iam service-accounts get-iam-policy "$SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" --format=json)"
echo "Legacy service account policy read: OK."
if [[ "$MODE" == "--check" ]]; then
  echo "CHECK_ONLY: no permission changes made. Rerun with --apply after review."
  exit 0
fi
echo "This DISABLES only the two old GitHub OIDC providers and revokes their"
echo "workloadIdentityUser bindings on the dedicated old bookshelf account."
echo "It does NOT delete Firestore records, change GAS OAuth, or deploy Hosting."
read -r -p "Type DISABLE_OLD_BOOK_WRITERS: " approval
[[ "$approval" == "DISABLE_OLD_BOOK_WRITERS" ]] || {
  echo "No changes made"; exit 1;
}
for item in "${providers[@]}"; do
  IFS=: read -r provider repo_id repository <<< "$item"
  if gcloud iam workload-identity-pools providers describe "$provider" \
    --workload-identity-pool="$POOL" --location=global --project="$PROJECT_ID" \
    --format='value(name)' >/dev/null 2>&1; then
    state="$(gcloud iam workload-identity-pools providers describe "$provider" \
      --workload-identity-pool="$POOL" --location=global --project="$PROJECT_ID" \
      --format='value(state)')"
    if [[ "$state" != "DISABLED" && "$state" != "DELETED" ]]; then
      gcloud iam workload-identity-pools providers disable "$provider" \
        --workload-identity-pool="$POOL" --location=global --project="$PROJECT_ID" --quiet
    fi
    echo "$provider: DISABLED (or previously deleted)."
  fi
  member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$repository"
  if [[ "$policy" == *"$member"* ]]; then
    gcloud iam service-accounts remove-iam-policy-binding "$SERVICE_ACCOUNT" \
      --project="$PROJECT_ID" --member="$member" \
      --role='roles/iam.workloadIdentityUser' --quiet
    echo "Removed legacy workloadIdentityUser: $repository"
  else
    echo "Legacy IAM principal already absent: $repository"
  fi
done
echo "OLD_GITHUB_OIDC_RETIRED: verify providers state and IAM policy independently."
