"""Regressão da Fase 6: embeddings em várias threads (a API usa um threadpool).

Sem a trava em ingest.gerar_embeddings, carregar o modelo numa thread e gerar embeddings em
duas threads ao mesmo tempo derrubava o processo (segfault no PyTorch). O teste roda num
subprocesso: um segfault aqui mataria o próprio pytest.
"""

import subprocess
import sys
from pathlib import Path

SCRIPT = """
import threading
from ingest import gerar_embeddings

def trabalho():
    for _ in range(20):
        gerar_embeddings(["Como funciona o roque?"], tipo="consulta")

t = threading.Thread(target=trabalho)
t.start()  # a primeira carga do modelo acontece nesta thread
for _ in range(20):
    gerar_embeddings(["O que é en passant?"], tipo="consulta")
t.join()
print("OK")
"""


def test_embeddings_em_varias_threads_nao_derrubam_o_processo():
    backend = Path(__file__).resolve().parent.parent
    resultado = subprocess.run(
        [sys.executable, "-c", SCRIPT],
        cwd=backend,
        capture_output=True,
        text=True,
        timeout=120,
        env={"HF_HUB_OFFLINE": "1", "PYTHONPATH": str(backend), "PATH": ""},
    )
    assert resultado.returncode == 0, resultado.stderr[-2000:]
    assert "OK" in resultado.stdout
