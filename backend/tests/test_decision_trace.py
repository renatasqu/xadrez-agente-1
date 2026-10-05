"""Telemetry and benchmark invariants, with a small real UCI set."""
from dataclasses import replace, FrozenInstanceError
import chess
import pytest
import chess_engine as engine
import agent_personas
import games
from agent_profiles import PROFILES, DIFFICULTIES
from agent_policy import decision_trace, select_candidate, StockfishPolicy, mate_classification, style_features
from benchmarks.positions import POSITIONS
from benchmarks.agent_styles import aggregate, run
from tests.test_authorization import client, login


def c(move,cp=0,rank=1,mate=None,pv=None):
    return engine.Candidate(move,cp if mate is None else None,mate,tuple(pv or [move]),rank)


@pytest.mark.parametrize('black',[False,True])
@pytest.mark.parametrize('profile',list(PROFILES.values()))
def test_cp_trace_invariants(profile,black):
    board=chess.Board()
    if black:board.push_uci('e2e4')
    legal=tuple(m.uci() for m in board.legal_moves)
    candidates=[c('e7e5' if black else 'e2e4',80),c('g8f6' if black else 'g1f3',60,2)]
    before=(board.fen(),list(board.move_stack))
    t=decision_trace(board,legal,candidates,profile)
    assert t.selected.move==select_candidate(board,legal,candidates,profile)
    assert t.engine_best==candidates[0] and t.candidate_count==2
    assert t.selected.rank==next(c.rank for c in candidates if c.move==t.selected.move)
    assert t.perspective=='side_to_move' and t.quality_loss_cp==80-t.selected.cp>=0
    assert t.quality_loss_cp<=DIFFICULTIES[profile.difficulty].quality_cp
    assert next(r for r in t.candidates if r.candidate==t.selected).eligible
    assert next(r for r in t.candidates if r.candidate==t.selected).features==style_features(board,t.selected)
    assert (board.fen(),board.move_stack)==before
    assert decision_trace(board,legal,candidates,profile)==t
    with pytest.raises(FrozenInstanceError):t.style='tactical'


@pytest.mark.parametrize('profile',list(PROFILES.values()))
def test_mate_overrides_style_and_cp(profile):
    board=chess.Board();legal=tuple(m.uci() for m in board.legal_moves)
    candidates=[c('e2e4',rank=1,mate=1),c('g1f3',rank=2,mate=3),c('d2d4',99999,3)]
    t=decision_trace(board,legal,candidates,profile)
    assert t.selected==candidates[0] and t.eligible_count==1 and t.quality_loss_cp is None
    assert t.mate_classification=='winning_mate_preserved'
    lost=decision_trace(board,legal,[c('e2e4',rank=1,mate=-5),c('g1f3',rank=2,mate=-1)],profile)
    assert lost.selected.mate==-5 and lost.quality_loss_cp is None and lost.mate_classification=='inevitable_losing_mate'


@pytest.mark.parametrize('classification,selected',[
 ('winning_mate_preserved',c('e2e4',mate=1)),('winning_mate_slower',c('e2e4',mate=3)),('winning_mate_lost',c('e2e4',500))])
def test_mate_diagnostic_categories(classification,selected):
    assert mate_classification(c('g1f3',mate=1),selected)==classification


@pytest.mark.parametrize('style,fen,best,alternative',[
 ('aggressive','4k3/8/8/8/8/8/4P3/R3K3 w Q - 0 1','e2e3','a1a8'),
 ('tactical','4k3/8/8/8/8/8/4P3/R3K3 w Q - 0 1','e2e3','a1a8'),
 ('positional',chess.STARTING_FEN,'a2a3','g1f3')])
def test_features_prove_differentiation(style,fen,best,alternative):
    board=chess.Board(fen);legal=tuple(m.uci() for m in board.legal_moves)
    candidates=[c(best,30),c(alternative,20,2)]
    profile=PROFILES[style]
    t=decision_trace(board,legal,candidates,profile)
    assert t.selected.move==alternative and t.candidates[1].style_score>t.candidates[0].style_score
    assert decision_trace(board,legal,candidates,replace(profile,style='balanced')).selected.move==best
    assert decision_trace(board,legal,[c(best,200),c(alternative,0,2)],profile).selected.move==best


@pytest.mark.parametrize('profile',list(PROFILES.values()))
def test_single_legal_without_engine(profile,monkeypatch):
    board=chess.Board(next(p.fen for p in POSITIONS if p.id=='single'))
    monkeypatch.setattr(engine,'gerar_candidatos',lambda *a,**kw:pytest.fail('engine'))
    legal=tuple(m.uci() for m in board.legal_moves)
    t=StockfishPolicy().trace_move(board,legal,games.Opponent(agent_id=profile.id))
    assert t.selected.move==StockfishPolicy().choose_move(board,legal,games.Opponent(agent_id=profile.id))
    assert t.mate_classification=='single_legal_move' and t.quality_loss_cp is None


