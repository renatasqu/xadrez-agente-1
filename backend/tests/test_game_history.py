"""SAN/PGN/replay e revisão isolada: sessões/SQLite temporários, sem LLM."""
import io
import json
from contextlib import closing
from dataclasses import asdict
import chess
import chess.pgn
import pytest
import games
import game_history as history
import chess_engine as engine
import progresso
from tests.test_authorization import client, login
from tests.test_games import intent


def seed(fen=chess.STARTING_FEN,moves=None,color='white'):
    game=games.create_game('a@example.com',color,initial_fen=fen)
    moves=moves or []
    engine.reconstruir_partida(fen,moves)
    with closing(progresso._conectar()) as db,db:
        db.execute('UPDATE games SET moves_json=?, version=? WHERE id=?',(json.dumps(moves),len(moves),game.id))
    return games.get_game(game.id,'a@example.com')


@pytest.mark.parametrize('fen,moves,san',[
    (chess.STARTING_FEN,['e2e4'],'e4'),
    (chess.STARTING_FEN,['e2e4','d7d5','e4d5'],'exd5'),
    ('4k3/8/8/8/8/8/R7/K7 w - - 0 1',['a2e2'],'Re2+'),
    (chess.STARTING_FEN,['f2f3','e7e5','g2g4','d8h4'],'Qh4#'),
    ('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',['e1g1'],'O-O'),
    ('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',['e1c1'],'O-O-O'),
    ('7k/P7/8/8/8/8/8/K7 w - - 0 1',['a7a8q'],'a8=Q+'),
    (chess.STARTING_FEN,['e2e4','a7a6','e4e5','d7d5','e5d6'],'exd6'),
    ('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1',['b1d2'],'Nbd2')])
def test_san_specials(client,fen,moves,san):
    game=seed(fen,moves); data=history.replay(game)
    assert data['steps'][-1]['san']==san
    board=chess.Board(fen)
    for step,move in zip(data['steps'],moves):
        assert step['ply']==len(board.move_stack)+1 and step['move_number']==board.fullmove_number
        assert step['color']==('white' if board.turn else 'black')
        board.push_uci(move);assert step['fen']==board.fen() and step['uci']==move
    assert data['current_fen']==game.current_fen


@pytest.mark.parametrize('fen,moves,result',[
    (chess.STARTING_FEN,['e2e4','e7e5'],'*'),
    (chess.STARTING_FEN,['f2f3','e7e5','g2g4','d8h4'],'0-1'),
    ('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',['f7g7'],'1-0'),
    ('7k/8/8/8/8/8/8/K7 w - - 0 1',[],'1/2-1/2'),
    ('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 27',['e8c8'],'*')])
def test_pgn_roundtrip_and_results(client,fen,moves,result):
    game=seed(fen,moves,color='black'); text=history.pgn(game)
    loaded=chess.pgn.read_game(io.StringIO(text)); assert loaded and not loaded.errors
    assert loaded.headers['Result']==result
    assert loaded.headers['Black']=='Human' and loaded.headers['White']=='Equilibrado'
    if fen!=chess.STARTING_FEN: assert loaded.headers['SetUp']=='1' and loaded.headers['FEN']==fen
    else: assert 'SetUp' not in loaded.headers
    replay=loaded.board()
    for move in loaded.mainline_moves(): replay.push(move)
    assert replay.fen()==game.current_fen
    assert [m.uci() for m in loaded.mainline_moves()]==game.moves
    assert game.id not in text and '@' not in text and 'owner' not in text and '/Users/' not in text


@pytest.mark.parametrize('suffix,method,body',[('pgn','GET',None),('replay','GET',None),('review','POST',{'ply':0,'version':0})])
def test_auth_and_other_owner(client,suffix,method,body):
    game=seed();path=f'/games/{game.id}/{suffix}'
    assert client.request(method,path,json=body).status_code==401
    login(client,'b@example.com')
    r=client.request(method,path,json=body)
    assert r.status_code==404 and r.json()==client.request(method,f'/games/missing/{suffix}',json=body).json()


