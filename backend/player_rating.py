"""Internal progression v1. No claim of human/FIDE strength; no engine or LLM."""
from contextlib import closing
from math import pow
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from auth import require_user
from agent_profiles import resolve_profile
import progresso

INITIAL_RATING = 1200
K = 32
SYSTEM_VERSION = 1
# Product progression parameters, never real-player ratings. Keep v1 immutable.
OPPONENT_RATINGS = {'beginner': 1000, 'intermediate': 1200, 'advanced': 1400}


class RatingChange(BaseModel):
    before: int
    after: int
    delta: int
    result: str
    opponent_rating: int
    rating_system_version: int


class PlayerRating(BaseModel):
    rating: int
    initial_rating: int = INITIAL_RATING
    games_rated: int
    rating_system: str = 'internal_elo'
    rating_system_version: int = SYSTEM_VERSION


class RatingEvent(RatingChange):
    opponent_name: str
    game_id: str
    opponent_agent_id: str
    profile_version: int
    score: float
    created_at: str


def calculate(player: int, opponent: int, score: float) -> int:
    if score not in (0, .5, 1): raise ValueError('Resultado inválido')
    expected = 1 / (1 + pow(10, (opponent-player)/400))
    return round(player + K*(score-expected))


def create_tables(db):
    db.execute('''CREATE TABLE IF NOT EXISTS player_ratings (
        account TEXT PRIMARY KEY, current_rating INTEGER NOT NULL,
        games_rated INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)''')
    db.execute('''CREATE TABLE IF NOT EXISTS rating_events (
        game_id TEXT PRIMARY KEY REFERENCES games(id), account TEXT NOT NULL,
        rating_before INTEGER NOT NULL, rating_after INTEGER NOT NULL, delta INTEGER NOT NULL,
        opponent_agent_id TEXT NOT NULL, opponent_rating INTEGER NOT NULL,
        profile_version INTEGER NOT NULL, result TEXT NOT NULL, score REAL NOT NULL,
        rating_system_version INTEGER NOT NULL, created_at TEXT NOT NULL)''')
    db.execute('CREATE INDEX IF NOT EXISTS rating_account_history ON rating_events(account,created_at DESC,game_id DESC)')


def ensure_player(db, account, timestamp):
    db.execute('INSERT OR IGNORE INTO player_ratings VALUES (?, ?, 0, ?)',(account,INITIAL_RATING,timestamp))
    return db.execute('SELECT current_rating,games_rated FROM player_ratings WHERE account=?',(account,)).fetchone()


def change_for_game(db, game_id):
    row=db.execute('SELECT rating_before,rating_after,delta,result,opponent_rating,rating_system_version FROM rating_events WHERE game_id=?',(game_id,)).fetchone()
    return RatingChange(**dict(zip(('before','after','delta','result','opponent_rating','rating_system_version'),row))) if row else None


def apply_terminal(db, game, account):
    """Caller owns BEGIN IMMEDIATE; Game+event+rating commit or roll back together."""
    if not game.terminal: return None
    previous=change_for_game(db,game.id)
    if previous:return previous
    try: profile=resolve_profile(game.opponent.agent_id,game.opponent.profile_version)
    except KeyError:return None  # Unknown legacy definition cannot invent opponent strength.
    opponent=OPPONENT_RATINGS[profile.difficulty]
    result='draw' if game.winner is None else 'win' if game.winner==game.human_color else 'loss'
    score={'win':1.,'draw':.5,'loss':0.}[result]
    from games import now
    timestamp=now();before,count=ensure_player(db,account,timestamp)
    after=calculate(before,opponent,score)
    db.execute('INSERT INTO rating_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        (game.id,account,before,after,after-before,game.opponent.agent_id,opponent,game.opponent.profile_version,result,score,SYSTEM_VERSION,timestamp))
    db.execute('UPDATE player_ratings SET current_rating=?,games_rated=?,updated_at=? WHERE account=?',
        (after,count+1,timestamp,account))
    return change_for_game(db,game.id)


from games import GameRoute
router=APIRouter(prefix='/rating',tags=['rating'],route_class=GameRoute)


@router.get('',response_model=PlayerRating)
def read_rating(user:dict=Depends(require_user)):
    from games import now
    with closing(progresso._conectar()) as db,db:
        db.execute('BEGIN IMMEDIATE')
        rating,count=ensure_player(db,user['email'],now())
    return PlayerRating(rating=rating,games_rated=count)


@router.get('/history',response_model=list[RatingEvent])
def history(limit:int=Query(default=10,ge=1,le=50),offset:int=Query(default=0,ge=0,le=10000),user:dict=Depends(require_user)):
    with closing(progresso._conectar()) as db:
        rows=db.execute('''SELECT game_id,rating_before,rating_after,delta,result,opponent_rating,
            rating_system_version,opponent_agent_id,profile_version,score,created_at
            FROM rating_events WHERE account=? ORDER BY created_at DESC,game_id DESC LIMIT ? OFFSET ?''',
            (user['email'],limit,offset)).fetchall()
    keys=('game_id','before','after','delta','result','opponent_rating','rating_system_version','opponent_agent_id','profile_version','score','created_at')
    events=[]
    for row in rows:
        fields=dict(zip(keys,row))
        try:name=resolve_profile(fields['opponent_agent_id'],fields['profile_version']).display_name
        except KeyError:name=fields['opponent_agent_id']
        events.append(RatingEvent(opponent_name=name,**fields))
    return events
