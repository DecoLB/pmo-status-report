/* PMO V6.2 | UX isolada, sem sobrescrever funções de relatórios */
(() => {
"use strict";
const byId=id=>document.getElementById(id);
const elem=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined&&txt!==null)e.textContent=String(txt);if(cls)e.className=cls;return e};
const signal=v=>v==="No prazo"?"verde":v==="Atenção"?"amarelo":["Crítico","Em atraso","Bloqueado"].includes(v)?"vermelho":"cinza";
const dims=["sEscopo","sPrazo","sCusto","sQualidade"];
const fmt=n=>Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
const val=n=>n===null||n===undefined||n===""||!Number.isFinite(Number(n))?null:Number(n);
let historyCache=null,historyRequest=null,chart=null,renderTimer=0,requestId=0;

function syncSignalColors(){
  dims.forEach(id=>{
    const select=byId(id);
    const label=select?.closest("label");
    if(label){label.classList.add("pmo62-signal-label");label.dataset.tone=signal(select.value)}
  });
  document.querySelectorAll("#pmoV6FarolPanel .pmo-v6-farol-card").forEach((card,i)=>{
    card.dataset.tone=signal(byId(dims[i])?.value);
  });
}
function installSignals(){
  dims.forEach(id=>byId(id)?.addEventListener("change",syncSignalColors));
  const container=byId("tabStatus");
  if(container){
    const observer=new MutationObserver(()=>syncSignalColors());
    observer.observe(container,{childList:true,subtree:true});
  }
  syncSignalColors();
}
function installParallax(){
  if(!window.matchMedia||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  let req=0,coords={x:18,y:20};
  window.addEventListener("pointermove",event=>{
    if(event.pointerType==="touch")return;
    coords={x:Math.round(event.clientX/window.innerWidth*100),y:Math.round(event.clientY/window.innerHeight*100)};
    if(req)return;
    req=requestAnimationFrame(()=>{
      document.body.style.setProperty("--pmo62-x",coords.x+"%");
      document.body.style.setProperty("--pmo62-y",coords.y+"%");
      req=0;
    });
  },{passive:true});
}

/* Rótulos de valores desenhados apenas sobre o canvas.
   Nenhum chart.update() é chamado dentro de hooks, evitando recursão. */
const chartLabels={
  id:"pmo62Labels",
  afterDatasetsDraw(c){
    if(!c?.canvas?.closest("#tabResumo,#tabPortfolio"))return;
    const type=c.config.type,ctx=c.ctx,ds=c.data?.datasets||[];
    const area=c.chartArea;if(!area)return;
    ctx.save();
    ctx.font="700 10px Arial,sans-serif";
    ctx.textBaseline="middle";
    ctx.textAlign="center";
    const badge=(x,y,label,dark=true)=>{
      if(!Number.isFinite(x)||!Number.isFinite(y))return;
      const width=ctx.measureText(label).width+12,height=18;
      const xx=Math.min(area.right-width/2,Math.max(area.left+width/2,x));
      const yy=Math.min(area.bottom-height/2,Math.max(area.top+height/2,y));
      ctx.fillStyle=dark?"#17323de8":"#eef5f8ee";
      ctx.beginPath();
      if(typeof ctx.roundRect==="function")ctx.roundRect(xx-width/2,yy-height/2,width,height,5);
      else ctx.rect(xx-width/2,yy-height/2,width,height);
      ctx.fill();ctx.fillStyle=dark?"#ffffff":"#142d3b";ctx.fillText(label,xx,yy);
    };
    if(type==="doughnut"){
      const rows=ds[0]?.data||[],total=rows.reduce((s,x)=>s+(val(x)||0),0);
      (c.getDatasetMeta(0)?.data||[]).forEach((arc,i)=>{
        const n=val(rows[i]);if(n===null||n<=0||!total)return;
        const mid=(arc.startAngle+arc.endAngle)/2;
        const r=(arc.innerRadius+arc.outerRadius)/2;
        badge(arc.x+Math.cos(mid)*r,arc.y+Math.sin(mid)*r,
          fmt(n)+" ("+Math.round(n/total*100)+"%)");
      });
      if(total&&c.getDatasetMeta(0)?.data?.[0]){
        const arc=c.getDatasetMeta(0).data[0];
        ctx.fillStyle="#f8fdff";ctx.font="800 19px Arial";ctx.fillText(fmt(total),arc.x,arc.y);
      }
    }else if(type==="line"||type==="bar"){
      ds.forEach((dataSet,index)=>{
        if(!c.isDatasetVisible(index))return;
        const points=c.getDatasetMeta(index)?.data||[];
        points.forEach((point,i)=>{
          const n=val(dataSet.data[i]);if(n===null||point.skip)return;
          const isSlide=Boolean(c.canvas.closest(".pmo-slide"));
          const y=type==="line" ? point.y+(index===0?-19:20) : point.y-14;
          badge(point.x,y,fmt(n)+"%",!isSlide);
        });
      });
    }
    ctx.restore();
  }
};
function registerChartLabels(){
  if(!window.Chart)return;
  if(Chart.registry?.plugins?.get?.("pmo62Labels"))return;
  Chart.register(chartLabels);
}
function chartHistoryNote(){
  const charts=[...document.querySelectorAll("#tabResumo .slide-evolucao .pmo-grafico")];
  charts.forEach(el=>{
    const wrap=el.closest(".slide-evolucao");
    if(!wrap||wrap.querySelector(".pmo62-chart-note"))return;
    const label=elem("p","Linha azul: Planejado | Linha laranja: Realizado. Datas de referência no eixo horizontal e percentuais nos pontos.","pmo62-chart-note");
    wrap.appendChild(label);
  });
}

/* Pesquisa por texto ou lista, sempre baseada em projetos já autorizados */
function datalistProjects(){
  const input=byId("portBusca");if(!input)return;
  let list=byId("pmo62Options");
  if(!list){
    list=document.createElement("datalist");list.id="pmo62Options";
    input.insertAdjacentElement("afterend",list);
    input.setAttribute("list","pmo62Options");
    input.setAttribute("autocomplete","off");
    input.placeholder="Selecione na lista ou digite";
  }
  const all=typeof pmoDadosPortfolio!=="undefined"&&Array.isArray(pmoDadosPortfolio)?pmoDadosPortfolio:[];
  const nomes=[...new Set(all.map(x=>x.nome).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  if(list.options.length===nomes.length&&[...list.options].every((o,i)=>o.value===nomes[i]))return;
  list.replaceChildren();
  nomes.forEach(nome=>{const o=document.createElement("option");o.value=nome;list.appendChild(o)});
}
function activePortfolio(){
  if(typeof pmoDadosPortfolio==="undefined"||!Array.isArray(pmoDadosPortfolio))return [];
  const v=id=>byId(id)?.value||"";
  const term=v("portBusca").toLocaleLowerCase("pt-BR");
  return pmoDadosPortfolio.filter(x=>
    (!term||String(x.nome).toLocaleLowerCase("pt-BR").includes(term))&&
    (!v("portGerente")||x.gerente===v("portGerente"))&&
    (!v("portSaude")||x.saude===v("portSaude"))&&
    (!v("portStatus")||(x.relatorio?.status_geral||"TBD")===v("portStatus"))&&
    (!v("portPublicado")||(v("portPublicado")==="sim"?x.publicado:!x.publicado))
  );
}
function ensureTimeline(){
  let root=byId("pmo62Timeline");
  if(root)return root;
  const portfolio=byId("tabPortfolio");
  if(!portfolio)return null;
  const card=portfolio.querySelector(".card")||portfolio;
  root=elem("section",null,"pmo62-timeline");root.id="pmo62Timeline";
  root.appendChild(elem("h3","Evolução semanal do portfólio | Planejado x Realizado"));
  const desc=elem("p","Consolidado: média simples dos percentuais informados pelos projetos publicados na semana. Não é avanço ponderado.","pmo62-description");
  root.appendChild(desc);
  const bar=elem("div",null,"pmo62-timeline-toolbar");
  const label=elem("label","Selecione a visão");
  const select=document.createElement("select");select.id="pmo62ProjectView";
  select.addEventListener("change",()=>scheduleTimeline());
  label.appendChild(select);bar.appendChild(label);
  const legend=elem("div",null,"pmo62-time-legend");
  for(const [nome,cor] of [["Planejado","#68b7dc"],["Realizado","#f58b17"]]){
    const item=elem("span");
    const dot=document.createElement("i");dot.style.background=cor;item.append(dot,document.createTextNode(nome));
    legend.appendChild(item);
  }
  bar.appendChild(legend);root.appendChild(bar);
  const graph=elem("div",null,"pmo62-timeline-plot");graph.appendChild(document.createElement("canvas"));root.appendChild(graph);
  root.appendChild(elem("div",null,"pmo62-timeline-table"));
  card.appendChild(root);return root;
}
async function publishedHistory(refresh=false){
  if(refresh){historyCache=null;historyRequest=null}
  if(historyCache)return historyCache;
  if(!historyRequest){
    if(typeof db==="undefined"||!db)throw Error("Sessão ainda não disponível");
    historyRequest=db.rpc("pmo_portfolio_evolucao").then(response=>{
      if(response.error)throw response.error;
      historyCache=Array.isArray(response.data)?response.data:[];
      historyRequest=null;return historyCache;
    }).catch(error=>{historyRequest=null;throw error});
  }
  return historyRequest;
}
function weeklySeries(rows,picked){
  const byWeek=new Map();
  rows.forEach(r=>{
    if(picked!=="all"&&String(r.projeto_id)!==picked)return;
    const week=semanaInicio(r.data_referencia);
    if(!byWeek.has(week))byWeek.set(week,new Map());
    const items=byWeek.get(week),key=String(r.projeto_id);
    const old=items.get(key);
    if(!old||String(r.data_referencia)>String(old.data_referencia))items.set(key,r);
  });
  return [...byWeek.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
    .slice(-26).map(([week,p])=>{
      const list=[...p.values()];
      const a=list.map(x=>val(x.planejado)).filter(x=>x!==null);
      const b=list.map(x=>val(x.realizado)).filter(x=>x!==null);
      const avg=x=>x.length?+(x.reduce((s,v)=>s+v,0)/x.length).toFixed(1):null;
      return {data:week,planejado:avg(a),realizado:avg(b),nPlan:a.length,nReal:b.length};
    });
}
function timelineTable(root,points,consolidated){
  const box=root.querySelector(".pmo62-timeline-table");box.replaceChildren();
  if(!points.length){box.appendChild(elem("p","Sem semanas publicadas para os filtros selecionados.","pmo62-empty"));return}
  const table=document.createElement("table");
  const header=document.createElement("tr");
  for(const col of ["Semana","Planejado","Realizado",...(consolidated?["Projetos com planejado","Projetos com realizado"]:[])])
    header.appendChild(elem("th",col));
  table.appendChild(header);
  points.forEach(p=>{
    const row=document.createElement("tr");
    const cells=[dataBR(p.data),p.planejado===null?"TBD":fmt(p.planejado)+"%",p.realizado===null?"TBD":fmt(p.realizado)+"%",
      ...(consolidated?[p.nPlan,p.nReal]:[])];
    cells.forEach(v=>row.appendChild(elem("td",v)));
    table.appendChild(row);
  });
  box.appendChild(table);
}
function timelineChart(root,points){
  const canvas=root.querySelector("canvas");
  if(chart){chart.destroy();chart=null}
  if(!window.Chart){root.querySelector(".pmo62-timeline-table").textContent="Gráficos indisponíveis: Chart.js não carregado.";return}
  if(!points.length){canvas.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);return}
  chart=new Chart(canvas,{type:"line",data:{
    labels:points.map(p=>dataBR(p.data)),
    datasets:[
      {label:"Planejado",data:points.map(p=>p.planejado),borderColor:"#68b7dc",backgroundColor:"#68b7dc",borderWidth:3,pointRadius:5,pointHoverRadius:8,spanGaps:false,tension:.25},
      {label:"Realizado",data:points.map(p=>p.realizado),borderColor:"#f58b17",backgroundColor:"#f58b17",borderWidth:3,pointRadius:5,pointHoverRadius:8,spanGaps:false,tension:.25}
    ]},options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{top:25,bottom:10,left:10,right:10}},
      plugins:{legend:{display:true,position:"top",labels:{color:"#f5faff",usePointStyle:true,font:{weight:"bold"},padding:18}},
        tooltip:{callbacks:{label:item=>{
          const p=points[item.dataIndex],count=item.datasetIndex===0?p.nPlan:p.nReal;
          return item.dataset.label+": "+(item.parsed.y===null?"TBD":fmt(item.parsed.y)+"%")+" | "+count+" projeto(s) com valor";
        }}}},
      scales:{x:{ticks:{color:"#dce9f2",maxRotation:40},grid:{color:"#ffffff14"}},
        y:{min:0,max:100,ticks:{color:"#dce9f2",callback:n=>n+"%"},grid:{color:"#ffffff20"}}}
    }});
}
function scheduleTimeline(refresh=false){
  clearTimeout(renderTimer);
  renderTimer=window.setTimeout(()=>void renderTimeline(refresh),140);
}
async function renderTimeline(refresh=false){
  const tab=byId("tabPortfolio");
  if(!tab||tab.hidden||!byId("app")||byId("app").hidden)return;
  const root=ensureTimeline();if(!root)return;
  datalistProjects();
  const selected=activePortfolio(),ids=new Set(selected.filter(x=>x.publicado).map(x=>String(x.id)));
  const select=root.querySelector("#pmo62ProjectView"),previous=select.value;
  select.replaceChildren(new Option("Todos os projetos filtrados | Consolidado","all"));
  selected.filter(x=>x.publicado).forEach(p=>select.add(new Option(p.nome,String(p.id))));
  select.value=[...select.options].some(o=>o.value===previous)?previous:"all";
  const myId=++requestId;
  try{
    const rows=(await publishedHistory(refresh)).filter(x=>ids.has(String(x.projeto_id)));
    if(myId!==requestId)return;
    const consolidated=select.value==="all",points=weeklySeries(rows,select.value);
    const description=root.querySelector(".pmo62-description");
    description.textContent=consolidated
      ?"Consolidado dos projetos filtrados: média semanal simples dos percentuais publicados. Não representa a soma dos avanços."
      :"Projeto selecionado: percentuais semanais publicados, sem preencher dados ausentes.";
    timelineChart(root,points);timelineTable(root,points,consolidated);
  }catch(error){
    if(myId!==requestId)return;
    const box=root.querySelector(".pmo62-timeline-table");
    box.replaceChildren(elem("p","Não foi possível carregar a evolução: "+error.message,"pmo62-empty"));
  }
}
function installTimeline(){
  const tbody=byId("portLinhas");
  if(tbody){
    const observer=new MutationObserver(()=>scheduleTimeline());
    observer.observe(tbody,{childList:true});
  }
  for(const id of ["portBusca","portGerente","portSaude","portStatus","portPublicado"]){
    const el=byId(id);
    el?.addEventListener(id==="portBusca"?"input":"change",()=>scheduleTimeline());
  }
  byId("portAtualizar")?.addEventListener("click",()=>scheduleTimeline(true));
  datalistProjects();
}
function start(){
  registerChartLabels();installSignals();installParallax();installTimeline();
  const reports=byId("listaResumo");
  if(reports)new MutationObserver(()=>chartHistoryNote()).observe(reports,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
else start();
})();