def test_same_generator_budget_trace_and_persona_isolation(monkeypatch):
    board=chess.Board();legal=tuple(m.uci() for m in board.legal_moves);calls=[]
    def generate(b,**kw):calls.append(kw);return [c('e2e4'),c('g1f3',-5,2)]
    monkeypatch.setattr(engine,'gerar_candidatos',generate)
    monkeypatch.setattr(agent_personas,'render_comment',lambda *a:pytest.fail('persona selected move'))
    for profile in PROFILES.values():
        config=games.Opponent(agent_id=profile.id)
        assert StockfishPolicy().choose_move(board,legal,config)==StockfishPolicy().trace_move(board,legal,config).selected.move
        assert calls[-1]==calls[-2]==dict(tempo=DIFFICULTIES[profile.difficulty].time,nodes=DIFFICULTIES[profile.difficulty].nodes,quantidade=DIFFICULTIES[profile.difficulty].candidates)


def test_trace_does_not_write_game_or_leak_api(client,monkeypatch):
    login(client);game=games.create_game('a@example.com','white')
    board=engine.reconstruir_partida(game.initial_fen,game.moves)
    decision_trace(board,tuple(m.uci() for m in board.legal_moves),[c('e2e4')],PROFILES['balanced'])
    assert games.get_game(game.id,'a@example.com')==game
    assert 'trace' not in client.get('/games/'+game.id).json()
    assert not any('benchmark' in path for path in client.app.openapi()['paths'])


def test_dataset_valid_provenance_and_aggregation():
    assert len({p.id for p in POSITIONS})==len(POSITIONS)>=14
    assert len({p.category for p in POSITIONS})>=14
    for p in POSITIONS:assert chess.Board(p.fen).is_valid() and p.origin=='synthetic/project-test'
    b=chess.Board();legal=tuple(m.uci() for m in b.legal_moves)
    traces=[decision_trace(b,legal,[c('e2e4',50),c('g1f3',40,2)],PROFILES['training_beginner']),decision_trace(b,legal,[c('e2e4',mate=1)],PROFILES['balanced'])]
    summary=aggregate(traces)
    assert summary['cp_samples']==1 and summary['mean_cp_loss']==summary['median_cp_loss']==summary['max_cp_loss']==10
    assert summary['rank1']==1 and summary['mate_classes']=={'cp':1,'winning_mate_preserved':1}


@pytest.mark.parametrize('position_id',['development','mate_white','mate_black','losing_mate'])
def test_real_trace_multipv_scores_and_cleanup(position_id,monkeypatch):
    motors=[];original=engine.abrir_motor
    def opening():
        m=original();motors.append(m);return m
    monkeypatch.setattr(engine,'abrir_motor',opening)
    board=chess.Board(next(p.fen for p in POSITIONS if p.id==position_id));before=board.fen()
    candidates=engine.gerar_candidatos(board,tempo=1,nodes=4000,quantidade=4,somente_nodes=True)
    assert len(candidates)==min(4,board.legal_moves.count())
    for p in PROFILES.values():
        t=decision_trace(board,tuple(m.uci() for m in board.legal_moves),candidates,p)
        assert chess.Move.from_uci(t.selected.move) in board.legal_moves and t.perspective=='side_to_move'
        assert t.quality_loss_cp is None or 0<=t.quality_loss_cp<=DIFFICULTIES[p.difficulty].quality_cp
        if position_id.startswith('mate_'):assert t.selected.mate==1 and t.mate_classification=='winning_mate_preserved'
        if position_id=='losing_mate':assert t.selected.mate<0 and t.mate_classification=='inevitable_losing_mate'
    assert board.fen()==before and len(motors)==1 and motors[0].returncode.result(timeout=2)==0


def test_score_reference_not_confused_by_rank_or_mate():
    b=chess.Board();legal=tuple(m.uci() for m in b.legal_moves)
    trace=decision_trace(b,legal,[c('e2e4',10),c('g1f3',30,2)],PROFILES['balanced'])
    assert trace.engine_best.move=='g1f3' and trace.quality_loss_cp==20
    trace=decision_trace(b,legal,[c('e2e4',9999),c('g1f3',rank=2,mate=1)],PROFILES['balanced'])
    assert trace.engine_best.mate==1 and trace.mate_classification=='winning_mate_preserved' and trace.quality_loss_cp is None


def test_benchmark_isolated_shared_budgets(monkeypatch):
    opened=[];calls=[]
    class Motor:
        id={'name':'Fake Stockfish'}
    monkeypatch.setattr(engine,'abrir_motor',lambda:Motor())
    monkeypatch.setattr(engine,'fechar_motor',lambda m:opened.append(m))
    def generate(b,**kw):calls.append(kw);return [c('e2e4'),c('g1f3',-10,2)]
    monkeypatch.setattr(engine,'gerar_candidatos',generate)
    monkeypatch.setattr(games,'create_game',lambda *a,**kw:pytest.fail('Game creation'))
    monkeypatch.setattr('progresso._conectar',lambda *a,**kw:pytest.fail('Database'))
    monkeypatch.setattr(agent_personas,'render_comment',lambda *a:pytest.fail('Persona'))
    r=run(POSITIONS[:1])
    assert len(calls)==3 and all(k['somente_nodes'] is True for k in calls)
    assert len(opened)==1 and r['processes_simultaneous']==1 and r['processes_total']==4
    assert all(v['positions']==1 for v in r['summary'].values())
    assert r['divergence']['positional vs magnus_inspired']==0
