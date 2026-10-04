"""Testes determinísticos da limpeza de texto e da divisão em chunks (não usam o modelo)."""

from ingest import (
    SOBREPOSICAO,
    TAMANHO_CHUNK,
    dividir_em_chunks,
    eh_lista_de_lances,
    extrair_miolo_gutenberg,
    limpar_texto,
    secao_do_chunk,
)


def test_remove_titulos_repetidos_da_impressao_web():
    texto = "FIDE LAWS OF CHESSFIDE LAWS OF CHESSFIDE LAWS OF CHESS\n3.1 Rule."
    assert limpar_texto(texto) == "FIDE LAWS OF CHESS\n3.1 Rule."


def test_remove_menu_do_site_e_ligaduras():
    texto = "the ﬁrst rank.\nCONTENTS HANDBOOK\nNEWS RATINGS\nFinancial Reports\nArticle 11"
    limpo = limpar_texto(texto)
    assert "first rank" in limpo and "Article 11" in limpo
    assert "HANDBOOK" not in limpo and "RATINGS" not in limpo


def test_remove_legendas_dos_diagramas_de_roque():
    texto = "just crossed.\nBefore white kingside\ncastling\nAfter black queenside\ncastling\n3.8.2.1 The right"
    assert limpar_texto(texto) == "just crossed.\n3.8.2.1 The right"


def test_detecta_lista_de_lances():
    partida = "1. P. to K's 4th. 1. P. to K's 4th.\n2. K. Kt. to B's 3d. 2. Q. Kt. to B's 3d.\n3. K. B. to Q. B's 4th."
    assert eh_lista_de_lances(partida)


def test_prosa_com_um_lance_nao_e_lista():
    prosa = "The Knight is the most beautiful piece.\nHe can leap over other men.\n1. Kt. to B's 3d. is good.\nIt attacks the centre."
    assert not eh_lista_de_lances(prosa)


def test_artigos_da_fide_nao_sao_confundidos_com_lances():
    artigos = "3.8.1 by moving to an adjoining square\n3.8.2 by castling\n3.9.1 The king is in check"
    assert not eh_lista_de_lances(artigos)


def test_secao_do_chunk_usa_artigo_anterior():
    pagina = "3.8 The king:\n3.8.2 by castling. The king moves two squares.\n3.9 Check."
    inicio = pagina.index("The king moves")
    chunk = pagina[inicio : pagina.index("\n3.9")]
    assert secao_do_chunk(pagina, inicio, chunk) == "3.8.2"


def test_secao_do_chunk_cita_intervalo_de_artigos():
    pagina = "3.1.2 Moves.\nThe bishop may move.\n3.5 The rook.\n3.6 The knight may move."
    inicio = pagina.index("The bishop")
    assert secao_do_chunk(pagina, inicio, pagina[inicio:]) == "3.1.2–3.6"


def test_secao_do_chunk_sem_numeracao():
    assert secao_do_chunk("Just prose here.", 0, "Just prose here.") is None


def test_remove_diagrama_do_pdf_de_regis():
    texto = "A free gift\ncuuuuuuuuC\n(rDb1kDn4}\n%$wGQDRIw}a\nv,./9EFJMV\n7.0-0 U DIAGRAM\nThe end."
    limpo = limpar_texto(texto)
    assert "cuuuu" not in limpo and "rDb1kDn4" not in limpo and "v,./" not in limpo
    assert "DIAGRAM" not in limpo
    assert "A free gift" in limpo and "7.0-0" in limpo


def test_remove_tabuleiro_ascii_do_staunton():
    texto = "The King.\n+---+---+\n| R*| N*|\n+---+---+\nHe moves one square."
    limpo = limpar_texto(texto)
    assert "+---+" not in limpo and "R*" not in limpo
    assert "The King." in limpo and "He moves one square." in limpo


def test_remove_rotulos_de_diagramas_removidos():
    texto = "WHITE.\n\nNo. 7.\n\nBLACK.\nThe Pawn moves one square.\nWHITE. BLACK."
    assert limpar_texto(texto) == "The Pawn moves one square.\nWHITE. BLACK."


def test_notas_de_partida_contam_como_lances():
    notas = "[Footnote L: A strong move.]\n\n[Footnote M: Weak.]\n[Footnote N: The best move.]"
    assert eh_lista_de_lances(notas)


def test_remove_ilustracoes_e_paginas_do_gutenberg():
    texto = "[Illustration] {4}\n\nIn this position the power of the Rook {24} is shown.\n[Illustration: JOSE R. CAPABLANCA]"
    assert limpar_texto(texto) == "In this position the power of the Rook is shown."


def test_normaliza_espacos():
    assert limpar_texto("ano  ther   piece") == "ano ther piece"


def test_extrai_miolo_gutenberg():
    texto = "Licença\n*** START OF THE EBOOK X ***\nConteúdo do livro\nTHE END.\nPGN e licença"
    miolo = extrair_miolo_gutenberg(texto)
    assert "Conteúdo do livro" in miolo
    assert "Licença" not in miolo and "PGN" not in miolo


def test_chunks_respeitam_tamanho_e_sobreposicao():
    texto = " ".join(f"palavra{i}" for i in range(600))  # ~5.000 caracteres
    chunks = dividir_em_chunks(texto)
    assert len(chunks) > 1
    assert all(len(c) <= TAMANHO_CHUNK for c in chunks)
    # O fim de um chunk reaparece no começo do seguinte (sobreposição).
    for anterior, seguinte in zip(chunks, chunks[1:]):
        assert anterior[-SOBREPOSICAO // 2 :].split()[-1] in seguinte


def test_chunks_nao_partem_palavras():
    texto = " ".join(f"palavra{i}" for i in range(600))
    for chunk in dividir_em_chunks(texto):
        assert all(p.startswith("palavra") for p in chunk.split())


def test_descarta_chunks_minusculos():
    assert dividir_em_chunks("White to move") == []
