"""Regression for the missing language configuration observed in Chrome QA."""
import pytest
from tests.test_authorization import client, login
from config import settings

@pytest.mark.parametrize('path,body', [('/chat', {'mensagem':'Como funciona o roque?'}),('/recomendar',{'mensagem':'Como funciona o roque?'})])
def test_missing_language_is_controlled_service_error(client,monkeypatch,path,body):
    login(client)
    monkeypatch.setattr(settings,'anthropic_api_key','')
    monkeypatch.setattr(settings,'llm_provider','anthropic')
    response=client.post(path,json=body,headers={'Origin':'http://localhost:5173'})
    assert response.status_code==503
    assert response.headers['access-control-allow-origin']=='http://localhost:5173'
    assert response.json()['resposta']=='Tutor indisponível: o serviço de linguagem não está configurado.'
    assert 'API_KEY' not in response.text and '.env' not in response.text
    assert client.get('/rating').json()['rating']==1200
