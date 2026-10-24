# Stage I — backup recovery and single-writer handoff

Status: READ-ONLY AUDIT; CUTOVER BLOCKED (2026-10-25 JST).

## Evidence
- Private workflow separates `sync` gated by `YONDENE_SYNC_ENABLED` from scheduled encrypted `backup` gated by `YONDENE_BACKUP_ENABLED`. Do not disable the entire workflow when retiring the writer.
- Scheduled run 39681611233 dispatched backup run 39681625775. The encrypted artifact exists (33,349 bytes; expires 2026-10-29 06:51 JST). This is NOT proof of recovery.
- `scheduled-backup.emulator.mjs` verifies synthetic fixture decryption and restoration into an empty emulator, NOT recovery of the actual production artifact.
- `scheduled-backup-run.mjs` performs an encryption/decryption self-check for a newly generated archive; it does not independently test the archived production artifact.
- The documented key generation pipes `openssl rand -base64 32` into a GitHub Secret. Unless the key was saved independently, the owner cannot recover it from the GitHub settings UI. Do not rotate, print, or paste the key. A separately approved isolated Actions-side restore drill can use the existing Secret.
- Owner-reported GAS: one editor; only `yondeneSyncNow` trigger; latest queue dry-run pending=0, ready=0, review=0, writeEnabled=false. Pending family name restoration is a separate scoped update.

## Required sequence
1. Recheck private main, public Draft PR #3, writer flags and in-flight Actions runs. Verify no pending GitHub commands or v2 writes.
2. Verify production encrypted artifact can be decrypted and restored to an isolated emulator using the existing Secret without printing private data. No production restore.
3. Refresh Firestore-authoritative counts, marker IDs and fresh document CAS. The hourly Sheets mirror is non-atomic and not authoritative for CAS.
4. Approve a specific bounded business-command acceptance. Stop old writer via the effective `YONDENE_SYNC_ENABLED=false`, verify all runs drained, leave backup gate on.
5. Enable GAS only for that approved update; reconcile durable marker, document fields and Sheets status. Unknown commit outcome must be reconciled, never blindly retried with a new ID.
6. Restore the requested shelf name separately with exact before/after CAS, then approve queue trigger only after successful acceptance. Hosting switch is separate.
7. The owner's preference is eventual GitHub backup retirement, but mutable Sheets is not historical recovery. Decide acceptable loss or replacement versioned backup before removal.

No production configuration, Firestore data, GitHub variable, GAS trigger, or write gate was changed in Stage I.