def test_reads_no_engine_and_readonly(client,monkeypatch):
    login(client);game=seed(moves=['e2e4','e7e5'])
    def forbidden(*a,**kw): pytest.fail('Read started engine or LLM')
    monkeypatch.setattr(engine,'abrir_motor',forbidden);monkeypatch.setattr('llm.criar_llm',forbidden)
    for suffix in ['pgn','replay']:
        r=client.get(f'/games/{game.id}/{suffix}');assert r.status_code==200 and r.headers['cache-control']=='no-store'
    assert client.get(f'/games/{game.id}/pgn').headers['content-disposition']=='attachment; filename="partida.pgn"'
    assert games.get_game(game.id,'a@example.com')==game


def fake_eval(board,cp=None,mate=None):
    return asdict(engine.Analise(fen=board.fen(),lado='brancas' if board.turn else 'pretas',pontos=cp,mate=mate,melhor_lance='e4',linha=['e4']))


def test_review_snapshot_no_lock_and_still_playable(client,monkeypatch):
    login(client);game=seed(moves=['e2e4','e7e5'])
    seen=[]
    def evaluate(board):
        seen.append([m.uci() for m in board.move_stack])
        # Escrita concorrente durante cálculo: nenhuma transação da revisão está aberta.
        if len(seen)==1:
            games.submit_human_move(game.id,'a@example.com',games.HumanMove(**intent('g1f3',2)))
        return fake_eval(board,cp=10 if len(seen)==1 else -20)
    monkeypatch.setattr(history,'evaluate',evaluate)
    r=client.post(f'/games/{game.id}/review',json={'ply':2,'version':2}).json()
    assert r['version']==2 and r['played']['san']=='e5' and r['cp_delta_white']==-30
    assert seen==[['e2e4'],['e2e4','e7e5']]
    latest=games.get_game(game.id,'a@example.com');assert latest.moves==['e2e4','e7e5','g1f3'] and latest.version==3
    assert r['after']['fen']==game.current_fen


@pytest.mark.parametrize('before,after',[(3,None),(None,-2),(1,0)])
def test_mate_no_cp_delta(client,monkeypatch,before,after):
    login(client);game=seed(moves=['e2e4'])
    values=iter([before,after])
    monkeypatch.setattr(history,'evaluate',lambda b:fake_eval(b,cp=45 if (m:=next(values)) is None else None,mate=m))
    response=client.post(f'/games/{game.id}/review',json={'ply':1,'version':1})
    assert response.status_code==200 and response.json()['cp_delta_white'] is None
    assert games.get_game(game.id,'a@example.com')==game


def test_terminal_and_repetition_no_engine(client,monkeypatch):
    def forbidden(*a,**kw):pytest.fail('Terminal opened engine')
    monkeypatch.setattr(engine,'abrir_motor',forbidden); login(client)
    for fen,winner in [('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1','white'),('8/8/8/8/8/1k6/1q6/K7 w - - 0 1','black')]:
        game=seed(fen)
        r=client.post(f'/games/{game.id}/review',json={'ply':0,'version':0}).json()
        assert r['after']['mate']==0 and r['after']['vencedor']==winner and r['cp_delta_white'] is None
        assert client.post(f'/games/{game.id}/moves',json=intent()).status_code==409
    board=engine.reconstruir_partida(chess.STARTING_FEN,['g1f3','g8f6','f3g1','f6g8']*2)
    assert history.evaluate(board)['status']=='repetition'


@pytest.mark.parametrize('body',[{'ply':-1,'version':0},{'ply':True,'version':0},{'ply':1,'version':0},{'ply':0,'version':1},{'ply':0,'version':0,'fen':chess.STARTING_FEN}])
def test_review_invalid_request(client,body):
    login(client);game=seed()
    assert client.post(f'/games/{game.id}/review',json=body).status_code in (409,422)


