/* PMO V6.4: testes de gráfico único, ordem do report, filtros e UX com dados fictícios. */
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(x=>x[1]).find(x=>x.includes('function detalheExecutivo('));
const refino=fs.readFileSync(path.join(__dirname,'refino.js'),'utf8');
const frontend=fs.readFileSync(path.join(__dirname,'v63.js'),'utf8');
assert(inline,'Encontrou JS principal');
const dom=new JSDOM(html,{url:'http://localhost/teste-v6-4/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.HTMLElement.prototype.scrollIntoView=function(){}; // API inexistente no jsdom, implementada pelo navegador real.
class ChartStub {
  static instances=[];static plugins=[];static register(...ps){this.plugins.push(...ps)}
  constructor(canvas,config){this.canvas=canvas;this.data=config.data;this.options=config.options;this.config=config;ChartStub.instances.push(this)}
  getDatasetMeta(){return {data:[]}} isDatasetVisible(){return true}
  update(){} destroy(){this.destroyed=true}
}
w.Chart=ChartStub;
let clientOptions;
const user={id:'00000000-0000-0000-0000-000000000004',email:'gp@exemplo.com'};
const hist=[
 {projeto_id:4,data_referencia:'2026-10-30',planejado:60,realizado:55},
 {projeto_id:4,data_referencia:'2026-11-06',planejado:70,realizado:65},
 {projeto_id:5,data_referencia:'2026-10-30',planejado:50,realizado:40},
 {projeto_id:5,data_referencia:'2026-11-06',planejado:60,realizado:48}
];
const report={
 relatorio:{
  id:4,data_referencia:'2026-11-06',status_geral:'No prazo',
  farol_escopo:'Crítico',farol_prazo:'Atenção',farol_custo:'No prazo',farol_qualidade:'Não avaliado',
  objetivo:'Testes',contexto:'Ambiente simulado',go_live_forecast:'2026-11-20',
  planejado:70,realizado:65,resumo_realizado:'Entregue'
 },marcos:[],riscos:[],acoes:[],
 historico:hist.filter(x=>x.projeto_id===4)
};
const mock={
 auth:{getUser:async()=>({data:{user:null},error:null}),
  signInWithPassword:async()=>({data:{user},error:null}),
  signOut:async()=>({error:null})},
 rpc:async name=>({data:name==='pmo_portfolio_evolucao'?hist
   :name==='pmo_detalhe_publicado'?report:[],error:null}),
 from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
   limit(){return Promise.resolve({data:[],error:null})},
   then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}})
};
w.supabase={createClient:(url,key,opts)=>{clientOptions=opts;return mock}};
const context=dom.getInternalVMContext();
new vm.Script(inline,{filename:'index-inline.js'}).runInContext(context);
new vm.Script(refino,{filename:'refino.js'}).runInContext(context);
new vm.Script(frontend,{filename:'v63.js'}).runInContext(context);
w.document.dispatchEvent(new w.Event('DOMContentLoaded',{bubbles:true}));
const $=s=>w.document.querySelector(s);
const options=[...$('#sStatusGeral').options].map(x=>x.value);
assert.deepEqual(options,['Não avaliado','No prazo','Atenção','Crítico'],'Só 4 status permitidos');
assert($('#sStatusGeral').required,'Status obrigatório');
for(const el of w.document.querySelectorAll('.farolSelect'))
 assert.deepEqual([...el.options].map(x=>x.value),options,'4 faróis padronizados');
assert.equal($('#sStatusGeral').value,'Não avaliado');
assert.equal(clientOptions?.auth?.persistSession,false,'Sem sessão persistente');
assert(!clientOptions?.auth?.detectSessionInUrl===false,'Convites continuam funcionando');
assert.equal(w.document.querySelector('#app').hidden,true,'Tela não abre autenticada');
assert.equal(w.document.querySelector('#loginBox').hidden,false,'Login visível');
const novo=vm.runInContext('pmo63Status("Em atraso")',context);
assert.equal(novo,'Crítico','Histórico antigo classificado visualmente, sem atualizar banco');
assert.equal(vm.runInContext('pmoSaudePortfolio(null)',context),'Não avaliado');
const host=$('#listaResumo');
const a=w.document.createElement('div');host.appendChild(a);
vm.runInContext("detalheExecutivo(document.querySelector('#listaResumo > div:first-child'),"+JSON.stringify(report)+",{projeto:'Projeto A',gerente:'GP'});",context);
assert.equal(a.querySelector('.pmo62-adopted-status strong')?.textContent,'No prazo',
 'Status geral permanece o declarado, independentemente do farol crítico');
assert.match(a.querySelector('.pmo62-golive-days')?.textContent||'',/14 dia\(s\)/);
assert(a.querySelector('.pmo63-history table'),'Evolução com datas e percentuais em tabela');
assert(a.querySelector('.pmo63-history canvas'),'Dois registros devem usar gráfico de linha');
const slide=a.querySelector('.pmo-slide');
const children=[...slide.children];
assert(children.indexOf(slide.querySelector('.slide-evolucao')) > children.indexOf(slide.querySelector('.slide-resumos')),
  'Gráfico histórico precisa vir depois dos resumos, no final do report');
assert(children.indexOf(slide.querySelector('.slide-evolucao')) > children.indexOf(slide.querySelector('.slide-tabelas')),
  'Evolução precisa vir depois dos marcos e riscos');
