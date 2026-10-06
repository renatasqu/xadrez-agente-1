"""Official classical FIDE profiles; replaceable adapter and daily persistent cache.

Only three public profiles are requested per refresh. No live/unofficial ratings.
If the source markup changes, validation fails and the last snapshot is preserved.
Refresh is lazy on GET, once per 24 hours, including failed attempts. Set
MASTERS_CACHE_PATH to a persistent volume when deploying ephemeral containers.
"""
import logging
import sqlite3
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from config import settings

PLAYERS = (("Hans Niemann", "2093596"), ("Magnus Carlsen", "1503014"), ("Judit Polgár", "700070"))

CACHE_PATH = settings.masters_cache_path
TTL = 86400
logger = logging.getLogger(__name__)
router = APIRouter(prefix="/masters", tags=["masters"])


class MasterRating(BaseModel):
    name: str
    fide_id: str
    rating: int = Field(gt=0, le=4000)
    world_rank: int | None = Field(default=None, gt=0)
    active: bool


class RatingsResponse(BaseModel):
    updated_at: datetime | None = None
    masters: list[MasterRating] = Field(default_factory=list)
    stale: bool = False
    source: str = "https://ratings.fide.com/"


class ProfileText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.ignored = max(0, self.ignored - 1)

    def handle_data(self, data):
        if not self.ignored and data.strip():
            self.parts.append(" ".join(data.split()))


def parse_profile(html: str, name: str, fide_id: str) -> MasterRating:
    parser = ProfileText()
    parser.feed(html)
    parts = parser.parts
    # Label-based extraction deliberately fails closed rather than guessing values.
    if parts[parts.index("FIDE ID") + 1] != fide_id:
        raise ValueError("FIDE identity mismatch")
    standard = parts.index("STANDARD")
    rating = int(parts[standard - 1])
    inactive = parts[standard + 1].casefold() == "inactive"
    world = parts.index("World Rank")
    if parts[world + 1] != "Active players":
        raise ValueError("Missing active world rank")
    rank = int(parts[world + 2])
    if not inactive and rank <= 0:
        raise ValueError("Active player without valid rank")
    return MasterRating(name=name, fide_id=fide_id, rating=rating,
                        world_rank=None if inactive else rank, active=not inactive)


def fetch_fide_ratings() -> list[MasterRating]:
    with httpx.Client(timeout=10, follow_redirects=True,
                      headers={"User-Agent": "XadrezMultiagente/1.0 (daily public FIDE profile cache)"}) as client:
        result = []
        for name, fide_id in PLAYERS:
            response = client.get(f"https://ratings.fide.com/profile/{fide_id}")
            response.raise_for_status()
            result.append(parse_profile(response.text, name, fide_id))
        return result


def get_ratings(path: Path | None = None, *, now: datetime | None = None) -> RatingsResponse:
    path = path or CACHE_PATH
    now = now or datetime.now(timezone.utc)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(path, timeout=35) as db:
            db.execute("CREATE TABLE IF NOT EXISTS cache (id INTEGER PRIMARY KEY CHECK(id=1), attempted REAL, payload TEXT)")
            # Serializes refreshes across threads and server workers, including failures.
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT attempted, payload FROM cache WHERE id=1").fetchone()
            cached = RatingsResponse.model_validate_json(row[1]) if row and row[1] else RatingsResponse()
            if row and now.timestamp() - row[0] < TTL:
                return cached
            try:
                players = fetch_fide_ratings()
                if {p.fide_id for p in players} != {p[1] for p in PLAYERS} or len(players) != len(PLAYERS):
                    raise ValueError("Incomplete FIDE snapshot")
                cached = RatingsResponse(updated_at=now, masters=players)
            except (httpx.HTTPError, ValueError, IndexError) as exc:
                logger.warning("FIDE ratings refresh failed: %s", type(exc).__name__)
                cached.stale = True
            db.execute("INSERT OR REPLACE INTO cache VALUES (1, ?, ?)",
                       (now.timestamp(), cached.model_dump_json()))
            return cached
    except (OSError, sqlite3.Error, ValueError):
        logger.warning("Masters cache unavailable")
        return RatingsResponse(stale=True)


@router.get("/ratings", response_model=RatingsResponse)
def ratings():
    return get_ratings()
