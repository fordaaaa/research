"""Client-IP resolution: X-Forwarded-For is honored only from a loopback TCP
peer AND only with explicit opt-in (RESEARCH_TRUST_XFF=1, RESEARCH_IGNORE_XFF!=1).

Trust model: XFF is a spoofable client-controlled header. By default it is
ignored and the TCP peer IP is used. With the opt-in, the leftmost entry is
honored only when the TCP peer (request.client.host) is loopback
(127.0.0.1 / ::1) — covering the trusted same-host proxy pattern. Any other
peer IP is used directly.
"""
from __future__ import annotations


def _fake_request(peer_host: str | None, xff: str | None = None):
    from api.auth import _client_ip  # noqa: F401  (import here for clarity)

    class FakeClient:
        host = peer_host

    class FakeRequest:
        client = FakeClient() if peer_host is not None else None
        headers = {"x-forwarded-for": xff} if xff is not None else {}

    return FakeRequest()


def test_spoofed_xff_from_non_loopback_peer_is_ignored(monkeypatch):
    monkeypatch.delenv("RESEARCH_TRUST_XFF", raising=False)
    monkeypatch.delenv("RESEARCH_IGNORE_XFF", raising=False)
    from api.auth import _client_ip

    req = _fake_request("192.168.1.50", "9.9.9.9")
    assert _client_ip(req) == "192.168.1.50"  # type: ignore[arg-type]


def test_spoofed_xff_chain_from_non_loopback_peer_is_ignored(monkeypatch):
    monkeypatch.delenv("RESEARCH_TRUST_XFF", raising=False)
    monkeypatch.delenv("RESEARCH_IGNORE_XFF", raising=False)
    from api.auth import _client_ip

    req = _fake_request("203.0.113.5", "9.9.9.9, 70.41.3.18")
    assert _client_ip(req) == "203.0.113.5"  # type: ignore[arg-type]


def test_xff_from_loopback_peer_is_honored(monkeypatch):
    monkeypatch.setenv("RESEARCH_TRUST_XFF", "1")
    monkeypatch.delenv("RESEARCH_IGNORE_XFF", raising=False)
    from api.auth import _client_ip

    req = _fake_request("127.0.0.1", "203.0.113.7, 70.41.3.18, 10.0.0.1")
    assert _client_ip(req) == "203.0.113.7"  # type: ignore[arg-type]


def test_xff_from_ipv6_loopback_peer_is_honored(monkeypatch):
    monkeypatch.setenv("RESEARCH_TRUST_XFF", "1")
    monkeypatch.delenv("RESEARCH_IGNORE_XFF", raising=False)
    from api.auth import _client_ip

    req = _fake_request("::1", "203.0.113.7")
    assert _client_ip(req) == "203.0.113.7"  # type: ignore[arg-type]


def test_default_ignores_xff_from_loopback_peer(monkeypatch):
    """New default: spoofed XFF from loopback is ignored without the flag."""
    monkeypatch.delenv("RESEARCH_TRUST_XFF", raising=False)
    monkeypatch.delenv("RESEARCH_IGNORE_XFF", raising=False)
    from api.auth import _client_ip

    req = _fake_request("127.0.0.1", "203.0.113.7")
    assert _client_ip(req) == "127.0.0.1"  # type: ignore[arg-type]


def test_no_header_uses_peer_as_before(monkeypatch):
    monkeypatch.delenv("RESEARCH_TRUST_XFF", raising=False)
    monkeypatch.delenv("RESEARCH_IGNORE_XFF", raising=False)
    from api.auth import _client_ip

    assert _client_ip(_fake_request("192.168.1.50")) == "192.168.1.50"  # type: ignore[arg-type]
    assert _client_ip(_fake_request("127.0.0.1")) == "127.0.0.1"  # type: ignore[arg-type]
    assert _client_ip(None) == "unknown"
