# Guarded incremental rehearsal

Use the current acknowledged baseline and the existing owner-only reader credentials. The runner targets only `pmrfp-rebuilt-staging-20261106`, the copied preview. It does not run a scheduler or write Source application tables. Do not run another manual consumer in parallel.

1. Run `scripts/d1/inspect_sync.py --wrangler-auth` with the existing pinned Source reader environment. It reports backlog, oldest pending event, reader expiry, and whether the Source receipt history and D1 checkpoint agree. This is a read-only health check, not a complete comparison of application rows.
2. Use `scripts/d1/incremental_capture.py --generation rebuilt-20261106 --wrangler-auth` with the current base Source/candidate snapshots and **new** output paths. Keep the catalog, schema and Auth ID-only view environment from the current audited run. It validates the native baseline and then reads pending Source keys in one read-only transaction.
3. Prepare the capture locally:

   ```sh
   python3 scripts/d1/consume_incremental.py prepare \
     --source-snapshot "$CAPTURE" --base-candidate "$BASE_CANDIDATE" \
     --baseline-backup "$BASE_NATIVE_BACKUP" --run-dir "$NEW_PRIVATE_RUN_DIR"
   ```

   This rebuilds only the approved groups and performs exact forward, reverse and reapply rehearsals from the verified native backup. The private run directory records the candidate and its input digests. Local preparation never acknowledges events.
4. Commit the exact prepared run:

   ```sh
   python3 scripts/d1/consume_incremental.py commit \
     --run-dir "$NEW_PRIVATE_RUN_DIR" --wrangler-auth
   ```

   The command takes the local consumer lock and rechecks the durable checkpoint and Source receipt history before replay. The native batch retains its before-image guards and atomicity. It creates real native before/after backups, validates their restored copies, and only then invokes the guarded acknowledgement. Acknowledgement independently verifies native content and the retained receipt set. No unrelated or later Source events are acknowledged.
5. Check the resulting aggregate report and run the health check again. Advance the local baseline to this run's Source and candidate snapshots only after the durable checkpoint matches. Run the public parity checks against the new candidate. The application selection and production traffic remain unchanged.

If commit is interrupted, resume the **same** run directory. Existing backups are validated and never overwritten. The native manifest and receipt history resolve an uncertain replay or acknowledgement of this exact capture. If an existing artifact is corrupt or the history has diverged, stop and review the specific artifact and checkpoint before attempting another capture. A Source write freeze and production cutover require separate preparation and approval.
