#!/usr/bin/env python3
"""Benchmark shipready vs gitleaks vs trufflehog on a set of repos.

Usage: python3 scripts/benchmark.py <repo-dir> [<repo-dir> ...]

Requires shipready, gitleaks, and trufflehog on PATH. All three run in
working-tree (filesystem) mode for a like-for-like comparison. Secret
counts are file-level findings reported by each tool.
"""
import json
import os
import subprocess
import sys
import tempfile
import time


def timed(cmd):
    t0 = time.monotonic()
    r = subprocess.run(cmd, capture_output=True, text=True)
    return time.monotonic() - t0, r


def shipready_count(path):
    t, r = timed(["shipready", "check", path, "--json"])
    try:
        d = json.loads(r.stdout)
        n = sum(
            1
            for res in d["results"]
            if "ecret" in res["name"]
            for f in res["findings"]
            if f.get("file")
        )
    except (json.JSONDecodeError, KeyError):
        n = -1
    return t, n


def gitleaks_count(path):
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        report = tf.name
    t, _ = timed(
        ["gitleaks", "dir", path, "--no-banner", "--report-format", "json",
         "--report-path", report, "--exit-code", "0"]
    )
    try:
        with open(report) as f:
            n = len(json.load(f))
    except (OSError, json.JSONDecodeError):
        n = -1
    finally:
        os.unlink(report)
    return t, n


def trufflehog_count(path):
    t, r = timed(["trufflehog", "filesystem", path, "--no-update", "--json"])
    return t, r.stdout.count('"SourceMetadata"')


def main():
    repos = sys.argv[1:]
    if not repos:
        sys.exit(__doc__)
    totals = [0.0, 0.0, 0.0]
    print(f"{'repo':24s} {'shipready':>16s} {'gitleaks':>16s} {'trufflehog':>16s}")
    for repo in repos:
        name = os.path.basename(os.path.abspath(repo))
        st, sn = shipready_count(repo)
        gt, gn = gitleaks_count(repo)
        tt, tn = trufflehog_count(repo)
        totals[0] += st
        totals[1] += gt
        totals[2] += tt
        print(f"{name:24s} {st:8.2f}s / {sn:>3} {gt:8.2f}s / {gn:>3} {tt:8.2f}s / {tn:>3}")
    print(f"{'TOTAL':24s} {totals[0]:8.2f}s       {totals[1]:8.2f}s       {totals[2]:8.2f}s")


if __name__ == "__main__":
    main()
