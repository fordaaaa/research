"""Wire-level XFF regression — spoofed XFF must not mint fresh buckets.

TestClient bypasses uvicorn's ProxyHeadersMiddleware, so unit tests cannot see
scope["client"] rewrites. This test boots the REAL shipped sidecar
(backend/desktop.py: uvicorn.Server over a real loopback socket) as a
subprocess and probes /api/auth/register over real HTTP with rotating
X-Forwarded-For values. Default config must key every request on the TCP peer
(127.0.0.1), so the 21st probe trips the 20/hour per-IP register throttle
(429 + Retry-After). If proxy headers ever get re-enabled at the serve layer,
each spoofed XFF mints a fresh bucket and the 21st probe returns 201 → FAIL.
"""
from __future__ import annotations

import os
import re
import select
import subprocess
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
READY_RE = re.compile(r"RESEARCH_READY\s+(http://127\.0\.0\.1:\d+)")
_STARTUP_TIMEOUT_SECONDS = 60.0
_HEALTH_TIMEOUT_SECONDS = 30.0
_REQUEST_TIMEOUT_SECONDS = 10.0
_TEARDOWN_TIMEOUT_SECONDS = 10.0
_REGISTER_LIMIT = 20


def _drain_in_background(proc: subprocess.Popen[str]) -> None:
    """Keep the merged stdout pipe drained so the child never blocks on it."""

    def _drain() -> None:
        try:
            assert proc.stdout is not None
            for _ in proc.stdout:
                pass
        except Exception:
            pass

    threading.Thread(target=_drain, daemon=True).start()


def _wait_for_ready(proc: subprocess.Popen[str]) -> str:
    """Read the RESEARCH_READY line with a deadline; fail if the child dies."""
    assert proc.stdout is not None
    fd = proc.stdout.fileno()
    buf = ""
    deadline = time.monotonic() + _STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f"sidecar exited early with code={proc.returncode}: {buf}")
        ready, _, _ = select.select([fd], [], [], max(0.0, deadline - time.monotonic()))
        if not ready:
            break
        chunk = os.read(fd, 65536).decode("utf-8", "replace")
        if not chunk:
            raise RuntimeError(f"sidecar stdout closed before READY: {buf}")
        buf += chunk
        match = READY_RE.search(buf)
        if match:
            return match.group(1)
    raise TimeoutError(f"sidecar did not print RESEARCH_READY in time: {buf!r}")


def _wait_for_health(base_url: str) -> None:
    deadline = time.monotonic() + _HEALTH_TIMEOUT_SECONDS
    last_error = ""
    while time.monotonic() < deadline:
        try:
            resp = httpx.get(f"{base_url}/api/health", timeout=_REQUEST_TIMEOUT_SECONDS)
            if resp.status_code == 200:
                return
            last_error = f"status={resp.status_code}"
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.2)
    raise TimeoutError(f"sidecar health check never passed: {last_error}")


@pytest.fixture()
def wire_base_url(tmp_path: Path) -> Iterator[str]:
    """Boot desktop.py as a subprocess; yield its base URL; always tear down."""
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("wire", encoding="utf-8")
    env = dict(os.environ)
    env["RESEARCH_DATA_DIR"] = str(tmp_path / "data")
    env["RESEARCH_WEB_DIR"] = str(web)
    for var in (
        "RESEARCH_TRUST_XFF",
        "RESEARCH_IGNORE_XFF",
        "RESEARCH_DESKTOP_TOKEN",
        "FORWARDED_ALLOW_IPS",
    ):
        env.pop(var, None)
    proc = subprocess.Popen(
        [sys.executable, "desktop.py"],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        base_url = _wait_for_ready(proc)
        _drain_in_background(proc)
        _wait_for_health(base_url)
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=_TEARDOWN_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=_TEARDOWN_TIMEOUT_SECONDS)


def test_r23_wire_spoofed_xff_shares_peer_ip_bucket(wire_base_url: str) -> None:
    """Rotating XFF from loopback must share one peer-IP register bucket."""
    with httpx.Client(base_url=wire_base_url, timeout=_REQUEST_TIMEOUT_SECONDS) as client:
        for i in range(_REGISTER_LIMIT):
            resp = client.post(
                "/api/auth/register",
                json={"email": f"wire{i}@example.com", "password": "password123"},
                headers={"X-Forwarded-For": f"203.0.113.{i + 1}"},
            )
            assert resp.status_code == 201, f"probe {i}: {resp.status_code} {resp.text}"
        spoofed = client.post(
            "/api/auth/register",
            json={"email": "wire-final@example.com", "password": "password123"},
            headers={"X-Forwarded-For": "198.51.100.99"},
        )
        assert spoofed.status_code == 429, f"spoofed XFF minted a fresh bucket: {spoofed.text}"
        assert "retry-after" in {k.lower() for k in spoofed.headers.keys()}
