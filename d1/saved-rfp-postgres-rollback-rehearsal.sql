-- Rehearsal only, on a disposable local database of this exact name.
-- Caller stages the complete captured journal and expected final state in
-- temporary tables, then invokes this function in the same session.
DO $$
BEGIN
  IF current_database() <> 'pmrfp_rollback_rehearsal' THEN
    RAISE EXCEPTION 'Not the disposable rollback database';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.replay_saved_rfps(expected_count bigint)
RETURNS bigint LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  entry record;
  prior public.saved_rfps%ROWTYPE;
  next_row public.saved_rfps%ROWTYPE;
  current_row public.saved_rfps%ROWTYPE;
  processed bigint := 0;
  key_id uuid;
BEGIN
  IF current_database() <> 'pmrfp_rollback_rehearsal' OR expected_count IS NULL OR expected_count < 0 THEN
    RAISE EXCEPTION 'Invalid rehearsal target or count';
  END IF;
  LOCK TABLE public.saved_rfps IN ACCESS EXCLUSIVE MODE;
  FOR entry IN SELECT * FROM pg_temp.saved_rfp_rehearsal_events ORDER BY sequence LOOP
    processed := processed + 1;
    IF entry.sequence IS DISTINCT FROM processed OR processed > expected_count
      OR entry.before_row IS NOT DISTINCT FROM entry.after_row THEN
      RAISE EXCEPTION 'Unexpected saved-list event';
    END IF;
    prior := jsonb_populate_record(NULL::public.saved_rfps, entry.before_row);
    next_row := jsonb_populate_record(NULL::public.saved_rfps, entry.after_row);
    key_id := COALESCE(prior.id, next_row.id);
    IF key_id IS NULL OR (entry.before_row IS NOT NULL AND prior.id IS NULL)
      OR (entry.after_row IS NOT NULL AND next_row.id IS NULL) THEN
      RAISE EXCEPTION 'Missing saved-list key';
    END IF;
    SELECT * INTO current_row FROM public.saved_rfps WHERE id = key_id;
    IF (entry.before_row IS NULL AND FOUND)
      OR (entry.before_row IS NOT NULL AND (NOT FOUND OR current_row IS DISTINCT FROM prior)) THEN
      RAISE EXCEPTION 'Frozen saved-list row differs from journal baseline';
    END IF;
    IF entry.before_row IS NULL THEN
      INSERT INTO public.saved_rfps VALUES (next_row.*);
    ELSIF entry.after_row IS NULL THEN
      DELETE FROM public.saved_rfps WHERE id = key_id;
    ELSE
      UPDATE public.saved_rfps SET (id,user_id,organization_id,rfp_id,created_at) =
        (next_row.id,next_row.user_id,next_row.organization_id,next_row.rfp_id,next_row.created_at)
        WHERE id = key_id;
    END IF;
  END LOOP;
  IF processed <> expected_count THEN RAISE EXCEPTION 'Incomplete saved-list journal'; END IF;
  IF EXISTS (
    (SELECT * FROM public.saved_rfps EXCEPT ALL SELECT * FROM pg_temp.saved_rfp_rehearsal_expected)
    UNION ALL
    (SELECT * FROM pg_temp.saved_rfp_rehearsal_expected EXCEPT ALL SELECT * FROM public.saved_rfps)
  ) THEN
    RAISE EXCEPTION 'Saved-list rows do not match the frozen D1 readback';
  END IF;
  RETURN processed;
END $$;
