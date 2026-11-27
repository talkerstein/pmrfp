"""Seed hash-only unsubscribe proofs in the inactive VPS candidate."""
import argparse
import json
import re
import shlex
import subprocess
from pathlib import Path

from remote import ACCOUNT, Remote

DATABASE = "03467304-6007-40f8-b5ff-e11e29553195"
MARKER = "SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM _customer_app_authority) THEN 1 ELSE json('candidate_is_serving') END"
UUID = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")
DIGEST = re.compile(r"[0-9a-f]{64}")
SIGN = """
const fs = require('node:fs');
const {createHmac, createHash} = require('node:crypto');
const key = process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) process.exit(2);
const {ids, scope} = JSON.parse(fs.readFileSync(0, 'utf8'));
const prefix = {opportunity: 'unsub:', lifecycle: 'lifecycle-unsub:', contract: 'contract-unsub:'}[scope];
if (!prefix) process.exit(2);
const result = ids.map(id => {
  const token = createHmac('sha256', key).update(prefix + id).digest('base64url');
  return [id, createHash('sha256').update(token).digest('hex')];
});
process.stdout.write(JSON.stringify(result));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scope", choices=("opportunity", "lifecycle", "contract"), default="opportunity")
    scope = parser.parse_args().scope
    table = f"_legacy_{scope}_unsubscribe"
    remote = object.__new__(Remote)
    remote.token = Remote.read_wrangler_token()
    remote.wrangler_auth = True
    remote.url = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/d1/database/{DATABASE}"
    identity = remote.request("GET", "")["result"]
    if identity["name"] != "pmrfp-app-production-candidate-20261126":
        raise RuntimeError("Unexpected PMRFP candidate")
    remote.query(MARKER)
    ids = []
    while True:
        result = remote.query(
            "SELECT id FROM users_profile WHERE id>? AND lower(email) NOT LIKE '%@example.invalid' ORDER BY id LIMIT 500",
            [ids[-1] if ids else ""],
        )[0]["results"]
        ids.extend(row["id"] for row in result)
        if len(result) < 500:
            break
    if not ids or any(not UUID.fullmatch(i) for i in ids):
        raise RuntimeError("Unexpected PMRFP profiles")
    output = subprocess.run(
        ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "IdentitiesOnly=yes",
         "-i", str(Path.home() / ".ssh/codex_hostinger_proposals"), "root@76.13.26.88",
         "docker exec -i pmrfp-canonical-d1-pmrfp-canonical-app-r2-1 node -e " + shlex.quote(SIGN)],
        input=json.dumps({"ids": ids, "scope": scope}), text=True, capture_output=True, timeout=20, check=False,
    )
    if output.returncode:
        raise RuntimeError("Legacy signing process unavailable")
    pairs = json.loads(output.stdout)
    if [pair[0] for pair in pairs] != ids or any(not DIGEST.fullmatch(pair[1]) for pair in pairs):
        raise RuntimeError("Invalid legacy proof set")
    schema = (Path(__file__).resolve().parents[2] / f"deploy/vps/legacy-{scope}-unsubscribe.sql").read_text().strip().rstrip(";")
    remote.batch([{"sql": MARKER, "params": []}, {"sql": schema, "params": []}])
    for offset in range(0, len(pairs), 100):
        remote.batch([
            {"sql": MARKER, "params": []},
            {"sql": f"""INSERT OR IGNORE INTO {table}(user_id,token_sha256)
              SELECT json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]')
              FROM json_each(?) j JOIN users_profile u ON u.id=json_extract(j.value,'$[0]')""",
             "params": [json.dumps(pairs[offset:offset+100], separators=(",", ":"))]},
        ])
    for offset in range(0, len(pairs), 100):
        result = remote.query(f"""SELECT count(*) AS n FROM json_each(?) j
           JOIN {table} p ON p.user_id=json_extract(j.value,'$[0]')
              AND p.token_sha256=json_extract(j.value,'$[1]')""",
            [json.dumps(pairs[offset:offset+100], separators=(",", ":"))])[0]["results"]
        if result != [{"n": len(pairs[offset:offset+100])}]:
            raise RuntimeError("Legacy proof readback mismatch")
    print(f"Verified {len(pairs)} historical {scope} unsubscribe proofs in the D1 candidate")


if __name__ == "__main__":
    main()
