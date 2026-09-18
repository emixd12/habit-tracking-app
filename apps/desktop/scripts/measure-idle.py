#!/usr/bin/env python3
"""Measure a running macOS app and its launchctl-owned WebKit processes."""
import argparse
import json
from pathlib import Path
import re
import statistics
import subprocess
import time


def parse_rows(output, pids):
    rows = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) >= 6 and fields[0] in pids:
            rows.append({"pid": fields[0], "cpu_percent": float(fields[2]),
                         "footprint": fields[3], "cpu_time": fields[4], "threads": fields[5]})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--state", required=True, help="Observed window/workload state")
    parser.add_argument("--seconds", type=int, default=120)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.pid <= 0 or not 10 <= args.seconds <= 3600:
        parser.error("Use a positive PID and a duration from 10 to 3600 seconds.")
    owner = subprocess.check_output(["launchctl", "print", f"pid/{args.pid}"], text=True)
    origin = re.search(r"^\s*originator = (.+)$", owner, re.M)
    if not origin or Path(origin[1]).resolve() != args.app.resolve():
        parser.error("launchctl did not verify the requested app as this process's owner.")
    pids = [str(args.pid)] + re.findall(r"^\s*(\d+)\s+\S+\s+com\.apple\.WebKit\.(?:WebContent|GPU|Networking)\.", owner, re.M)
    pids = list(dict.fromkeys(pid for pid in pids if pid != "0"))
    if len(pids) < 2:
        parser.error("No owned WebKit process found; wait for the app to finish launching.")
    command = ["top", "-l", str(args.seconds // 2 + 1), "-s", "2", "-stats", "pid,command,cpu,mem,time,threads"]
    for pid in pids:
        command += ["-pid", pid]
    started = time.time()
    output = subprocess.check_output(command, text=True)
    samples = parse_rows(output, pids)
    summary = {}
    for pid in pids:
        # top's first sample has no preceding measurement interval.
        process = [row for row in samples if row["pid"] == pid][1:]
        if len(process) != args.seconds // 2:
            raise RuntimeError(f"Process {pid} exited or sampling was incomplete; comparison rejected.")
        cpu = [row["cpu_percent"] for row in process]
        summary[pid] = {"intervals": len(cpu), "cpu_mean": statistics.mean(cpu),
                        "cpu_median": statistics.median(cpu), "cpu_max": max(cpu),
                        "first_footprint": process[0]["footprint"], "last_footprint": process[-1]["footprint"]}
    result = {"app": str(args.app), "state": args.state, "started_unix": started,
              "elapsed_seconds": time.time() - started, "summary": summary, "samples": samples}
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"elapsed_seconds": result["elapsed_seconds"], "summary": summary}, indent=2))


if __name__ == "__main__":
    # Keep the parser check local; no app process or UI is needed to run it.
    assert parse_rows("123 WebKit 0.2 24M+ 00:01.00 4\n999 other 90 1G 00:01 1", ["123"]) == [
        {"pid": "123", "cpu_percent": 0.2, "footprint": "24M+", "cpu_time": "00:01.00", "threads": "4"}]
    main()
