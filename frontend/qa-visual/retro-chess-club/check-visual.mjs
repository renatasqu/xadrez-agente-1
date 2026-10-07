// Isolated Chrome CDP QA. All API responses are fixtures, never real credentials or games.
import fs from 'node:fs/promises';
import { Chess } from 'chess.js';
const out=new URL('.',import.meta.url);
const tabs=await(await fetch('http://127.0.0.1:9227/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map();
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result)}};
const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
const settle=async()=>{await evaluate('document.fonts.ready');await new Promise(r=>setTimeout(r,400))};
const chess=new Chess();chess.move('e4');chess.move('e5');
const profile={id:'balanced',display_name:'Equilibrado',difficulty:'intermediate',style:'balanced',description:'Equilíbrio entre atividade e segurança.'};
const game={id:'qa-preserved-game',initial_fen:new Chess().fen(),current_fen:chess.fen(),moves:['e2e4','e7e5'],human_color:'white',side_to_move:'white',status:'playing',winner:null,terminal:false,awaiting_agent:false,opponent:{type:'ai',agent_id:'balanced'},created_at:'2026-10-07T10:00:00Z',updated_at:'2026-10-07T10:00:00Z',version:2,profile};
const replayChess=new Chess();
const replay={game_id:game.id,version:2,initial_fen:game.initial_fen,current_fen:game.current_fen,result:'*',termination:'playing',steps:['e4','e5'].map((san,i)=>{const move=replayChess.move(san);return {ply:i+1,move_number:1,color:i===0?'white':'black',uci:move.from+move.to,san,fen:replayChess.fen()}})};
await call('Page.enable');
await call('Page.addScriptToEvaluateOnNewDocument',{source:`
window.qaRequests=[];window.qaLoggedIn=false;const qaGame=${JSON.stringify(game)};const qaProfile=${JSON.stringify(profile)};
window.fetch=async(url,options={})=>{
 const path=new URL(url,location.href).pathname;window.qaRequests.push({path,method:options.method||'GET'});
 let data=null,status=200;
 if(path==='/auth/session')data=window.qaLoggedIn?{name:'QA',email:'qa@example.invalid'}:null;
 else if(path==='/auth/login'){window.qaLoggedIn=true;data={name:'QA',email:'qa@example.invalid'}}
 else if(path==='/auth/logout'){window.qaLoggedIn=false;data={ok:true}}
 else if(path==='/health')data={status:'ok',stockfish:true,indices:{},chave_api:true};
 else if(path==='/agents')data=[qaProfile];
 else if(path==='/rating')data={rating:1200,initial_rating:1200,games_rated:0,rating_system:'internal',rating_system_version:1};
 else if(path==='/rating/history')data=[];
 else if(path==='/games')data={games:[{...qaGame,move_count:2}],next_offset:null};
 else if(path==='/games/qa-preserved-game')data=qaGame;
 else if(path==='/games/qa-preserved-game/replay')data=${JSON.stringify(replay)};
 else if(path==='/games/qa-preserved-game/commentary')data={game_id:qaGame.id,version:2,ply:2,profile_version:1,persona_id:'balanced',persona_version:1,text:'O centro está em disputa. Desenvolva uma peça e prepare a segurança do rei.',status:'available',facts:{uci:'e7e5',san:'e5',capture:false,check:false,castling:false,promotion:false,terminal:false,winner:null}};
 else if(path==='/masters/ratings')data={updated_at:null,masters:[],stale:true,source:'FIDE'};
 else if(path==='/progresso')data={};
 else {status=503;data={message:'Fixture não configurada',resposta:'Fixture não configurada',fontes:[],agente:'roteador',confianca:0}}
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};`});
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await call('Page.navigate',{url:'about:blank'});
await call('Page.navigate',{url:'http://127.0.0.1:5178/#/login'});await settle();
const reports=[];
const capture=async(name,width,height)=>{
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});await settle();await evaluate('scrollTo(0,0)');
 const metrics=await evaluate(`({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,header:document.querySelector('.game-header')?.getBoundingClientRect().toJSON(),pixel:getComputedStyle(document.querySelector('h1')).fontFamily,body:getComputedStyle(document.body).fontFamily,assets:[...document.images].filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete&&i.naturalWidth>0)})`);
 reports.push({name,width,height,...metrics});if(metrics.scrollWidth>metrics.clientWidth)throw Error('Overflow '+name);if(!metrics.assets)throw Error('Broken images '+name);
 const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true});await fs.writeFile(new URL(name+'.png',out),Buffer.from(shot.data,'base64'));
};
for(const [w,h]of [[1440,900],[390,844]])await capture('login-'+w,w,h);
await evaluate(`document.querySelector('.auth-password-toggle').click()`);
if(await evaluate(`document.querySelector('input[name=password]').type`)!=='text')throw Error('Show password');
await evaluate(`for(const [name,value]of [['email','qa@example.invalid'],['password','qa-fixture-password']]){const input=document.querySelector('input[name='+name+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-submit').click()`);await settle();
if(!await evaluate(`document.querySelector('.game-header')!==null`))throw Error('Login');
for(const [w,h]of [[1440,900],[1280,900],[768,1024],[390,844]])await capture('setup-'+w,w,h);
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Continuar partida').click()`);await settle();
if(!await evaluate(`document.querySelector('.official-match')!==null`))throw Error('Resume fixture game');
await evaluate(`window.qaMatch=document.querySelector('.official-match');window.qaBoard=document.querySelector('.official-board-stage')`);
for(const [w,h]of [[1440,900],[1280,900],[768,1024],[390,844]])await capture('game-'+w,w,h);
const before=await evaluate(`qaRequests.filter(r=>r.method==='POST'&&r.path.startsWith('/games')).length`);
for(const href of ['#/historico','#/masters','#/licoes','#/pratica','#/sobre','#/partida']){
 await evaluate(`if(getComputedStyle(document.querySelector('.header-navigation-items')).display==='none')document.querySelector('.header-menu-toggle').click()`);
 await evaluate(`document.querySelector('.header-navigation-items a[href="${href}"]').click()`);await settle();
 if(await evaluate('location.hash')!==href)throw Error('Navigation '+href);
 if(href==='#/sobre')await evaluate(`document.querySelector('.content-modal-close')?.click()`);
}
// Close About via its actual dialog close control if the modal stayed open.
await evaluate(`document.querySelector('[role=dialog] button[aria-label]')?.click()`);await settle();
if(!await evaluate(`document.querySelector('.official-match')===window.qaMatch`))throw Error('Game remounted');
if(await evaluate(`qaRequests.filter(r=>r.method==='POST'&&r.path.startsWith('/games')).length`)!==before)throw Error('Unexpected game mutation');
await capture('game-return-390',390,844);
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await call('Page.bringToFront');
await evaluate(`document.querySelector('.arena-brand a').focus()`);
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await settle();
if(!await evaluate(`document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle==='solid'`))throw Error('Keyboard focus');
await capture('keyboard-focus-1440',1440,900);
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await settle();
await evaluate(`if(getComputedStyle(document.querySelector('.header-navigation-items')).display==='none')document.querySelector('.header-menu-toggle').click()`);await settle();await capture('menu-390',390,844);
if(!await evaluate(`getComputedStyle(document.querySelector('.header-navigation-items')).display==='flex'`))throw Error('Menu did not open');
await evaluate(`document.querySelector('.header-navigation-items a[href="#/"]').click()`);await settle();
if(!await evaluate(`document.querySelector('.auth-screen')!==null`))throw Error('Logout');
await evaluate(`document.querySelector('input[name=email]').focus()`);
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await settle();
if(!await evaluate(`document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle==='solid'`))throw Error('Login keyboard focus');
await capture('login-focus-390',390,844);
reports.push({smoke:'PASS with mocked API',gamePreserved:true,gameMutationRequests:before,requests:await evaluate('qaRequests')});
await fs.writeFile(new URL('metrics.json',out),JSON.stringify(reports,null,2));console.log(JSON.stringify({viewports:reports.filter(r=>r.width).map(r=>({name:r.name,width:r.width,overflow:r.scrollWidth>r.clientWidth})),smoke:reports.at(-1)}));ws.close();
