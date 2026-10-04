import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const tabs = await (await fetch(`${process.env.CDP_URL ?? 'http://127.0.0.1:9227'}/json`)).json();
const ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, {once:true}));
let id=0; const pending=new Map(); const events=new Map();
ws.addEventListener('message', message => { const data=JSON.parse(message.data); if(data.id) { const handlers=pending.get(data.id); pending.delete(data.id); data.error ? handlers.reject(data.error) : handlers.resolve(data.result); } else events.get(data.method)?.(data.params); });
const call=(method,params={})=>new Promise((resolve,reject)=>{ pending.set(++id,{resolve,reject}); ws.send(JSON.stringify({id,method,params})); });
await call('Page.enable');
await call('Page.addScriptToEvaluateOnNewDocument',{source:`const nativeFetch = window.fetch; window.fetch = async (url, options) => {
const path = new URL(url, location.href).pathname;
if (path === '/health') return new Response(JSON.stringify({status:'ok', stockfish:true, indices:{}, chave_api:true}), {status:200});
if (path === '/analisar') return new Response(JSON.stringify({agente:'analista', resposta:'Lado que joga: brancas.\\nMelhor lance para as brancas: e4.\\nAvaliação: posição equilibrada (+0,1).\\nLinha principal: e4 e5 Nf3 Nc6 Bb5.\\n\\nPor que esse lance: Este lance ocupa o centro. Uma explicação longa preserva o contexto completo para quem abrir os detalhes. '.repeat(8), fontes:[], confianca:1}),{status:200});
return nativeFetch(url,options);
}`});
await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
const loaded=new Promise(resolve=>events.set('Page.loadEventFired',resolve));
await call('Page.navigate',{url:process.env.PREVIEW_URL ?? 'http://127.0.0.1:5178'}); await loaded;
await new Promise(r=>setTimeout(r,300));
await call('Runtime.evaluate',{expression:'document.fonts.ready.then(() => true)',awaitPromise:true});