def test_real_stockfish_review_and_closure(client,monkeypatch):
    login(client);game=seed(moves=['e2e4','e7e5']); motors=[];original=engine.abrir_motor
    def open_engine():
        motor=original();motors.append(motor);return motor
    monkeypatch.setattr(engine,'abrir_motor',open_engine)
    r=client.post(f'/games/{game.id}/review',json={'ply':2,'version':2})
    assert r.status_code==200
    data=r.json();assert data['before']['perspectiva']==data['after']['perspectiva']=='white'
    assert data['before']['melhor_lance_uci'] and data['after']['melhor_lance_uci']
    assert len(motors)==2 and all(m.returncode.result(timeout=2)==0 for m in motors)
    assert games.get_game(game.id,'a@example.com')==game


def test_real_move_creates_mate(client):
    login(client);game=seed('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',['a1a8'])
    data=client.post(f'/games/{game.id}/review',json={'ply':1,'version':1}).json()
    assert data['before']['mate']==1 and data['after']['mate']==0 and data['after']['vencedor']=='white'
    assert data['cp_delta_white'] is None


def test_engine_failure_sanitized(client,monkeypatch):
    login(client);game=seed()
    def fail(*a,**kw):raise engine.StockfishAusente('private path')
    monkeypatch.setattr(engine,'abrir_motor',fail)
    r=client.post(f'/games/{game.id}/review',json={'ply':0,'version':0})
    assert r.status_code==503 and 'private' not in r.text and games.get_game(game.id,'a@example.com')==game


def test_review_slot_timeout_and_release(client,monkeypatch):
    login(client);game=seed()
    assert history._REVIEW_SLOTS.acquire(timeout=0) and history._REVIEW_SLOTS.acquire(timeout=0)
    try:
        response=client.post(f'/games/{game.id}/review',json={'ply':0,'version':0})
        assert response.status_code==503 and response.json()['code']=='review_unavailable'
    finally:
        history._REVIEW_SLOTS.release();history._REVIEW_SLOTS.release()
    monkeypatch.setattr(history,'evaluate',lambda b:fake_eval(b,cp=-40))
    response=client.post(f'/games/{game.id}/review',json={'ply':0,'version':0})
    assert response.status_code==200 and response.json()['cp_delta_white'] is None
    assert games.get_game(game.id,'a@example.com')==game


def test_engine_receives_history_copy_and_rejects_mismatch():
    board=engine.reconstruir_partida(chess.STARTING_FEN,['e2e4','e7e5'])
    class Motor:
        def analyse(self,supplied,limit):
            assert supplied is not board and supplied.move_stack==board.move_stack
            return {'score':chess.engine.PovScore(chess.engine.Cp(-35),chess.BLACK),'pv':[chess.Move.from_uci('g1f3')]}
        def quit(self):pass
        def close(self):pass
    value=engine.analisar_posicao(board.fen(),.25,tabuleiro=board,abrir=Motor)
    assert value.pontos==35 and value.perspectiva=='white' and len(board.move_stack)==2
    with pytest.raises(engine.PosicaoInvalida):
        engine.analisar_posicao(chess.STARTING_FEN,.25,tabuleiro=board,abrir=Motor)


def test_terminal_review_never_executes_agent(client,monkeypatch):
    login(client);game=seed(moves=['f2f3','e7e5','g2g4','d8h4'])
    monkeypatch.setattr(history,'evaluate',lambda b:fake_eval(b,mate=-1 if not b.is_checkmate() else 0))
    def forbidden(*a,**kw):pytest.fail('Review executed agent')
    monkeypatch.setattr(games,'execute_agent',forbidden)
    assert client.post(f'/games/{game.id}/review',json={'ply':4,'version':4}).status_code==200
    assert games.get_game(game.id,'a@example.com')==game
