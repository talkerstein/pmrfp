"""Bound local catch-up work after the approved November 18 reader renewal.

The source accumulated ~97k receipts while access was expired. Keep one
consistent all-pending snapshot bounded to 125k; ACK transactions remain 500.
This limit is not permission to skip keys, bypass schema guards or truncate data.
"""
MAX_CAPTURE_RECEIPTS = 125_000
