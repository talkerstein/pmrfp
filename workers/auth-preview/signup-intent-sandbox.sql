-- Optional local synthetic signup rehearsal. Apply only to the isolated Auth fixture.
ALTER TABLE "user" ADD COLUMN signupIntent TEXT CHECK (signupIntent IS NULL OR json_valid(signupIntent));
