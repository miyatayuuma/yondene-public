# Private GitHub retirement — Yondene

## Owner decision (2026-10-25 JST)

Retire the private GitHub repository and **all GitHub Actions paths that can
write to the family Firestore dataset**, including the prior v1 writer and
Dataset Sync v2. The owner does not require GitHub-hosted Firestore backups.
Do not copy private books, family metadata, user records, historical command
JSON, access tokens, or GitHub history into this public repository.

Retain **PUBLIC GitHub** for application and generic GAS code, synthetic
tests, CI and deployment instructions only. Retain **Firestore** as the sole
live data authority and the **PRIVATE Google Sheet** for the read-only
Firestore mirror, authorized edit queue and labelled historical archive.
A Sheet is a mutable ledger and does not by itself guarantee disaster
recovery; do not call it a recoverable backup.

## Already verified (bounded scope)

- The owner-only/private Sheet has a dedicated historical GitHub archive,
  separate from the Firestore live mirror and the command queue. Archival
  comparison checks original main-branch file paths, Git blob IDs and
  full-text lengths. It is an **archive of current main files only**:
  Git commit history, old PR/Issue conversations and workflow logs were
  not archived. Never reimport legacy JSON into live Firestore.
- Scoped real GAS acceptance passed for read-only catalogue no-change
  marker and for an authorized one-field book patch. The latter showed
  one create-only immutable marker, CAS and an independent post-sync
  comparison preserving the non-approved prior fields.
- The owner disabled the effective legacy v1 write Environment switch
  (operator-reported). General GAS queue gate remains disabled; successful
  scoped acceptance does **not** enable routine writes.
- The private repository's **scheduled encrypted backup dispatch** was
  removed from its main workflow, as requested. The legacy backup job code,
  manual paths and previously stored artifacts have not been deleted.

## Must complete BEFORE deleting private GitHub

1. **PUBLIC source completeness** — compare current private and public
   PWA modules, tests, Rules and docs. Classify all differences as intended,
   missing functionality or unsafe-to-publish material. Only move
   non-personal application source and synthetic tests to PUBLIC. Preserve
   user-facing behavior and run public CI.
2. **Normal GAS queue parity** — verify `book.create`, `book.patch`,
   `series.create`, `series.patch`, `childRating.set`,
   `childReflection.create`, `catalog.audit` and settings-driven rename
   against correct Firestore types, semantics, expected revisions and
   durable marker reconciliation. State explicitly which legacy operations
   remain intentionally unsupported; protect completion times, verbatim
   comments and subjective rating provenance.
3. **Single-writer cutover** — independently recheck that no private
   Actions v1/v2 write can start and none is in-flight. Inspect private
   GAS editors, deployed source, OAuth scopes, manual/automatic triggers
   and the Sheet's owner-only sharing. Approve continuous GAS
   processing **separately**; then verify production idempotency,
   conflicts, stuck queue recovery, and fresh Firestore-to-Sheets sync.
4. **PUBLIC Hosting transition** — switch deployment source only after
   verified code parity, production protections, controlled release and
   app-level acceptance. Hosting transition and write-path transfer are
   distinct. Never treat CI success as proof of end-user behavior.
5. **History disposition** — the private repository contains historical
   Issues, PR discussions, commits and artifacts beyond the archived
   current-main documents. Review which material may be intentionally
   discarded; do not mistake the private Sheet archive for Git history.
6. **Final deletion** — check the authorized Sheet archive and mirror,
   confirm all workflows no longer depend on private code/Actions,
   confirm no secret or deploy authority relies on private GitHub,
   and have the owner perform the final irreversible private-repository
   deletion. Deleting the repo is not needed for the writer handoff itself.

## Excluded from this task

- No Firestore data reset or bulk re-import.
- No publication of private data, screenshots or verbatim personal content.
- No GitHub-hosted backup replacement requirement; the owner accepts the
  consequence of forgoing separate historical recovery.
- No automatic migration of previously deleted private Git history.
- No hidden enablement of the general GAS write gate, no concurrent writers,
  no Hosting production deploy without explicit release approval.

The private repository is **NOT YET SAFE TO DELETE** while the cutover
and public deployment parity remain open. This file is architecture and
handoff documentation, not a deletion authorization.


## Audit update (2026-10-26): GitHub writer removal and private archive

The following actions were performed **after** the original checklist was written:

- Old bookshelf Firestore writer workflow deleted from `miyatayuuma/legacy-games` main. Previous private repository `miyatayuuma/yondene` main had **all four** obsolete workflows deleted: the v1/v2 writer dispatcher, v2 issue-intake workflow and two private-only CI workflows. Subsequent repository-tree inspection found **zero** workflows in that private main, and no bookshelf-writer workflow in the former legacy repository. Historic commits, credentials and GitHub Environment configuration were **not** purged and must not be presumed revoked. The legacy repo still has a non-writer command-validator workflow.
- Public PR #3 (generic GAS adapter, tests and docs) was merged into public main. Public PWA source is established in public main and the owner reports a successful PUBLIC-source-only Hosting deploy plus a live reading-state edit. The private Firestore→Sheets mirror later independently confirmed the edited book and an immutable app edit event.
- Private Google Sheets already archived the **68 current-main old-data files** and compared their complete text against fixed source Git blobs. The historical archive was expanded to **119 Issue/PR bodies, 83 PR metadata rows, 119 top-level issue comments, 34 inline PR review comments and 172 commit-message/index rows**. These records reside ONLY in the private Sheet and must never be published to GitHub. File bodies are still a historical archive, not the Firestore current value.
- **Known limits:** Git object trees and full per-commit snapshots, Actions logs/artifacts, external/removed attachments, some review metadata and GitHub repo settings are not reconstructed by the Sheet index. The owner must accept loss of anything outside the preserved data before final deletion; Sheet is mutable, not a disaster recovery backup.
- PUBLIC functional parity was checked against private PWA runtime files: the public version includes the approved reading-editor fix and privacy-safe anonymous shelf branding. Remaining private-only sources are historical docs and the obsolete writer setup script, not a required runtime dependency. Public CI PASS and device acceptance are distinct from authorization to enable any writer.

### Gates still open

1. **General GAS queue gate:** installed private Apps Script source/version, editor permissions, OAuth scopes, time triggers and `WRITE_ENABLED=false` must be checked on the live bound project. The owner has not approved the general writer. A limited production book patch and catalogue no-change are successful only in their scoped ranges; do not silently enable processing or multiple writers.
2. **Service credential cutover:** deleting workflow files stops the current GitHub execution route but does not revoke the old GitHub OIDC Workload Identity provider or service-account authorization. Review and revoke unused GitHub-origin credentials through authenticated Google Cloud admin controls before final disposal, without accidentally removing GAS's needed permissions.
3. **History disposition:** confirm that the preserved current-main file archive and Issue/PR/comment/commit indexes are sufficient; full Git DAG and past Actions evidence disappear on deletion. Then the owner must personally confirm and perform the irreversible private repository deletion. Do not interpret preliminary approval to migrate as authorization to delete.

**Status:** private repo files are no longer an active bookshelf write path, but **final deletion is not yet authorized** while the ordinary GAS write permissions and external Google Cloud identities are not independently verified.
