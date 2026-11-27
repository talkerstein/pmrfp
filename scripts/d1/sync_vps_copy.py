"""Run one resumable refresh of the D1 copy used by the VPS.

Run from the migration operator's machine with the existing verified source
connection and Wrangler authorization. Keep the state directory off the VPS.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
from time import time_ns

import consume_incremental as consumer
import incremental_capture as capture
import inspect_sync
import remote


def recover(target, state, current, previous, pending, *, atomic_publish=False):
    run = pending / "run"
    receipt = pending / "commit.json"
    if not receipt.exists():
        report = consumer.commit(target, run, atomic_publish=atomic_publish)
        consumer.write_report(receipt, report)
    report = json.loads(consumer.private_file(receipt).read_text())
    candidate = report["acknowledgement"]["dataset"]
    health = inspect_sync.inspect(target)
    if not health["readyForCapture"] or health["nativeCandidate"] != candidate:
        raise RuntimeError("Completed run does not match the verified remote checkpoint")
    next_state = dict(
        source=str(pending / "source.jsonl"),
        candidate=str(run / "candidate.jsonl"),
        backup=str(run / "native-after.sqlite"),
        current=pending.name,
        previous=current,
    )
    temporary = state / "current.json.new"
    temporary.unlink(missing_ok=True)
    consumer.write_report(temporary, next_state)
    temporary.replace(state / "current.json")
    if previous and previous not in (current, pending.name):
        if previous.startswith("cycle-") and previous[6:].isdigit():
            # Only remove an older completed cycle in this private state directory.
            old = state / previous
            if old.is_dir() and (old / "commit.json").is_file():
                shutil.rmtree(old)
    consumer.emit("synced", pendingReceipts=health["pendingReceipts"], **report["acknowledgement"])


def refresh(state, target, *, atomic_publish=False):
    pointer = json.loads(consumer.private_file(state / "current.json").read_text())
    current = pointer.get("current")
    previous = pointer.get("previous")
    pending = [
        path for path in state.glob("cycle-*")
        if path.name not in {current, previous}
        and path.name[6:].isdigit()
        and (path / "run/prepared.json").is_file()
        and (current is None or path.name > current)
    ]
    if len(pending) > 1:
        raise RuntimeError("Multiple prepared cycles require operator review")
    if pending:
        return recover(target, state, current, previous, consumer.private_dir(pending[0]), atomic_publish=atomic_publish)

    health = inspect_sync.inspect(target)
    if not health["readyForCapture"]:
        raise RuntimeError("Source and D1 checkpoint need review: " + health["reason"])
    if not health["pendingReceipts"]:
        return consumer.emit("up-to-date", pendingReceipts=0)

    consumer.emit("capture-ready", pendingReceipts=health["pendingReceipts"])
    directory = state / f"cycle-{time_ns():020}"
    directory.mkdir(mode=0o700)
    try:
        capture.export(target, pointer["source"], pointer["candidate"],
                       directory / "source.jsonl", directory / "delta.jsonl")
        consumer.prepare(directory / "source.jsonl", pointer["candidate"],
                         pointer["backup"], directory / "run", atomic_publish=atomic_publish)
    except BaseException:
        # Until prepare returns, this cycle has not called the remote writer.
        shutil.rmtree(directory)
        raise
    recover(target, state, current, previous, directory, atomic_publish=atomic_publish)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--atomic-publish", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    state = consumer.private_dir(args.state.resolve())
    lock_directory = consumer.private_dir(consumer.m.ROOT / ".d1-private")
    fd = os.open(lock_directory / "incremental-consumer.lock",
                 os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            consumer.emit("already-running")
            return
        refresh(state, remote.Remote(wrangler_auth=True, generation=consumer.GENERATION),
                atomic_publish=args.atomic_publish)


if __name__ == "__main__":
    main()
