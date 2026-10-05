from datetime import datetime, timedelta, timezone
from unittest.mock import Mock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import masters

NOW = datetime(2026, 10, 5, 12, tzinfo=timezone.utc)


def profile(fide_id, rating=2800, rank=1, inactive=False):
    return f'''<script>9999 STANDARD</script><p>{rating}</p><p>STANDARD
    {"<span>inactive</span>" if inactive else ""}</p><h5>FIDE ID</h5><p>{fide_id}</p>
    <h5>World Rank</h5><h6>Active players</h6><p>{rank}</p>
    <h6>All players</h6><p>99</p><h5>National Rank</h5><h6>Active players</h6><p>2</p>'''


def snapshot():
    return [masters.parse_profile(profile(fid, inactive=fid == "700070", rank=0 if fid == "700070" else 1), name, fid)
            for name, fid in masters.PLAYERS]


def test_active_and_inactive_parsing():
    active = masters.parse_profile(profile("1503014", 2801, 3), "Magnus", "1503014")
    assert (active.rating, active.world_rank, active.active) == (2801, 3, True)
    inactive = masters.parse_profile(profile("700070", 2600, 0, True), "Judit", "700070")
    assert (inactive.rating, inactive.world_rank, inactive.active) == (2600, None, False)


@pytest.mark.parametrize("html", ["<p>Unavailable</p>", profile("wrong"), profile("1503014", rank=0), profile("1503014", rating=9000)])
def test_changed_or_invalid_source_is_rejected(html):
    with pytest.raises((ValueError, IndexError)):
        masters.parse_profile(html, "Magnus", "1503014")


def test_daily_cache_survives_new_calls_and_refreshes_after_ttl(tmp_path, monkeypatch):
    fetch = Mock(return_value=snapshot())
    monkeypatch.setattr(masters, "fetch_fide_ratings", fetch)
    path = tmp_path / "cache.sqlite"
    first = masters.get_ratings(path, now=NOW)
    assert first.updated_at == NOW and not first.stale
    assert masters.get_ratings(path, now=NOW + timedelta(hours=23)) == first
    assert fetch.call_count == 1
    refreshed = masters.get_ratings(path, now=NOW + timedelta(days=1))
    assert fetch.call_count == 2 and refreshed.updated_at != first.updated_at


def test_failed_source_preserves_snapshot_date_and_limits_retries(tmp_path, monkeypatch):
    fetch = Mock(return_value=snapshot())
    monkeypatch.setattr(masters, "fetch_fide_ratings", fetch)
    path = tmp_path / "cache.sqlite"
    first = masters.get_ratings(path, now=NOW)
    fetch.side_effect = httpx.ConnectError("offline")
    fallback = masters.get_ratings(path, now=NOW + timedelta(days=1))
    assert fallback.masters == first.masters and fallback.updated_at == NOW and fallback.stale
    assert masters.get_ratings(path, now=NOW + timedelta(days=1, hours=1)) == fallback
    assert fetch.call_count == 2


def test_no_cache_failure_and_endpoint(tmp_path, monkeypatch):
    fetch = Mock(side_effect=httpx.ConnectError("offline"))
    monkeypatch.setattr(masters, "fetch_fide_ratings", fetch)
    monkeypatch.setattr(masters, "CACHE_PATH", tmp_path / "cache.sqlite")
    app = FastAPI()
    app.include_router(masters.router)
    client = TestClient(app)
    for _ in range(2):
        response = client.get("/masters/ratings")
        assert response.status_code == 200
        assert response.json()["masters"] == [] and response.json()["updated_at"] is None
    assert fetch.call_count == 1


def test_adapter_requests_official_profiles(monkeypatch):
    def response(request):
        fid = request.url.path.split("/")[-1]
        assert request.url.host == "ratings.fide.com"
        return httpx.Response(200, text=profile(fid, inactive=fid == "700070", rank=0 if fid == "700070" else 1))
    original = httpx.Client
    monkeypatch.setattr(masters.httpx, "Client", lambda **kwargs: original(transport=httpx.MockTransport(response), **kwargs))
    assert len(masters.fetch_fide_ratings()) == 3


def test_partial_refresh_preserves_complete_cache(tmp_path, monkeypatch):
    fetch = Mock(return_value=snapshot())
    monkeypatch.setattr(masters, "fetch_fide_ratings", fetch)
    path = tmp_path / "cache.sqlite"
    first = masters.get_ratings(path, now=NOW)
    fetch.return_value = snapshot()[:1]
    fallback = masters.get_ratings(path, now=NOW + timedelta(days=1))
    assert fallback.masters == first.masters and fallback.stale
