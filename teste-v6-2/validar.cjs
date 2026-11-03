/* Teste local com DOM simulado: não usa dados/credenciais reais */
const fs=require('fs');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const path=require('path');
const root=__dirname;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'refino.js'),'utf8');
const ux=fs.readFileSync(path.join(root,'ux.js'),'utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(m=>m[1]).find(s=>s.includes('function detalheExecutivo('));
assert(inline,'JavaScript inline principal encontrado');
const doc=new JSDOM(html,{url:'http://localhost/teste-v6-2/',runScripts:'outside-only',pretendToBeVisual:true});
const w=doc.window;
const errors=[];
w.addEventListener('error',e=>errors.push(e.message));
w.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
class ChartStub {
  static instances=[];
  static plugins=[];
  static register(...x){this.plugins.push(...x)}
  constructor(canvas,config){
    this.canvas=canvas;this.config=config;this.data=config.data;this.options=config.options;
    this.ctx={};this.chartArea={top:20,bottom:220,left:20,right:600};
    ChartStub.instances.push(this);
  }
  update(){}
  destroy(){this.destroyed=true}
  getDatasetMeta(index){return {data:[]}}
  isDatasetVisible(){return true}
}
w.Chart=ChartStub;
const historyRows=[
 {projeto_id:4,data_referencia:'2026-10-30',planejado:60,realizado:55},
 {projeto_id:4,data_referencia:'2026-11-06',planejado:70,realizado:65},
 {projeto_id:5,data_referencia:'2026-10-30',planejado:50,realizado:40},
 {projeto_id:5,data_referencia:'2026-11-06',planejado:60,realizado:48}
];
const fakeDb={
 auth:{
   getUser:async()=>({data:{user:null},error:null}),
   onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
 },
 rpc:async(name)=>({error:null,data:name==='pmo_portfolio_evolucao'?historyRows:[]}),
 from:()=>({
   select(){return this},
   eq(){return this},
   in(){return this},
   order(){return this},
   limit(){return Promise.resolve({data:[],error:null})},
   then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}
 })
};
w.supabase={createClient:()=>fakeDb};
w.eval(inline);
w.eval(js);
w.eval(ux);
doc.window.document.dispatchEvent(new w.Event('DOMContentLoaded',{bubbles:true}));
const grab=(selector,where=doc.window.document)=>where.querySelector(selector);
const status=grab('#sStatusGeral');
assert(status && status.tagName==='SELECT','Status geral deve ser seleção');
assert(status.required,'Status geral obrigatório');
for(const value of ['No prazo','Em atraso','Atenção','Crítico','Bloqueado','TBD'])
 assert([...status.options].some(x=>x.value===value),'Opção '+value);
assert(!html.includes('ajustes.js'),'Sem wrappers antigos problemáticos');
assert(!html.includes('sb_secret_'),'Sem chave privada');
assert(ChartStub.plugins.some(p=>p.id==='pmo62Labels'),'Plugin visual de rótulos registrado');
function report(statusGeral,goLive){
 return {
  relatorio:{
   id:1,data_referencia:'2026-11-06',
   status_geral:statusGeral,go_live_forecast:goLive,
   objetivo:'Simular status',contexto:'Teste isolado',
   farol_escopo:'Crítico',farol_prazo:'Crítico',farol_custo:'No prazo',farol_qualidade:'Atenção',
   planejado:70,realizado:65,resumo_realizado:'Teste aprovado'
  },
  marcos:[],riscos:[],acoes:[],historico:[
   {data_referencia:'2026-10-30',planejado:60,realizado:55},
   {data_referencia:'2026-11-06',planejado:70,realizado:65}
  ]
 }
}
const host=grab('#listaResumo');
const first=w.document.createElement('div');host.appendChild(first);
w.detalheExecutivo(first,report('No prazo','2026-11-20'),{projeto:'Projeto A',gerente:'Gerente A'});
assert.equal(grab('.pmo62-adopted-status strong',first)?.textContent,'No prazo',
  'Status é o selecionado, NÃO o pior farol');
assert.match(grab('.pmo62-golive-days',first)?.textContent||'',/14 dia\(s\)/);
assert(ChartStub.instances.length>0,'Gráfico de linha do report criado');
const second=w.document.createElement('div');host.appendChild(second);
w.detalheExecutivo(second,report('Em atraso',null),{projeto:'Projeto B',gerente:'Gerente B'});
assert.equal(grab('.pmo62-adopted-status strong',second)?.textContent,'Em atraso');
assert.match(grab('.pmo62-golive-days',second)?.textContent||'',/TBD/);
assert(!errors.length,'Erros globais: '+JSON.stringify(errors));
console.log('PASS: consulta renderiza dois reports, status é estático, Go-Live correto, nenhum call stack.');
async function portfolio(){
  w.eval("usu = {id:'user_teste',email:'gerente@teste.com'}; papel = 'gerente';");
  const app=grab('#app');app.hidden=false;
  grab('#tabPortfolio').hidden=false;
  w.eval("pmoDadosPortfolio = ["+
    "{id:4,nome:'Projeto A',gerente:'Gerente A',publicado:true,relatorio:{planejado:70,realizado:65,status_geral:'No prazo'},saude:'Crítico'},"+
    "{id:5,nome:'Projeto B',gerente:'Gerente B',publicado:true,relatorio:{planejado:60,realizado:48,status_geral:'Em atraso'},saude:'Atenção'}"+
    "]");
  w.eval("filtrarPortfolio()");
  await new Promise(resolve=>setTimeout(resolve,550));
  assert(grab('#pmo62Timeline'),'Timeline criada');
  assert(grab('#pmo62Timeline canvas'),'Canvas de evolução criado');
  assert(grab('#pmo62Timeline table'),'Tabela semanal criada');
  assert.equal(grab('#pmo62ProjectView').options.length,3,'Opção consolidado e 2 projetos');
  grab('#portBusca').value='Projeto A';
  grab('#portBusca').dispatchEvent(new w.Event('input',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.equal(grab('#pmo62ProjectView').options.length,2,'Busca restringe a série');
  assert(!errors.length,'Erros globais: '+JSON.stringify(errors));
  console.log('PASS: portfólio consolidado/individual, busca com lista, valores e filtros.');
  w.close();
}
portfolio().catch(e=>{console.error(e);process.exitCode=1;w.close()});
