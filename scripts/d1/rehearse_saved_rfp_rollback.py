"""Replay a complete saved-list journal into a frozen local SQLite copy.

This models rollback from the new writer to the previous writer. It never
connects to PostgreSQL or changes a deployed database.
"""
import json
import sqlite3

COLUMNS = ('id', 'user_id', 'organization_id', 'rfp_id', 'created_at')
PROJECTION = ','.join(COLUMNS)


def parse(raw):
    if raw is None:
        return None
    row = json.loads(raw)
    if not isinstance(row, dict) or set(row) != set(COLUMNS) or any(
        not isinstance(row[k], str) and not (k == 'organization_id' and row[k] is None)
        for k in COLUMNS
    ):
        raise ValueError('Invalid saved-list journal row')
    return tuple(row[k] for k in COLUMNS)


def replay(frozen, entries, expected_count):
    """Apply exactly once from sequence one, fail atomically on drift or a gap."""
    if frozen.in_transaction:
        raise ValueError('Expected a clean frozen rehearsal connection')
    if frozen.execute('PRAGMA foreign_keys').fetchone() != (1,):
        raise ValueError('Foreign key enforcement is required')
    frozen.execute('BEGIN IMMEDIATE')
    try:
        count = 0
        for sequence, before_json, after_json in entries:
            count += 1
            if sequence != count or count > expected_count:
                raise ValueError('Unexpected saved-list journal sequence')
            before, after = parse(before_json), parse(after_json)
            if before == after:
                raise ValueError('Empty saved-list journal change')
            old_id = (before or after)[0]
            current = frozen.execute(
                f'SELECT {PROJECTION} FROM saved_rfps WHERE id=?', (old_id,)
            ).fetchone()
            if current != before:
                raise ValueError('Frozen saved-list row differs from journal baseline')
            if before is None:
                frozen.execute(f'INSERT INTO saved_rfps ({PROJECTION}) VALUES (?,?,?,?,?)', after)
            elif after is None:
                frozen.execute('DELETE FROM saved_rfps WHERE id=?', (old_id,))
            else:
                frozen.execute(
                    'UPDATE saved_rfps SET id=?,user_id=?,organization_id=?,rfp_id=?,created_at=? WHERE id=?',
                    (*after, old_id),
                )
        if count != expected_count:
            raise ValueError('Incomplete saved-list journal')
        frozen.commit()
        return count
    except sqlite3.IntegrityError:
        frozen.rollback()
        raise ValueError('Saved-list replay violates a target constraint') from None
    except BaseException:
        frozen.rollback()
        raise