const legacy=JSON.parse(JSON.stringify(report));legacy.relatorio.status_geral='Em atraso';
const b=w.document.createElement('div');host.appendChild(b);
vm.runInContext("detalheExecutivo(document.querySelector('#listaResumo > div:nth-child(2)'),"+JSON.stringify(legacy)+",{projeto:'Projeto B',gerente:'GP'});",context);
assert.equal(b.querySelector('.pmo62-adopted-status strong')?.textContent,'Crítico','Histórico antigo normalizado visualmente');
assert.match(b.querySelector('.pmo63-legacy-report')?.textContent||'',/Em atraso/);
const single=JSON.parse(JSON.stringify(report));
single.relatorio.data_referencia='2026-10-30';
single.relatorio.planejado=70;
single.relatorio.realizado=78;
single.historico=[{data_referencia:'2026-10-30',planejado:70,realizado:78}];
const c=w.document.createElement('div');host.appendChild(c);
vm.runInContext("detalheExecutivo(document.querySelector('#listaResumo > div:nth-child(3)'),"+JSON.stringify(single)+",{projeto:'Projeto C',gerente:'GP'});",context);
assert(c.querySelector('.pmo64-semana-unica'),'Histórico de apenas uma semana deve ser comparativo, sem linha isolada');
assert.equal(c.querySelector('.pmo63-history canvas'),null,'Um único ponto não deve ter canvas grande e vazio');
assert.match(c.querySelector('.pmo64-semana-ref')?.textContent||'',/30\/10\/2026/);
assert.equal(c.querySelectorAll('.pmo64-semana-linha').length,2,'Planejado e realizado em barras distintas');
assert.match(c.querySelector('.pmo64-semana-desvio')?.textContent||'',/\+8 p\.p\./);
assert.match(c.querySelector('.pmo63-slide-note')?.textContent||'',/Barras comparativas/);
const singleChildren=[...c.querySelector('.pmo-slide').children];
assert.equal(singleChildren[singleChildren.length-1].classList.contains('slide-evolucao'),true,'Último bloco é evolução');
const css=fs.readFileSync(path.join(__dirname,'v64.css'),'utf8');
assert(css.includes('--p64-navy') && css.includes('--p64-orange') && css.includes('.pmo64-semana-unica'));
assert(css.includes('prefers-reduced-motion') && css.includes(':hover'),'Manter UX hover e acessibilidade');
console.log('PASS: 4 estados, históricos com 1 e 2 semanas, ordem do report, comparação 70 x 78 +8 p.p. e nova paleta.');
async function portfolio(){
 await new Promise(resolve=>setTimeout(resolve,40));
 vm.runInContext("usu={id:'00000000-0000-0000-0000-000000000004',email:'gp@exemplo.com'};papel='gerente';",context);
 $('#app').hidden=false;$('#tabPortfolio').hidden=false;
 vm.runInContext("pmoDadosPortfolio="+JSON.stringify([
  {id:4,nome:'Projeto A',gerente:'GP',publicado:true,saude:'Crítico',relatorio:{planejado:70,realizado:65,status_geral:'No prazo'}},
  {id:5,nome:'Projeto B',gerente:'GP 2',publicado:true,saude:'Não avaliado',relatorio:{planejado:60,realizado:48,status_geral:'Crítico'}}
 ])+";filtrarPortfolio()",context);
 await new Promise(resolve=>setTimeout(resolve,340));
 assert.equal($('#portKpis strong')?.textContent,'2');
 assert.equal($('#pmo63Dashboard .pmo63-kpi-value')?.textContent,'2');
 assert($('#pmo63Dashboard .pmo63-chart-grid canvas'),'Gráficos consolidados');
 assert($('#pmo63TimelineSelect'),'Controle de timeline');
 assert($('#pmo63Dashboard .pmo63-timeline-values table'),'Timeline com dados publicados');
 const pChart=[...ChartStub.instances].filter(x=>!x.destroyed&&x.config.type==='bar');
 assert(pChart.length>=3,'Gráficos de comparação por projeto/gerente/desvio');
 $('#portBusca').value='Projeto A';
 $('#portBusca').dispatchEvent(new w.Event('input',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,280));
 assert.equal($('#portKpis strong')?.textContent,'1','Tabela filtrada');
 assert.equal($('#pmo63Dashboard .pmo63-kpi-value')?.textContent,'1','Gráficos filtrados');
 assert.equal($('#pmo63TimelineSelect').options.length,2,'Timeline filtrada + consolidado');
 $('#portLimpar').click();
 await new Promise(resolve=>setTimeout(resolve,280));
 assert.equal($('#portKpis strong')?.textContent,'2','Limpou filtros');
 const btn=$('#portLinhas button');
 assert(btn&&btn.textContent.includes('Ver slide'));
 btn.click();
 await new Promise(resolve=>setTimeout(resolve,300));
 assert.equal($('#portBusca').value,'Projeto A','Ver slide aplica filtro');
 assert.equal($('#portKpis strong')?.textContent,'1','Ver slide foca KPIs');
 assert.equal($('#pmo63Dashboard .pmo63-kpi-value')?.textContent,'1','Ver slide foca gráficos');
 assert($('#portDetalhe .pmo-slide'),'Detalhe carrega: '+$('#portDetalhe').textContent.slice(0,600));
 console.log('PASS: gráfico por projetos, gerente, desvio, timeline; foco e limpeza propagados a todos os painéis.');
 w.close();
}
portfolio().catch(e=>{console.error(e);w.close();process.exit(1)});
