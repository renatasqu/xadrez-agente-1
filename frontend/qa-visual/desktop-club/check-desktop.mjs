// Desktop QA against the unchanged backend, using only temporary QA databases/account.
import fs from 'node:fs/promises';
import { Chess } from 'chess.js';
const out=new URL('.',import.meta.url);
const tabs=await(await fetch('http://127.0.0.1:9229/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map();ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result)}};
const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const settle=async()=>{await evaluate('document.fonts.ready');await new Promise(r=>setTimeout(r,250))};
const until=async expression=>{for(let n=0;n<100;n++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,200))}throw Error('Timeout: '+expression)};
const click=async expression=>{await evaluate(expression+'.click()');await settle()};
const setValue=async(selector,value)=>evaluate(`{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${selector.includes('select')?'HTMLSelectElement':'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}`);
await call('Page.enable');await call('Network.enable');await call('Network.clearBrowserCookies');await call('Page.bringToFront');
await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.qaRequests=[];window.qaReplies=[];const realFetch=window.fetch;window.fetch=async(url,options={})=>{const path=new URL(url,location.href).pathname;window.qaRequests.push({path,method:options.method||'GET'});const response=await realFetch(url,options);if(path.startsWith('/games')&&options.method==='POST'){const body=await response.clone().json();window.qaReplies.push({path,status:response.status,game:body})}return response;};})();`});
await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:'/private/tmp/retro-prompt2-runtime/downloads'});
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await call('Page.navigate',{url:'about:blank'});await call('Page.navigate',{url:'http://127.0.0.1:5180/#/login'});await until(`document.querySelector('.auth-screen')!==null`);await settle();
const reports=[];
const capture=async(name,width)=>{
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await settle();await evaluate('scrollTo(0,0)');
 const metrics=await evaluate(`(()=>{const rect=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();return {clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,header:rect('.header-content'),main:rect('.official-setup')??rect('.official-match'),board:rect('.official-match .moldura-tabuleiro'),panel:rect('.official-match-sidebar'),headerBackground:document.querySelector('.game-header')?getComputedStyle(document.querySelector('.game-header')).backgroundColor:null,pageBackground:getComputedStyle(document.body).backgroundColor,assets:[...document.images].filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete&&i.naturalWidth>0)}})()`);
 if(metrics.scrollWidth>metrics.clientWidth)throw Error('Overflow '+name);if(!metrics.assets)throw Error('Broken asset '+name);
 if(metrics.header&&metrics.main&&(Math.abs(metrics.header.x-metrics.main.x)>1||Math.abs(metrics.header.width-metrics.main.width)>1))throw Error('Axes mismatch '+name);
 if(metrics.headerBackground===metrics.pageBackground)throw Error('Header surface '+name);
 const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true});await fs.writeFile(new URL(name+'-'+width+'.png',out),Buffer.from(shot.data,'base64'));reports.push({name,width,height:900,...metrics});
};
for(const w of [1440,1280])await capture('login',w);
await setValue('input[name=email]','desktop-qa@example.invalid');await setValue('input[name=password]','temporary-desktop-qa-password');await click(`document.querySelector('.auth-submit')`);
await until(`document.querySelector('.official-setup')!==null && !document.querySelector('.setup-start').disabled`);
// Create a real QA game through the API to exercise the continuation card, not a fixture.
await evaluate(`fetch('http://127.0.0.1:8898/games',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({human_color:'white',agent_id:'balanced',client_game_id:crypto.randomUUID()})}).then(r=>r.json()).then(g=>{window.qaSaved=g;return true})`);
await call('Page.reload');await until(`document.querySelector('.saved-game-card button')!==null`);
for(const w of [1440,1280])await capture('setup',w);
await setValue('.setup-opponent select','positional');await settle();for(const w of [1440,1280])await capture('setup-selected',w);
await setValue('.setup-opponent select','balanced');await click(`document.querySelector('.saved-game-card button')`);await until(`document.querySelector('.official-match')!==null`);
for(const w of [1440,1280])await capture('game-start',w);
const move=async uci=>{
 await click(`document.querySelector('.official-match [data-square="${uci.slice(0,2)}"]')`);await click(`document.querySelector('.official-match [data-square="${uci.slice(2,4)}"]')`);
 await until(`qaReplies.some(r=>r.path.endsWith('/moves')&&r.game.human_move==='${uci}')`);
 const reply=await evaluate('qaReplies.at(-1)');if(reply.status!==200||!reply.game.agent_move||reply.game.awaiting_agent||reply.game.agent_status!=='moved')throw Error('Automatic AI failed');return reply.game;
};
let game=await move('e2e4');const chess=new Chess(game.current_fen);const next=chess.moves({verbose:true}).find(m=>m.from==='g1'&&m.to==='f3')??chess.moves({verbose:true})[0];game=await move(next.from+next.to+(next.promotion??''));
await until(`document.querySelectorAll('.history-pair').length===2`);
for(const w of [1440,1280])await capture('game-moves',w);
await evaluate(`window.qaMatch=document.querySelector('.official-match');true`);
for(const href of ['#/historico','#/partida']){await click(`document.querySelector('.header-navigation-items a[href="${href}"]')`);await until(`location.hash==='${href}'`)}
if(!await evaluate(`document.querySelector('.official-match')===qaMatch`))throw Error('Game replaced by navigation');
const persisted=await evaluate(`fetch('http://127.0.0.1:8898/games/${game.id}',{credentials:'include'}).then(r=>r.json())`);
if(persisted.id!==game.id||persisted.human_color!=='white'||persisted.opponent.agent_id!=='balanced'||persisted.version!==game.version)throw Error('Game identity changed');
const before=await evaluate(`qaRequests.filter(r=>r.method==='POST'&&r.path.startsWith('/games')).length`);
for(const w of [1440,1280]){
 await call('Emulation.setDeviceMetricsOverride',{width:w,height:900,deviceScaleFactor:1,mobile:false});await settle();
 const rect=await evaluate(`document.querySelector('.official-match .moldura-tabuleiro').getBoundingClientRect().toJSON()`);
 await click(`document.querySelector('.history-navigation button[title="Lance anterior"]')`);await until(`document.querySelector('.official-match.is-reviewing')!==null`);await capture('replay',w);
 const replayRect=await evaluate(`document.querySelector('.official-match .moldura-tabuleiro').getBoundingClientRect().toJSON()`);
 for(const key of ['x','y','width','height'])if(Math.abs(rect[key]-replayRect[key])>.5)throw Error('Replay geometry '+key);
 await click(`[...document.querySelectorAll('.history-navigation button')].find(b=>b.textContent.includes('Voltar à posição atual'))`);await until(`document.querySelector('.official-match.is-reviewing')===null`);
}
if(await evaluate(`qaRequests.filter(r=>r.method==='POST'&&r.path.startsWith('/games')).length`)!==before)throw Error('Replay submitted a move');
await click(`document.querySelector('.history-export')`);await until(`document.querySelector('textarea[aria-label="PGN exportado"]')!==null`);
const pgn=await evaluate(`document.querySelector('textarea[aria-label="PGN exportado"]').value`);if(!pgn.includes('1. e4')||!pgn.includes('[Result "*"]'))throw Error('PGN');
await click(`document.querySelector('.header-exit')`);await until(`document.querySelector('.auth-screen')!==null`);
const session=await evaluate(`fetch('http://127.0.0.1:8898/auth/session',{credentials:'include'}).then(r=>r.json())`);if(session!==null)throw Error('Logout session not revoked');
reports.push({smoke:'PASS with real backend and Stockfish',gameId:game.id,human_color:game.human_color,agent_id:game.opponent.agent_id,moves:game.moves,agent_status:game.agent_status,version:game.version,pgnExported:true,replayGeometryPreserved:true,gameIdentityPreserved:true,logout:true});
await fs.writeFile(new URL('metrics.json',out),JSON.stringify(reports,null,2));console.log(JSON.stringify({captures:reports.filter(r=>r.width).map(r=>({name:r.name,width:r.width,board:r.board?.width,panel:r.panel?.height})),smoke:reports.at(-1)}));ws.close();
