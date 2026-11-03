/* Teste E2E visual da V6.2 com dados fictícios e navegador Chromium. */
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const file='file://'+path.join(__dirname,'index.html');
 const chartJS=fs.readFileSync(require.resolve('chart.js/dist/chart.umd.js'),'utf8');
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{
   if(message.type()==='error'&&/maximum call stack|uncaught|unhandled/i.test(message.text()))errors.push(message.text());
 });
 await page.route('https://cdn.jsdelivr.net/npm/**',route=>{
   const u=route.request().url();
   if(u.includes('chart.js'))return route.fulfill({status:200,contentType:'application/javascript',body:chartJS});
   if(u.includes('supabase'))return route.fulfill({status:200,contentType:'application/javascript',body:'/* cliente simulado iniciado antes da página */'});
   return route.abort();
 });
 await page.addInitScript(()=>{
   const person={id:'00000000-0000-0000-0000-000000000004',email:'gp.teste@exemplo.com'};
   const reports=[
     {projeto_id:4,data_referencia:'2026-10-30',planejado:60,realizado:55},
     {projeto_id:4,data_referencia:'2026-11-06',planejado:70,realizado:65}
   ];
   const relatorio={
     id:4,data_referencia:'2026-11-06',
     objetivo:'Validação funcional',contexto:'Homologação com dados fictícios',
     status_geral:'No prazo',
     farol_escopo:'Crítico',farol_prazo:'Atenção',
     farol_custo:'No prazo',farol_qualidade:'No prazo',
     go_live_forecast:'2026-11-20',
     planejado:70,realizado:65,
     resumo_realizado:'Entrega concluída',resumo_andamento:'Testes em andamento',
     resumo_proximos:'Testar dashboard'
   };
   const dataProject={id:4,nome:'Projeto de Teste',objetivo:'Validação funcional',contexto:'Teste',
     gerente:person.email,fornecedor:'Exemplo',sponsor:'Exemplo',situacao:'Em andamento'};
   const resumo=[{projeto_id:4,projeto_nome:'Projeto de Teste',
     gerente_id:person.id,gerente_identificacao:person.email,data_referencia:'2026-11-06',
     planejado:70,realizado:65,
     farol_escopo:'Crítico',farol_prazo:'Atenção',
     farol_custo:'No prazo',farol_qualidade:'No prazo'}];
   function query(table){
     const q={
       select(){return q},eq(){return q},gte(){return q},lt(){return q},in(){return q},
       order(){return q},limit(){return q},range(){return q},
       single:async()=>({data:table==='perfis'?{papel:'gerente',ativo:true}:null,error:null}),
       then(resolve,reject){
         const data=table==='projetos'?[dataProject]
           :table==='projeto_gerentes'?[{projeto_id:4,usuario_id:person.id}]
           :table==='pmo_identidades'?[{usuario_id:person.id,nome_exibicao:'Gerente de Teste',foto_data:null}]
           :[];
         return Promise.resolve({data,error:null}).then(resolve,reject)
       }
     };return q
   }
   window.supabase={createClient:()=>({
     auth:{
       getUser:async()=>({data:{user:person},error:null}),
       signOut:async()=>({error:null})
     },
     from:query,
     rpc:async(name)=>{
       const data=name==='resumo_publicado_por_gerente'?resumo
         :name==='pmo_portfolio_status'?[{projeto_id:4,status_geral:'No prazo'}]
         :name==='pmo_portfolio_evolucao'?reports
         :name==='pmo_detalhe_publicado'?{relatorio,marcos:[],riscos:[],acoes:[],historico:reports}
         :name==='pmo_ler_relatorio_completo'?{encontrado:true,relatorio,marcos:[],riscos:[],proximos_passos:[],historico_semanal:reports}
         :[];
       return {data,error:null};
     }
   })};
 });
 await page.goto(file,{waitUntil:'load'});
 await page.waitForSelector('#app:not([hidden])',{timeout:15000});
 await page.locator('#navResumo').click();
 await page.waitForSelector('#listaResumo .pmo-slide',{timeout:15000});
 const slide=page.locator('#listaResumo .pmo-slide').first();
 assert.equal(await slide.locator('.pmo62-adopted-status strong').textContent(),'No prazo');
 assert.match(await slide.locator('.pmo62-golive-days').textContent(),/14 dia\(s\)/);
 assert(await slide.locator('canvas').count()>0,'Gráfico histórico deve existir');
 assert(await page.locator('#pmoV6Identity .pmo-v6-perfil').count()===1,'Perfil deve estar visível');
 assert(await page.locator('#pmoV6Identity .pmo-v6-avatar').isVisible(),'Foto/avatar visível');
 for(const width of [1440,820,390,320]){
   await page.setViewportSize({width,height:900});
   await page.waitForTimeout(120);
   const dimensoes=await page.evaluate(()=>({
     body:document.documentElement.scrollWidth,width:window.innerWidth,
     profile:document.querySelector('#pmoV6Identity')?.getBoundingClientRect().width||0
   }));
   assert(dimensoes.body<=width+4,
     'Rolagem horizontal inesperada em '+width+'px: documento '+dimensoes.body+'px');
   assert(dimensoes.profile>0,'Perfil deve permanecer visível em '+width+'px');
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#navPortfolio').click();
 await page.waitForSelector('#pmo62Timeline canvas',{timeout:15000});
 await page.waitForSelector('#pmo62Timeline table',{timeout:15000});
 const seriesCount=await page.locator('#pmo62Timeline table tr').count();
 assert(seriesCount>=3,'Tabela consolidada deve conter duas semanas');
 assert(await page.locator('#pmoV6PortfolioVisual canvas').count()>=2,
   'Painel deve conter gráficos de saúde e de planejado x realizado');
 await page.locator('#portBusca').fill('Projeto de Teste');
 const options=await page.locator('#pmo62Options option').count();
 assert(options>=1,'Pesquisa por lista deve funcionar');
 await page.locator('#navStatus').click();
 const status=page.locator('#sStatusGeral');
 assert.equal(await status.evaluate(el=>el.tagName),'SELECT');
 await status.selectOption('Em atraso');
 assert.equal(await status.inputValue(),'Em atraso');
 assert(!errors.some(e=>/Maximum call stack size exceeded/i.test(e)),'Erro de recursão detectado');
 assert.equal(errors.length,0,'Erros de execução: '+errors.join('; '));
 console.log('PASS: navegador real, consulta sem stack overflow, KPIs, filtro de projetos, status estático e 4 resoluções.');
 await browser.close();
})().catch(err=>{console.error(err);process.exitCode=1});