const evaluate=async expression=>{
 const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
 return result.result.value;
};
const settle=()=>evaluate('new Promise(resolve=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),150))');
const out=fileURLToPath(new URL('.',import.meta.url));
const capture=async name=>{
 await evaluate('window.scrollTo(0,0)');
 const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true,clip:{x:0,y:0,width:await evaluate('innerWidth'),height:await evaluate('document.documentElement.scrollHeight'),scale:1}});
 await fs.writeFile(`${out}/${name}.png`,Buffer.from(shot.data,'base64'));
};
const reports=[];
for(const [width,height] of [[375,812],[768,1024],[1280,900],[1920,1080],[812,375],[900,600]]) {
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});await settle();
 const metrics=JSON.parse(await evaluate(`JSON.stringify({width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,chrome:parseFloat(document.querySelector('#partida').style.getPropertyValue('--chrome-h')),board:document.querySelector('.moldura-tabuleiro').getBoundingClientRect().toJSON(),column:document.querySelector('.match-game-column').getBoundingClientRect().toJSON(),controls:document.querySelector('.arena-control-strip').getBoundingClientRect().toJSON(),context:document.querySelector('.match-context-strip').getBoundingClientRect().toJSON(),nav:getComputedStyle(document.querySelector('nav')).display,historyOpen:document.querySelector('.history-disclosure').open,controlCount:document.querySelector('.match-controls').querySelectorAll('button').length,commentHeight:document.querySelector('.comment-trigger').getBoundingClientRect().height,parts:Object.fromEntries(['.agent-headers','.match-context-strip','#match-board','.arena-control-strip','.current-turn','.mobile-access-row','.move-history','.arena-reasoning','.curiosities-trigger','.comment-trigger'].map(sel=>[sel,document.querySelector(sel).getBoundingClientRect().toJSON()])),piece:document.querySelector('.chess-piece svg').getBoundingClientRect().toJSON(),pieceCell:document.querySelector('.chess-piece').closest('[data-square]').getBoundingClientRect().toJSON()})`));
 reports.push(metrics);console.log(JSON.stringify(metrics));
 if(metrics.scrollWidth>metrics.clientWidth) throw Error('Horizontal overflow '+width);
 if(Math.abs(metrics.board.width-metrics.board.height)>1) throw Error('Square ratio '+width);
 if(metrics.controlCount!==7) throw Error('Seven controls changed');
 if(Math.abs(metrics.piece.width/metrics.pieceCell.width-.9)>.001||Math.abs(metrics.piece.height/metrics.pieceCell.height-.9)>.001) throw Error('Piece sizing');
 if(Math.abs((metrics.piece.left+metrics.piece.right)-(metrics.pieceCell.left+metrics.pieceCell.right))>.5||Math.abs((metrics.piece.top+metrics.piece.bottom)-(metrics.pieceCell.top+metrics.pieceCell.bottom))>.5) throw Error('Piece centering');
 if(metrics.commentHeight>120) throw Error('Empty comment stretched');
 if(width>=900||width>height) {
  if(metrics.controls.bottom-metrics.context.top>height+1) throw Error('Game chrome does not fit '+width+'x'+height);
  const expected=Math.min(width>=900?metrics.column.width:metrics.clientWidth,height-metrics.chrome);
  if(Math.abs(metrics.board.width-expected)>2) throw Error('Largest square sizing '+width);
 } else if(Math.abs(metrics.board.width-metrics.clientWidth)>1) throw Error('Portrait board not full width');
 if(width<900) {
  if(metrics.parts['.move-history'].height<30) throw Error('History collapsed away');
  if(metrics.nav!=='none'||metrics.historyOpen) throw Error('Mobile disclosure default');
  const order=['.agent-headers','.match-context-strip','#match-board','.arena-control-strip','.current-turn','.mobile-access-row','.move-history','.arena-reasoning','.curiosities-trigger','.comment-trigger'];
  for(let i=1;i<order.length;i++) if(metrics.parts[order[i]].top<metrics.parts[order[i-1]].bottom-1) throw Error('Mobile order '+order[i]);
 } else if(metrics.nav!=='flex'||!metrics.historyOpen) throw Error('Desktop navigation');
 await capture(`layout-${width}x${height}`);
}
await fs.writeFile(`${out}/metrics.json`,JSON.stringify(reports,null,2));
await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await settle();
await evaluate("document.querySelector('[data-square=e2]').click()");await settle();
await evaluate("document.querySelector('[data-square=e4]').click()");await settle();
if(!await evaluate("document.querySelector('[data-square=e4] [data-piece=wP]') !== null")) throw Error('Board interaction');
await evaluate('window.qaBoard=document.querySelector(".board-stage");true');
for(const [href,page] of [['#/licoes','lessons'],['#/curiosidades','curiosities'],['#/sobre','about']]) {
 await evaluate(`document.querySelector('nav a[href="${href}"]').click()`);await settle();
 if(!await evaluate(`location.hash==="${href}"&&!document.querySelector('[data-page="${page}"]').hidden&&document.querySelector('#partida').hidden&&document.querySelector('nav a[href="${href}"]').getAttribute('aria-current')==='location'`)) throw Error('Page '+page);
 await capture(`page-${page}`);
 await evaluate('document.querySelector(".arena-brand a").click()');await settle();
 if(!await evaluate("!document.querySelector('#partida').hidden&&window.qaBoard===document.querySelector('.board-stage')&&document.querySelector('[data-square=e4] [data-piece=wP]')!==null&&document.querySelector('.control-primary').textContent.includes('Continuar')")) throw Error('Paused game lost on navigation');
 await evaluate('document.querySelector(".control-primary").click()');await settle();
}
for(const width of [375,768,1280]) {
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});await settle();
 for(const name of ['tutor','lessons','comment']) {
  await evaluate(`document.querySelector('.${name}-trigger').click()`);await settle();
  if(!await evaluate(`document.querySelector('#${name}-modal').contains(document.activeElement)&&document.body.style.overflow==='hidden'&&document.querySelector('#${name}-modal').getBoundingClientRect().right<=innerWidth&&document.querySelector('#${name}-modal').getBoundingClientRect().bottom<=innerHeight`)) throw Error('Modal '+name+' '+width);
  const shot=await call('Page.captureScreenshot',{captureBeyondViewport:false});await fs.writeFile(`${out}/${name}-${width}.png`,Buffer.from(shot.data,'base64'));
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await settle();
  if(!await evaluate("document.querySelectorAll('.match-modal-backdrop:not([hidden])').length===0")) throw Error('Escape');
 }
}
await evaluate("document.querySelector('.tutor-trigger').click()");await settle();
await call('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:true});await settle();
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await settle();
if(!await evaluate("document.activeElement===document.querySelector('.tutor-trigger')")) throw Error('Focus after responsive relocation');
await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await settle();
if(!await evaluate("document.querySelectorAll('.floating-actions button').length===2")) throw Error('Floating shortcuts missing');
for(const label of ['Abrir tutor','Abrir lições']) {
 await evaluate(`document.querySelector('.floating-actions button[aria-label="${label}"]').click()`);await settle();
 if(!await evaluate("document.querySelectorAll('.match-modal-backdrop:not([hidden])').length===1")) throw Error('Floating action');
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await settle();
}
for(const href of ['#historico-partida','#agentes','#partida']) {
 await evaluate(`document.querySelector('nav a[href="${href}"]').click()`);await settle();
 if(!await evaluate(`location.hash==="${href}"&&!document.querySelector('#partida').hidden`)) throw Error('Game menu '+href);
}
await evaluate('document.querySelector(".header-preferences-toggle").click()');await settle();
if(!await evaluate("document.querySelector('#header-preferences')!==null")) throw Error('Settings');
await evaluate('document.querySelector(".header-preferences > button").click()');
for(const accept of [false,true]) {
 let message;
 events.set('Page.javascriptDialogOpening',event=>{message=event.message;call('Page.handleJavaScriptDialog',{accept}).catch(error=>console.error(error));});
 await evaluate(`document.querySelector('nav a[href="#/"]').click()`);await settle();
 if(message!=='Deseja sair da partida?') throw Error('Exit confirmation');
 if(accept) {
  if(!await evaluate("location.hash==='#/'&&!document.querySelector('[data-page=home]').hidden&&!document.querySelector('[data-square=e4] [data-piece=wP]')")) throw Error('Exit reset');
 } else if(!await evaluate("!document.querySelector('#partida').hidden&&document.querySelector('[data-square=e4] [data-piece=wP]')!==null")) throw Error('Exit cancel');
}
console.log('Four required widths, landscape, measured sizing, piece centering, pages, pause, all menu entries, popups and exit confirmation passed.');
ws.close();
