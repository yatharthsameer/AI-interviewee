#!/usr/bin/env python3
"""
Clean up dangling HeyGen Interactive-Avatar sessions.

 • Lists every live session   (/v1/streaming.list)
 • Lets you stop selected IDs (/v1/streaming.stop)

Env:
  HEYGEN_API_KEY   access token
"""

from __future__ import annotations
import os, sys, json, argparse, requests, textwrap

API = os.getenv("HEYGEN_API_KEY")
BASE = "https://api.heygen.com"
HEAD = {"X-Api-Key": API, "Content-Type": "application/json"}

if not API:
    sys.exit("❌  HEYGEN_API_KEY environment variable not set.")


# ───────────────────────── helpers ──────────────────────────
def _normalize(entry):  # accept any payload shape
    if isinstance(entry, str):
        return {"id": entry, "status": "unknown"}
    if isinstance(entry, dict):
        sid = (
            entry.get("session_id")
            or entry.get("sessionId")
            or entry.get("id")
            or entry.get("sid")
        )
        st = (
            entry.get("connectionStatus")
            or entry.get("connection_status")
            or entry.get("status")
            or "unknown"
        )
        return {"id": sid, "status": st}
    return {"id": str(entry), "status": "unknown"}


def list_sessions() -> list[dict]:
    try:
        r = requests.get(f"{BASE}/v1/streaming.list", headers=HEAD, timeout=10)
        r.raise_for_status()
    except requests.RequestException as exc:
        sys.exit(f"❌  streaming.list failed – {exc}")

    raw = r.json().get("data", [])
    if isinstance(raw, dict):
        raw = [raw]
    return [_normalize(e) for e in raw if _normalize(e)["id"]]


def stop_session(sid: str):
    r = requests.post(
        f"{BASE}/v1/streaming.stop", headers=HEAD, json={"session_id": sid}, timeout=10
    )
    if r.status_code >= 400:
        print(f"  ⚠️  {sid} → {r.status_code} {r.text.strip()}")
    else:
        print(f"  ✅ stopped {sid}")


# ─────────────────────────── main ───────────────────────────
def main():
    ap = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=textwrap.dedent(__doc__),
    )
    ap.add_argument(
        "--all", action="store_true", help="stop every live session without a prompt"
    )
    args = ap.parse_args()

    sessions = list_sessions()
    if not sessions:
        print("No active HeyGen sessions.")
        return

    print(f"Live sessions ({len(sessions)}):")
    for i, s in enumerate(sessions, 1):
        print(f" {i}. {s['id']}  [{s['status']}]")

    if args.all:
        choice = list(range(1, len(sessions) + 1))
    else:
        sel = input("Stop which numbers? (comma or 'a' for all) ").strip().lower()
        if sel in ("a", "all", "*"):
            choice = list(range(1, len(sessions) + 1))
        else:
            choice = [int(x) for x in sel.split(",") if x.strip().isdigit()]

    for idx in choice:
        if 1 <= idx <= len(sessions):
            stop_session(sessions[idx - 1]["id"])


if __name__ == "__main__":
    main()
