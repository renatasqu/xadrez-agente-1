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
const settle=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
const out=fileURLToPath(new URL('.', import.meta.url));
for(const width of [320,390,820,899,900,1024,1280,1440]) {
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});
 await settle(); await evaluate('window.scrollTo(0,0)');
 const metrics=JSON.parse(await evaluate(`JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,board:document.querySelector('.moldura-tabuleiro').getBoundingClientRect().toJSON(),header:document.querySelector('.game-header').getBoundingClientRect().toJSON(),nav:getComputedStyle(document.querySelector('nav')).display,historyOpen:document.querySelector('.history-disclosure').open,controls:document.querySelector('.match-controls').querySelectorAll('button').length,mainDisplay:getComputedStyle(document.querySelector('.match-central')).display,parts:Object.fromEntries(['.agent-headers','.match-context-strip','#match-board','.arena-control-strip','.current-turn','.tutor-trigger','.lessons-trigger','.move-history','.arena-reasoning','.curiosities-trigger','.comment-trigger','#sobre-projeto'].map(selector=>[selector,document.querySelector(selector).getBoundingClientRect().toJSON()]))})`));
 console.log(width,JSON.stringify(metrics));
 if(metrics.scrollWidth>width) throw Error('Overflow '+width);
 if(Math.abs(metrics.board.width-metrics.board.height)>1) throw Error('Board not square '+width);
 if(metrics.controls!==7) throw Error('Controls changed');
 if(width<900) {
  if(metrics.nav!=='none'||metrics.historyOpen) throw Error('Mobile menu/history '+width);
  const order=['.agent-headers','.match-context-strip','#match-board','.arena-control-strip','.current-turn','.tutor-trigger','.move-history','.arena-reasoning','.curiosities-trigger','.comment-trigger','#sobre-projeto'];
  for(let i=1;i<order.length;i++) if(metrics.parts[order[i]].top<metrics.parts[order[i-1]].bottom-1) throw Error('Mobile order '+order[i]+' '+width);
  if(Math.abs(metrics.parts['.lessons-trigger'].top-metrics.parts['.tutor-trigger'].top)>1) throw Error('Tutor/Lessons not side by side');
 } else {
  if(metrics.nav!=='flex'||!metrics.historyOpen||metrics.mainDisplay!=='flex'||metrics.board.width>520) throw Error('Desktop composition '+width);
  if(Math.abs(metrics.parts['.move-history'].top-metrics.parts['.tutor-trigger'].top)>1) throw Error('Upper strip '+width);
 }
 const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true,clip:{x:0,y:0,width,height:await evaluate('document.documentElement.scrollHeight'),scale:1}});
 await fs.writeFile(`${out}/layout-${width}.png`,Buffer.from(shot.data,'base64'));
}
for(const width of [320,820,1440]) {
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});await settle();
 for(const name of ['tutor','lessons','curiosities','comment']) {
  await evaluate(`document.querySelector('.${name}-trigger').click()`);await settle();
  const metrics=JSON.parse(await evaluate(`JSON.stringify({overflow:document.documentElement.scrollWidth>innerWidth,modal:document.querySelector('#${name}-modal').getBoundingClientRect().toJSON(),focus:document.querySelector('#${name}-modal').contains(document.activeElement),scroll:getComputedStyle(document.querySelector('#${name}-modal .modal-body')).overflowY})`));
  if(metrics.overflow||!metrics.focus||metrics.modal.right>width||metrics.modal.bottom>900||metrics.scroll!=='auto') throw Error('Modal '+name+' '+width);
  const shot=await call('Page.captureScreenshot',{captureBeyondViewport:false});await fs.writeFile(`${out}/${name}-${width}.png`,Buffer.from(shot.data,'base64'));
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await settle();
  if(!await evaluate("document.querySelectorAll('.match-modal-backdrop:not([hidden])').length === 0")) throw Error('Modal did not close');
 }
}
await call('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true});await settle();
await evaluate("document.querySelector('.header-menu-toggle').click()");await settle();
if(!await evaluate("getComputedStyle(document.querySelector('nav')).display === 'flex' && document.documentElement.scrollWidth === innerWidth")) throw Error('Menu overflow');
const menuShot=await call('Page.captureScreenshot',{captureBeyondViewport:false});await fs.writeFile(`${out}/menu-320.png`,Buffer.from(menuShot.data,'base64'));
await evaluate("document.querySelector('a[href=\"#historico-partida\"]').click()");await settle();
if(!await evaluate("document.querySelector('.history-disclosure').open")) throw Error('History nav does not expand');
console.log('Layout, mobile order, 7 controls, modals, menu and history navigation passed.');
await evaluate("document.querySelector('.match-controls .botao-pixel').click()");
await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
for(const width of [1440,820,320]) {
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});await settle();
 if(!await evaluate("document.querySelector('.thinking-full-text')?.textContent.length > 200")) throw Error('Analysis not received');
 await evaluate("document.querySelector('.thinking-details summary').click()");await settle();
 if(await evaluate('document.documentElement.scrollWidth>innerWidth')) throw Error('Expanded analysis overflow');
 await evaluate('window.scrollTo(0,0)');
 const shot=await call('Page.captureScreenshot',{captureBeyondViewport:true,clip:{x:0,y:0,width,height:await evaluate('document.documentElement.scrollHeight'),scale:1}});
 await fs.writeFile(`${out}/analysis-${width}.png`,Buffer.from(shot.data,'base64'));
 await evaluate("document.querySelector('.thinking-details summary').click()");
}
console.log('Long analysis and expanded details passed.');
ws.close();
