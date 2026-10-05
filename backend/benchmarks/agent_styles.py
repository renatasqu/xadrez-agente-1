"""Sequential node-controlled MultiPV benchmark, shared candidates per budget.
Run from backend: ../.venv/bin/python -m benchmarks.agent_styles [--json /tmp/report.json]
No database, network, LLM or persona rendering. No rating/fidelity measurement.
"""
import argparse
from dataclasses import asdict, replace
from itertools import combinations
import json
from statistics import mean, median
from time import perf_counter
import chess
import chess_engine
from agent_profiles import PROFILES, DIFFICULTIES
from agent_policy import decision_trace, StockfishPolicy
from games import Opponent
from .positions import POSITIONS


def aggregate(traces):
    losses = [t.quality_loss_cp for t in traces if t.quality_loss_cp is not None]
    features = [next(c.features for c in t.candidates if c.candidate.move == t.selected.move) for t in traces]
    return dict(positions=len(traces), rank1=sum(t.selected.rank == 1 for t in traces),
                average_rank=mean(t.selected.rank for t in traces), average_candidates=mean(t.candidate_count for t in traces),
                average_eligible=mean(t.eligible_count for t in traces), cp_samples=len(losses),
                mean_cp_loss=mean(losses) if losses else None, median_cp_loss=median(losses) if losses else None,
                max_cp_loss=max(losses) if losses else None,
                checks=sum(f.check for f in features), captures=sum(f.capture for f in features),
                development=sum(f.development for f in features), center_destination=sum(f.center_destination for f in features),
                castling=sum(f.castling for f in features), defended_destination=sum(f.defended_destination for f in features),
                own_pv_forcing=sum(f.own_pv_forcing for f in features),
                eligible_multiple=sum(t.eligible_count > 1 for t in traces),
                mate_classes={k:sum(t.mate_classification==k for t in traces) for k in sorted({t.mate_classification for t in traces})})


def run(positions=POSITIONS):
    started = perf_counter()
    motor = chess_engine.abrir_motor()
    try: engine_name = motor.id['name']
    finally: chess_engine.fechar_motor(motor)
    records = {p:[] for p in PROFILES}
    controlled = {s:[] for s in ('balanced','aggressive','positional','tactical')}
    calls = 0
    for position in positions:
        board = chess.Board(position.fen)
        if not board.is_valid() or chess_engine.estado_tabuleiro(board)['ended']: raise ValueError(position.id)
        legal = tuple(m.uci() for m in board.legal_moves)
        cache = {}
        if len(legal)>1:
            for name,budget in DIFFICULTIES.items():
                cache[name] = chess_engine.gerar_candidatos(board,tempo=budget.time,nodes=budget.nodes,quantidade=budget.candidates,somente_nodes=True)
                calls += 1
        for name,profile in PROFILES.items():
            trace = (decision_trace(board,legal,cache[profile.difficulty],profile) if cache else
                     StockfishPolicy().trace_move(board,legal,Opponent(agent_id=name)))
            if chess.Move.from_uci(trace.selected.move) not in board.legal_moves: raise AssertionError('Illegal selection')
            if not any(c.eligible and c.candidate == trace.selected for c in trace.candidates): raise AssertionError('Ineligible selection')
            if trace.quality_loss_cp is not None and not 0 <= trace.quality_loss_cp <= DIFFICULTIES[profile.difficulty].quality_cp: raise AssertionError('Quality window violated')
            if trace.mate_classification in ('winning_mate_lost', 'winning_mate_slower'): raise AssertionError('Winning mate not preserved')
            records[name].append(trace)
        for style in controlled:
            profile = replace(PROFILES['balanced'], style=style, difficulty='advanced')
            trace = decision_trace(board,legal,cache['advanced'],profile) if cache else records['balanced'][-1]
            controlled[style].append(trace)
    pairwise = {a+' vs '+b:sum(x.selected.move!=y.selected.move for x,y in zip(records[a],records[b])) for a,b in combinations(records,2)}
    diagnostic = {}
    for style,traces in controlled.items():
        base = controlled['balanced']
        diagnostic[style] = dict(divergence=sum(t.selected.move!=b.selected.move for t,b in zip(traces,base)),
            multiple_eligible=sum(t.eligible_count>1 for t in traces),
            feature_score_ties=sum(t.eligible_count>1 and len({c.style_score for c in t.candidates if c.eligible})==1 for t in traces),
            aggregate=aggregate(traces))
    return dict(dataset_version=1, engine=engine_name, engine_options={'Threads':1,'Hash':16,'fresh_process_per_search':True},
                search='nodes_only; production retains time AND nodes',budgets={k:asdict(v) for k,v in DIFFICULTIES.items()},
                positions=[asdict(p) for p in positions], profiles={k:dict(version=p.version,difficulty=p.difficulty,style=p.style) for k,p in PROFILES.items()},
                summary={k:aggregate(v) for k,v in records.items()}, divergence=pairwise,controlled_advanced=diagnostic,
                traces={k:[asdict(t) for t in v] for k,v in records.items()},
                calls=calls, processes_total=calls+1, processes_simultaneous=1, duration_seconds=perf_counter()-started)


def print_report(report):
    print(f"{report['engine']} | {len(report['positions'])} positions | {report['calls']} searches | {report['duration_seconds']:.2f}s | sequential")
    print('Dataset v1 categories:', ', '.join(sorted({p['category'] for p in report['positions']})))
    print('Profile versions:', ', '.join(f"{k}=v{v['version']}" for k,v in report['profiles'].items()))
    print('Engine options:', report['engine_options'], '| budgets:', report['budgets'])
    print('Profile | Positions | Rank1 | Avg rank | CP samples | Avg/median/max CP loss | vs balanced')
    for name,row in report['summary'].items():
        key = 'balanced vs '+name
        divergence = report['divergence'].get(key, report['divergence'].get(name+' vs balanced',0))
        avg = '-' if row['mean_cp_loss'] is None else f"{row['mean_cp_loss']:.2f}"
        print(f"{name} | {row['positions']} | {row['rank1']} | {row['average_rank']:.2f} | {row['cp_samples']} | {avg}/{row['median_cp_loss']}/{row['max_cp_loss']} | {divergence}")
        print(f"  features check/capture/develop/center/castle={row['checks']}/{row['captures']}/{row['development']}/{row['center_destination']}/{row['castling']} ; mates={row['mate_classes']}")
    print('Controlled comparison: same advanced candidates/window for every style')
    for style,row in report['controlled_advanced'].items(): print(f"{style}: {row['divergence']} divergent; {row['multiple_eligible']} multiple eligible; {row['feature_score_ties']} score ties")
    print('Pairwise divergence:',json.dumps(report['divergence'],sort_keys=True))
    print('Implementation/internal differentiation only: no Elo, real-player similarity or fidelity.')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--json');args=parser.parse_args()
    report=run();print_report(report)
    if args.json:
        with open(args.json,'w',encoding='utf-8') as output:json.dump(report,output,ensure_ascii=False,indent=2)
