"""Reconcile only the private November 26 production candidate to a verified local checkpoint.

The public VPS mirror, source database, and production authority markers are independent.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import json
import os
from pathlib import Path

import journal
import migrate
import remote
import remote_journal
import journal_payloads

CANDIDATE = ('03467304-6007-40f8-b5ff-e11e29553195', 'pmrfp-app-production-candidate-20261126')
AUTHORITY_OFF = "NOT EXISTS (SELECT 1 FROM _customer_app_authority)"


def candidate_rows(target, specs, expected):
    # Disjoint key ranges avoid hundreds of sequential, cursor-based trips on
    # the analytics tables. The first and last ranges include extra keys.
    ranges = remote.verification_ranges(specs, expected)
    groups = [ranges[start:start + 8] for start in range(0, len(ranges), 8)]

    def read(group):
        queries = []
        for table, lower, upper, _ in group:
            keys = ','.join(map(migrate.ident, specs[table]['pk']))
            filters, params = [], []
            for bound, operator in ((lower, '>'), (upper, '<=')):
                if bound is not None:
                    filters.append(f"({keys}){operator}(" + ','.join('?' for _ in bound) + ')')
                    params.extend(bound)
            where = ' WHERE ' + ' AND '.join(filters) if filters else ''
            queries.append({'sql': f'SELECT * FROM {migrate.ident(table)}{where} ORDER BY {keys} LIMIT 1001', 'params': params})
        pages = target.batch(queries)
        if len(pages) != len(group) or any(len(page['results']) >= 1001 for page in pages):
            raise RuntimeError('Candidate readback range exceeded its limit')
        return [(entry[0], page['results']) for entry, page in zip(group, pages)]

    actual = {table: {} for table in specs}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for pages in pool.map(read, groups):
            for table, rows in pages:
                for row in rows:
                    key = migrate.canonical([row[column] for column in specs[table]['pk']])
                    if key in actual[table]:
                        raise RuntimeError('Repeated primary key during candidate readback')
                    actual[table][key] = row
    return actual


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    state_file = Path.home() / '.codex/pmrfp-d1-refresh/current.json'
    checkpoint = json.loads(state_file.read_text())
    # Pin the catalog and schema used by the existing verified mirror.
    migrate.CATALOG = migrate.ROOT / 'd1/production-catalog-2026-11-05.json'
    migrate.SCHEMA = migrate.ROOT / 'd1/production-staging-copy-2026-11-05.sql'
    mirror_snapshot = Path(checkpoint['candidate'])
    if not mirror_snapshot.is_relative_to(state_file.parent):
        raise RuntimeError('Unexpected mirror checkpoint path')
    catalog = migrate.load_catalog()
    specs = migrate.table_specs(catalog)
    expected, _, digest = migrate.read_snapshot(mirror_snapshot, catalog)
    with closing(migrate.connect('file:' + checkpoint['backup'] + '?mode=ro')) as backup:
        if any(any(diff.values()) for diff in migrate.compare(expected, migrate.read_target(backup, specs)).values()):
            raise RuntimeError('Verified snapshot and verified backup differ')

    remote.TARGETS['production-candidate-private'] = CANDIDATE
    target = remote.Remote(wrangler_auth=True, generation='production-candidate-private')
    guard = "SELECT CASE WHEN " + AUTHORITY_OFF + " THEN 1 ELSE json('candidate_has_production_authority') END"
    target.query(guard)
    has_manifest = target.query("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='_migration_manifest'")[0]['results']
    prior = remote.manifest(target) if has_manifest else []
    if prior and (len(prior) != 1 or prior[0]['state'] != 'validated'):
        raise RuntimeError('Candidate manifest is not a validated baseline')
    actual = candidate_rows(target, specs, expected)
    drift = {name: diff for name, diff in migrate.compare(expected, actual).items() if any(diff.values())}
    print(json.dumps({'rows': sum(map(len, expected.values())), 'tablesCompared': len(specs), 'differences': drift}), flush=True)
    if not args.apply or not drift:
        return

    changes = [
        {'table': table, 'key': key, 'before': actual[table].get(key), 'after': expected[table].get(key)}
        for table in sorted(drift)
        for key in sorted(actual[table].keys() | expected[table].keys())
        if actual[table].get(key) != expected[table].get(key)
    ]
    baseline = prior[0]['source_sha256'] if prior else journal.row_hash(actual)
    plan = {'before_snapshot_sha256': baseline, 'after_snapshot_sha256': digest,
            'changes': changes}
    if has_manifest and remote.manifest(target) != prior:
        raise RuntimeError('Candidate checkpoint changed during calculation')
    batch = remote_journal.statements(plan, actual, expected, specs, atomic_publish=True)
    setup = [{'sql': guard, 'params': []}]
    if not prior:
        setup.extend([
            {'sql': 'CREATE TABLE IF NOT EXISTS _migration_manifest (id INTEGER PRIMARY KEY CHECK(id=1),source_sha256 TEXT NOT NULL,state TEXT NOT NULL)', 'params': []},
            {'sql': "INSERT INTO _migration_manifest VALUES (1,?,'validated')", 'params': [baseline]},
        ])
    batch[1:1] = setup
    if len(batch) > 500 or journal_payloads.needed(batch):
        raise RuntimeError('Candidate reconciliation exceeds the single transaction bound')
    target.batch(batch)
    verified = candidate_rows(target, specs, expected)
    if any(any(diff.values()) for diff in migrate.compare(expected, verified).values()):
        raise RuntimeError('Candidate readback differs after reconciliation')
    if target.query('PRAGMA foreign_key_check')[0]['results']:
        raise RuntimeError('Candidate has foreign key violations')
    target.query(guard)
    print(json.dumps({'reconciled': len(changes), 'verifiedRows': sum(map(len, expected.values())),
                      'productionAuthority': False}), flush=True)


if __name__ == '__main__':
    main()
