/* PMO 6.5 | E2E: padronização global, status independente e contrastes de seleção. */
const fs=require('fs');
const path=require('path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const chartJS=fs.readFileSync(path.join(process.cwd(),'node_modules/chart.js/dist/chart.umd.js'),'utf8');
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/maximum call stack|uncaught|unhandled/i.test(m.text()))errors.push(m.text())});
 await page.route('https://cdn.jsdelivr.net/npm/**',route=>{
   const url=route.request().url();
   if(url.includes('chart.js'))return route.fulfill({status:200,contentType:'application/javascript',body:chartJS});
   if(url.includes('supabase'))return route.fulfill({status:200,contentType:'application/javascript',body:'/* Mock criado com addInitScript */'});
   return route.abort();
 });
 await page.addInitScript(()=>{
   const person={id:'00000000-0000-0000-0000-000000000004',email:'gp@exemplo.com'};
   const reports=[
     {projeto_id:4,data_referencia:'2026-10-30',planejado:60,realizado:55},
     {projeto_id:4,data_referencia:'2026-11-06',planejado:70,realizado:65},
     {projeto_id:5,data_referencia:'2026-10-30',planejado:80,realizado:75},
     {projeto_id:5,data_referencia:'2026-11-06',planejado:90,realizado:72}
   ];
   const details=id=>({
     relatorio:{
       id,data_referencia:'2026-11-06',objetivo:'Validação fictícia',
       contexto:'Teste de homologação sem acesso à produção',
       status_geral:id===4?'No prazo':'Em atraso',
       farol_escopo:id===4?'Crítico':'Não avaliado',
       farol_prazo:'Atenção',farol_custo:'No prazo',farol_qualidade:'Não avaliado',
       go_live_forecast:'2026-11-20',planejado:id===4?70:90,realizado:id===4?65:72,
       resumo_realizado:'Atividade concluída',resumo_andamento:'Pendente homologação',resumo_proximos:'Revisão visual'
     },marcos:[],riscos:[],acoes:[],historico:id===5
       ? reports.filter(x=>x.projeto_id===5&&x.data_referencia==='2026-11-06')
       : reports.filter(x=>x.projeto_id===id)
   });
   const projetos=[
     {id:4,nome:'Projeto A',objetivo:'Validação A',gerente:person.email,situacao:'Em andamento'},
     {id:5,nome:'Projeto B',objetivo:'Validação B',gerente:person.email,situacao:'Em andamento'}
   ];
   const summary=projetos.map(p=>({
     projeto_id:p.id,projeto_nome:p.nome,gerente_id:person.id,
     gerente_identificacao:person.email,data_referencia:'2026-11-06',
     planejado:p.id===4?70:90,realizado:p.id===4?65:72,
     farol_escopo:p.id===4?'Crítico':'Não avaliado',farol_prazo:'Atenção',
     farol_custo:'No prazo',farol_qualidade:'Não avaliado'
   }));
   let logged=false;
   function query(table){
     const obj={
       select(){return obj},eq(){return obj},in(){return obj},order(){return obj},
       gte(){return obj},lt(){return obj},range(){return obj},
       limit(){return obj},
       single:async()=>({data:table==='perfis'?{papel:'gerente',ativo:true,primeiro_acesso_pendente:false}:null,error:null}),
       then(resolve,reject){
         const data=table==='projetos'?projetos
           :table==='projeto_gerentes'?projetos.map(p=>({projeto_id:p.id,usuario_id:person.id}))
           :table==='pmo_identidades'?[{usuario_id:person.id,nome_exibicao:'GP de Homologação',foto_data:null}]
           :[];
         return Promise.resolve({data,error:null}).then(resolve,reject)
       }
     };return obj;
   }
   window.supabase={createClient:(_url,_key,options)=>{
     window.__pmo63Options=options;
     return {
       auth:{
         getUser:async()=>({data:{user:logged?person:null},error:null}),
         signInWithPassword:async c=>{
           if(c.password!=='TesteFicticio@123')return {data:null,error:{message:'Credenciais inválidas'}};
           logged=true;return {data:{user:person},error:null};
         },
         signOut:async()=>{logged=false;return {error:null}}
       },
       from:query,
       rpc:async(name,args)=>{
         let data=[];
         if(name==='resumo_publicado_por_gerente')data=summary;
         if(name==='pmo_portfolio_status')data=[{projeto_id:4,status_geral:'No prazo'},{projeto_id:5,status_geral:'Em atraso'}];
         if(name==='pmo_portfolio_evolucao')data=reports;
         if(name==='pmo_detalhe_publicado')data=details(Number(args?.p_projeto_id)||4);
         if(name==='pmo_ler_relatorio_completo')data={encontrado:true,relatorio:details(Number(args?.p_projeto_id)||4).relatorio,
           marcos:[],riscos:[],proximos_passos:[],historico_semanal:reports.filter(x=>x.projeto_id===Number(args?.p_projeto_id))};
         return {data,error:null};
       }
     };
   }};
 });
 await page.goto('file://'+path.join(__dirname,'index.html'),{waitUntil:'load'});
 await page.waitForSelector('#loginBox:not([hidden])',{timeout:15000});
 assert(await page.locator('#app').isHidden(),'Acesso não entra diretamente na área logada');
 assert.equal(await page.evaluate(()=>window.__pmo63Options?.auth?.persistSession),false,'Não persistir sessão');
 await page.locator('#email').fill('gp@exemplo.com');
 await page.locator('#senha').fill('TesteFicticio@123');
 await page.locator('#loginBtn').click();
 await page.waitForSelector('#app:not([hidden])',{timeout:15000});
 await page.locator('#navResumo').click();
 await page.waitForSelector('#listaResumo .pmo-slide',{timeout:15000});
 const slide=page.locator('#listaResumo .pmo-slide').first();
 assert.equal(await slide.locator('.pmo62-adopted-status strong').textContent(),'No prazo',
   'Status declarado prevalece sobre farol Crítico');
 assert.match(await slide.locator('.pmo62-golive-days').textContent(),/14 dia\(s\)/);
 assert(await slide.locator('.pmo63-history canvas').count()===1);
 assert(await slide.locator('.pmo63-history table').count()===1,'Linha de evolução com percentuais e datas');
 assert(await slide.locator('.pmo65-chart-legend').count()===1,
   'Duas semanas usam legenda externa e contrastante');
 const chartKeys=await slide.locator('.pmo65-chart-legend').textContent();
 assert(chartKeys.includes('Planejado') && chartKeys.includes('Realizado'),'Legenda de linhas completa');
 const order=await slide.evaluate(el=>{
   const children=[...el.children];
   const last=children.at(-1);
   return {lastIsHistory:last?.classList.contains('slide-evolucao'),
     afterTables:children.indexOf(el.querySelector('.slide-evolucao'))>children.indexOf(el.querySelector('.slide-tabelas')),
     afterSummary:children.indexOf(el.querySelector('.slide-evolucao'))>children.indexOf(el.querySelector('.slide-resumos'))};
 });
 assert(order.lastIsHistory && order.afterTables && order.afterSummary,'Evolução deve estar no final do report');
 const palette=await page.evaluate(()=>{
   const body=getComputedStyle(document.body);
   const head=getComputedStyle(document.querySelector('header'));
   return {color:body.color,scheme:getComputedStyle(document.documentElement).colorScheme,
      bg:body.backgroundImage,header:head.backgroundImage};
 });
 assert.equal(palette.scheme,'light','Nova interface usa campo e paleta clara');
 assert(palette.bg.includes('gradient'),'Parallax de fundo preservado');
 assert(palette.header.includes('gradient'),'Cabeçalho contrastante azul');

 for(const width of [1440,1024,820,390,320]){
   await page.setViewportSize({width,height:850});
   await page.waitForTimeout(90);
   const metrics=await page.evaluate(()=>({
     width:window.innerWidth,scroll:document.documentElement.scrollWidth,
     identity:document.querySelector('#pmoV6Identity')?.getBoundingClientRect().width||0
   }));
   assert(metrics.scroll<=width+6,'Rolagem horizontal da página em '+width+': '+metrics.scroll);
   assert(metrics.identity>0,'Perfil visível em '+width);
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#navPortfolio').click();
 await page.waitForSelector('#pmo63Dashboard .pmo63-chart-grid canvas',{timeout:15000});
 await page.waitForSelector('#pmo63Dashboard .pmo63-timeline-values table',{timeout:15000});
 assert.equal((await page.locator('#portKpis strong').first().textContent()).trim(),'2');
 assert.equal((await page.locator('#pmo63Dashboard .pmo63-kpi-value').first().textContent()).trim(),'2');
 assert((await page.locator('#pmo63Dashboard canvas').count())>=5,'Pelo menos 5 gráficos');
 assert((await page.locator('#pmo63Dashboard .pmo63-panel').count())>=6,'Múltiplas visões gerenciais');
 await page.locator('#portBusca').fill('Projeto A');
 await page.waitForFunction(()=>document.querySelector('#pmo63Dashboard .pmo63-kpi-value')?.textContent==='1');
 assert.equal((await page.locator('#portKpis strong').first().textContent()).trim(),'1');
 assert.equal(await page.locator('#pmo63TimelineSelect option').count(),2);
 assert.equal(await page.locator('#pmo63Projects option').count(),2,'Lista digitável de projetos');
 await page.locator('#portLimpar').click();
 await page.waitForFunction(()=>document.querySelector('#pmo63Dashboard .pmo63-kpi-value')?.textContent==='2');
 await page.locator('#portLinhas tr').last().locator('button').click();
 await page.waitForFunction(()=>document.querySelector('#pmo63Dashboard .pmo63-kpi-value')?.textContent==='1');
 assert.equal(await page.locator('#portBusca').inputValue(),'Projeto B','Ver slide fixa filtro do projeto');
 assert(await page.locator('#portDetalhe .pmo-slide').count()===1,'Ver slide carrega sem recursão');
 const focusReport=page.locator('#portDetalhe .pmo-slide');
 assert(await focusReport.locator('.pmo64-semana-unica').count()===1,'Uma única semana usa comparação em barras');
 assert(await focusReport.locator('.pmo63-history canvas').count()===0,'Um ponto isolado não gera linha e eixo vazios');
 assert(await focusReport.locator('.pmo64-semana-linha').count()===2,'Duas barras de percentuais');
 assert.match(await focusReport.locator('.pmo64-semana-ref').textContent(),/06\/11\/2026/);
 const cards=focusReport.locator('.pmo64-semana-linha');
 assert.match(await cards.first().textContent(),/90%/);
 assert.match(await cards.last().textContent(),/72%/);
 assert.match(await focusReport.locator('.pmo64-semana-desvio').textContent(),/-18 p\.p\./);
 const orderSingle=await focusReport.evaluate(el=>el.children[el.children.length-1].classList.contains('slide-evolucao'));
 assert.equal(orderSingle,true,'Evolução no rodapé também em único registro');

 await page.locator('#navStatus').click();
 await page.locator('#sProjeto').selectOption('4');
 await page.waitForFunction(()=>!document.querySelector('#sStatusGeral')?.disabled,{timeout:15000});
 const choices=await page.locator('#sStatusGeral option').evaluateAll(opts=>opts.map(x=>x.value));
 assert(await page.locator('#pmoV6FarolPanel').isVisible(),'Quatro cartões e legenda estão visíveis');
 assert.equal(await page.locator('#pmoV6FarolPanel .pmo-v6-farol-card').count(),4);
 assert.equal(await page.locator('#pmoV6FarolPanel .pmo-v6-farol-geral').count(),0,
   'Faixa de saúde consolidada removida');
 assert.equal(await page.locator('#sFarolGeral').count(),0,
   'Campo do antigo farol geral não existe');
 assert(!(await page.locator('#pmoV6FarolPanel').textContent()).includes('pior dimensão'));
 const shades=await page.locator('#sStatusGeral').evaluate(el=>{
   const style=getComputedStyle(el);
   const choice=el.options[0];
   return {foreground:style.color,bg:style.backgroundColor,
     optForeground:getComputedStyle(choice).color,
     optBg:getComputedStyle(choice).backgroundColor,
     scheme:style.colorScheme};
 });
 assert.equal(shades.bg,'rgb(255, 255, 255)','Select de Status Geral com fundo branco');
 assert.notEqual(shades.foreground,'rgb(255, 255, 255)','Texto do Status Geral não pode ser branco sobre branco');
 assert.notEqual(shades.optForeground,shades.optBg,'Cor das opções deve contrastar');
 assert.equal(shades.scheme,'light','Menu nativo deve usar tema claro');

 assert.deepEqual(choices,['Não avaliado','No prazo','Atenção','Crítico']);
 for(const id of ['sEscopo','sPrazo','sCusto','sQualidade']){
   assert.equal(await page.locator('#'+id+' option').count(),4);
 }
 await page.locator('#sStatusGeral').selectOption('Atenção');
 assert.equal(await page.locator('#sStatusGeral').inputValue(),'Atenção');
 await page.locator('#sEscopo').selectOption('Crítico');
 await page.locator('#sPrazo').selectOption('Não avaliado');
 assert.equal(await page.locator('#sStatusGeral').inputValue(),'Atenção',
   'Status Geral permanece definido pelo gerente, não pelo farol mais crítico');
 for(const id of ['sEscopo','sPrazo','sCusto','sQualidade']){
   const colors=await page.locator('#'+id).evaluate(el=>{
     const st=getComputedStyle(el);
     return {bg:st.backgroundColor,color:st.color,optColor:getComputedStyle(el.options[0]).color};
   });
   assert.equal(colors.bg,'rgb(255, 255, 255)',id+' fundo padronizado');
   assert.notEqual(colors.color,'rgb(255, 255, 255)',id+' texto legível');
 }

 assert(!errors.length,'Erros JavaScript: '+errors.join('; '));
 console.log('PASS: login, um/dois relatórios, legenda, contraste real de menus, Status Geral independente, filtros e 5 larguras.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
