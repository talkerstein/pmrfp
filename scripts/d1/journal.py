"""Offline reversible change journal between complete, validated snapshots.

Contains private before/after rows. No source writes, remote writes or CDC claim.
A journal is applicable only to the exact baseline, and changes are atomic.
"""
import argparse, contextlib, json, os
from pathlib import Path
import migrate as m
from schema import ident


def row_hash(rows):
    return m.digest(m.canonical({t: sorted(records.items()) for t, records in sorted(rows.items())}).encode())


def plan(before_path, after_path):
    catalog = m.load_catalog()
    before, _, before_sha = m.read_snapshot(before_path, catalog)
    after, _, after_sha = m.read_snapshot(after_path, catalog)
    changes = []
    for table in sorted(before):
        for key in sorted(before[table].keys() | after[table].keys()):
            old, new = before[table].get(key), after[table].get(key)
            if old != new:
                changes.append({'table': table, 'key': key, 'before': old, 'after': new})
    payload = {'version': 1, 'catalog_sha256': m.digest(m.CATALOG.read_bytes()),
               'schema_sha256': m.digest(m.SCHEMA.read_bytes()),
               'before_snapshot_sha256': before_sha, 'after_snapshot_sha256': after_sha,
               'before_rows_sha256': row_hash(before), 'after_rows_sha256': row_hash(after),
               'changes': changes}
    return {**payload, 'sha256': m.digest(m.canonical(payload).encode())}


def validate(journal):
    payload = {k: v for k, v in journal.items() if k != 'sha256'}
    if journal.get('version') != 1 or journal.get('sha256') != m.digest(m.canonical(payload).encode()):
        raise ValueError('Invalid journal checksum/version')
    if journal.get('catalog_sha256') != m.digest(m.CATALOG.read_bytes()) or journal.get('schema_sha256') != m.digest(m.SCHEMA.read_bytes()):
        raise ValueError('Incompatible journal schema/catalog')
    specs = m.table_specs(m.load_catalog())
    seen = set()
    for change in journal['changes']:
        table, key = change['table'], change['key']
        if table not in specs or (table, key) in seen:
            raise ValueError('Unknown table or duplicate journal key')
        seen.add((table, key))
        spec = specs[table]
        if change['before'] == change['after']:
            raise ValueError('Empty journal change')
        for row in [change['before'], change['after']]:
            if row is None:
                continue
            if set(row) != {c['column_name'] for c in spec['columns']}:
                raise ValueError('Journal column mismatch')
            if any(row[k] is None for k in spec['pk']) or m.canonical([row[k] for k in spec['pk']]) != key:
                raise ValueError('Journal key mismatch')
    return specs


def apply(journal, target, backup_path, reverse=False):
    specs = validate(journal)
    if not Path(target).is_file():
        raise ValueError('Journal requires an existing baseline')
    origin, destination = ('after', 'before') if reverse else ('before', 'after')
    with contextlib.closing(m.connect(target)) as db:
        # Reserve the writer before checking the baseline; no gap for another writer.
        db.execute('BEGIN IMMEDIATE')
        try:
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_migration_manifest'").fetchone():
                raise ValueError('Serving checkpoints are not supported by offline journal replay')
            actual = m.read_target(db, specs)
            if row_hash(actual) != journal[origin + '_rows_sha256']:
                raise ValueError('Journal baseline does not match target')
            expected = {t: dict(records) for t, records in actual.items()}
            for change in journal['changes']:
                table, key = change['table'], change['key']
                if actual[table].get(key) != change[origin]:
                    raise ValueError('Journal before-image mismatch')
                row = change[destination]
                if row is None:
                    expected[table].pop(key, None)
                else:
                    expected[table][key] = row
            if row_hash(expected) != journal[destination + '_rows_sha256']:
                raise ValueError('Journal destination checksum mismatch')
            # A second read connection captures the committed baseline while this
            # connection holds its reserved write lock. Never back up this active transaction.
            with contextlib.closing(m.connect('file:' + str(Path(target).resolve()) + '?mode=ro')) as baseline:
                m.backup(baseline, backup_path)
            db.execute('PRAGMA defer_foreign_keys=ON')
            for change in journal['changes']:
                if change[destination] is None:
                    spec = specs[change['table']]
                    db.execute('DELETE FROM ' + ident(change['table']) + ' WHERE ' + ' AND '.join(ident(k) + '=?' for k in spec['pk']), json.loads(change['key']))
            # Cascades can remove rows reparented in the source. Restore every
            # expected row absent/changed after deletions, not only journal entries.
            remaining = m.read_target(db, specs)
            for table, records in expected.items():
                spec = specs[table]
                columns = [c['column_name'] for c in spec['columns'] if c.get('is_generated', 'NEVER') == 'NEVER']
                updates = [k for k in columns if k not in spec['pk']]
                sql = 'INSERT INTO ' + ident(table) + ' (' + ','.join(map(ident, columns)) + ') VALUES (' + ','.join('?' for _ in columns) + ') ON CONFLICT (' + ','.join(map(ident, spec['pk'])) + ') ' + ('DO UPDATE SET ' + ','.join(ident(k) + '=excluded.' + ident(k) for k in updates) if updates else 'DO NOTHING')
                for key, row in records.items():
                    if remaining[table].get(key) != row:
                        db.execute(sql, [row[k] for k in columns])
            validation = m.check(db, expected, specs)
            db.commit()
            return {'changes': len(journal['changes']), 'reverse': reverse, 'tables': len(validation), 'rows_sha256': row_hash(expected), 'remote_writes': False, 'cutover_ready': False}
        except BaseException:
            db.rollback()
            raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('plan'); p.add_argument('before'); p.add_argument('after'); p.add_argument('output')
    p = sub.add_parser('apply-local'); p.add_argument('journal'); p.add_argument('target'); p.add_argument('--backup', required=True); p.add_argument('--reverse', action='store_true')
    args = parser.parse_args()
    if args.command == 'plan':
        journal = plan(args.before, args.after)
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out:
            out.write(m.canonical(journal) + '\n')
        print(json.dumps({'changes': len(journal['changes']), 'sha256': journal['sha256'], 'remote_writes': False}))
    else:
        journal = m.parse_json(Path(args.journal).read_text())
        print(json.dumps(apply(journal, args.target, args.backup, args.reverse)))


if __name__ == '__main__':
    main()
