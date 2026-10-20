#!/usr/bin/env python3
"""Put back data files whose only change is the «generated» date.

Every fetch script writes the day it ran into «generated». The data job runs
weekly, so without this each run would make a commit even when SSB, Nav and
Brreg have nothing new. A file whose content is the same as in the last commit,
apart from «generated», is restored from git, so the page keeps showing the
date the numbers last changed.

Only the standard library is used.

    python scripts/keep_unchanged.py site/data/*.json
"""
from __future__ import annotations

import json
import subprocess
import sys


def without_generated(text: str):
    data = json.loads(text)
    if isinstance(data, dict):
        data.pop("generated", None)
    return data


def main(paths: list[str]) -> None:
    for path in paths:
        old = subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True, text=True)
        if old.returncode != 0:
            continue  # new file
        with open(path, encoding="utf-8") as f:
            new = f.read()
        if new == old.stdout:
            continue
        if without_generated(new) == without_generated(old.stdout):
            subprocess.run(["git", "checkout", "HEAD", "--", path], check=True)
            print(f"{path}: bare datoen er endret, beholder forrige versjon")
        else:
            print(f"{path}: nye tall")


if __name__ == "__main__":
    main(sys.argv[1:])
