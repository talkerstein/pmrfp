"""Atomic, resumable remote journal rehearsal. Synthetic canary database ONLY.

Copied datasets and production are deliberately excluded. No arbitrary remote SQL
interface is exposed. Full snapshots/readbacks remain the verification authority.
"""
import contextlib
import migrate as m
import journal as j
import remote as r

CANARY_NAME = 'pmrfp-journal-canary-20261023'


def statements(journal, before, after, specs):
    """Simulate cascades locally, then emit only necessary bound mutations."""
    batch = [{'sql': 'PRAGMA defer_foreign_keys=ON', 'params': []}]
    guard = "SELECT CASE WHEN (SELECT source_sha256=? AND state='validated' FROM _migration_manifest WHERE id=1) THEN 1 ELSE json('journal_checkpoint_mismatch') END"
    batch.append({'sql': guard, 'params': [journal['before_snapshot_sha256']]})
    for change in journal['changes']:
        table, row = change['table'], change['before']
        columns = list(row) if row is not None else specs[table]['pk']
        values = [row[k] for k in columns] if row is not None else m.parse_json(change['key'])
        predicate = ' AND '.join(m.ident(k) + ' IS ?' for k in columns)
        exists = 'EXISTS (SELECT 1 FROM ' + m.ident(table) + ' WHERE ' + predicate + ')'
        batch.append({'sql': "SELECT CASE WHEN " + (exists if row is not None else 'NOT ' + exists) + " THEN 1 ELSE json('journal_before_image_mismatch') END", 'params': values})
    with contextlib.closing(m.connect(':memory:')) as db:
        db.executescript(m.SCHEMA.read_text());db.execute('BEGIN');db.execute('PRAGMA defer_foreign_keys=ON')
        for table, records in before.items():
            columns = [c['column_name'] for c in specs[table]['columns'] if c.get('is_generated', 'NEVER') == 'NEVER']
            sql = 'INSERT INTO ' + m.ident(table) + ' (' + ','.join(map(m.ident, columns)) + ') VALUES (' + ','.join('?' for _ in columns) + ')'
            for row in records.values():db.execute(sql, [row[k] for k in columns])
        m.check(db, before, specs)
        for change in journal['changes']:
            if change['after'] is None:
                spec = specs[change['table']]
                sql = 'DELETE FROM ' + m.ident(change['table']) + ' WHERE ' + ' AND '.join(m.ident(k) + '=?' for k in spec['pk'])
                params = m.parse_json(change['key']);db.execute(sql, params);batch.append({'sql': sql, 'params': params})
        remaining = m.read_target(db, specs)
        for table, records in after.items():
            spec = specs[table]
            columns = [c['column_name'] for c in spec['columns'] if c.get('is_generated', 'NEVER') == 'NEVER']
            updates = [k for k in columns if k not in spec['pk']]
            sql = 'INSERT INTO ' + m.ident(table) + ' (' + ','.join(map(m.ident, columns)) + ') VALUES (' + ','.join('?' for _ in columns) + ') ON CONFLICT (' + ','.join(map(m.ident, spec['pk'])) + ') ' + ('DO UPDATE SET ' + ','.join(m.ident(k) + '=excluded.' + m.ident(k) for k in updates) if updates else 'DO NOTHING')
            for key, row in records.items():
                if remaining[table].get(key) != row:
                    params = [row[k] for k in columns];db.execute(sql, params);batch.append({'sql': sql, 'params': params})
        m.check(db, after, specs)
    batch.append({'sql': "UPDATE _migration_manifest SET source_sha256=?,state='loading' WHERE id=1", 'params': [journal['after_snapshot_sha256']]})
    if any(len(item['params']) > 100 or len(item['sql'].encode()) > 100000 for item in batch):raise ValueError('Journal exceeds bounded D1 statement limits')
    if len(batch) > 500:raise ValueError('Canary journal exceeds atomic batch bound')
    if any(isinstance(v, int) and abs(v) > 2**53 - 1 for item in batch for v in item['params']):raise ValueError('Unsafe integer for remote JSON API')
    return batch


def apply(remote, before_path, after_path, journal, backup_path, reverse=False):
    # Enforce isolation before reads, backups or writes; no serving generation accepted.
    if remote.name != CANARY_NAME:raise ValueError('Remote journal is restricted to the synthetic canary')
    specs = j.validate(journal)
    expected = j.plan(before_path, after_path)
    if journal != expected:raise ValueError('Journal does not match supplied snapshots')
    catalog = m.load_catalog()
    before, before_meta, before_sha = m.read_snapshot(before_path, catalog)
    after, after_meta, after_sha = m.read_snapshot(after_path, catalog)
    if before_meta.get('source') != 'synthetic-test' or after_meta.get('source') != 'synthetic-test':raise ValueError('Only synthetic source snapshots are permitted')
    if reverse:
        before, after = after, before;before_path, after_path = after_path, before_path;before_sha, after_sha = after_sha, before_sha
        journal = {**journal, 'before_snapshot_sha256': before_sha, 'after_snapshot_sha256': after_sha,
                   'changes': [{**c, 'before': c['after'], 'after': c['before']} for c in journal['changes']]}
    if before_sha == after_sha:
        result = r.verify(remote, before_path)
        return {**result, 'recovered': False, 'reverse': reverse, 'changed_records': 0, 'noop': True}
    manifest = r.manifest(remote)
    if manifest and manifest[0]['source_sha256'] == after_sha and manifest[0]['state'] in ('loading', 'validated') and before_sha != after_sha:
        # An earlier response may have been lost after atomic commit, or after verification.
        result = r.finalize(remote, after_path)
        return {**result, 'recovered': True, 'reverse': reverse, 'changed_records': len(journal['changes'])}
    if manifest != [{'source_sha256': before_sha, 'state': 'validated'}]:raise ValueError('Unexpected canary baseline checkpoint')
    batch = statements(journal, before, after, specs)
    r.verify(remote, before_path, backup_path=backup_path)
    # The entire list is one D1 transaction. A failure rolls back every mutation;
    # an uncertain response is settled from the destination manifest on retry.
    remote.batch(batch)
    result = r.finalize(remote, after_path)
    return {**result, 'recovered': False, 'reverse': reverse, 'changed_records': len(journal['changes']), 'batch_statements': len(batch)}
