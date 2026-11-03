/* PMO V6.1 — extensão da homologação, sem modificar salvamento/RLS */
(() => {
  "use strict";
  const get=id=>document.getElementById(id);
  const make=(tag,text="",cls="")=>{const x=document.createElement(tag);if(cls)x.className=cls;x.textContent=String(text??"");return x};
  const dims=[["sEscopo","Escopo"],["sPrazo","Prazo"],["sCusto","Custo"],["sQualidade","Qualidade"]];
  let seriePromise=null,serieEpoch=0,grafSerie=null;
  const tone=v=>v==="Crítico"?"vermelho":v==="Atenção"?"amarelo":v==="No prazo"?"verde":"cinza";
  const number=v=>v==null||v===""||!Number.isFinite(Number(v))?null:Number(v);
  const pt=(n,d=0)=>Number(n).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:1});
  const br=s=>s?dataBR(s):"TBD";
  const diffDays=(a,b)=>{
    if(!a||!b)return null;
    const x=new Date(a+"T12:00:00"),y=new Date(b+"T12:00:00");
    return Number.isFinite(+x)&&Number.isFinite(+y)?Math.round((x-y)/86400000):null;
  };
  const reportFarol=r=>{
    const f=[r?.farol_escopo,r?.farol_prazo,r?.farol_custo,r?.farol_qualidade];
    if(f.includes("Crítico"))return "Crítico";
    if(f.includes("Atenção"))return "Atenção";
    if(f.some(x=>!x||x==="TBD"||x==="Não avaliado"))return "TBD";
    if(f.every(x=>x==="N/A"))return "N/A";
    return f.every(x=>x==="N/A"||x==="No prazo")?"No prazo":"TBD";
  };

  function syncSignals(){
    dims.forEach(([id])=>{
      const sel=get(id); if(!sel)return;
      const label=sel.closest("label");if(!label)return;
      label.classList.add("pmo61-signal-label");
      label.dataset.tone=tone(sel.value);
    });
    const box=get("pmoV6FarolPanel");
    if(box){
      box.querySelectorAll(".pmo-v6-farol-card").forEach((card,i)=>{
        card.dataset.tone=tone(get(dims[i]?.[0])?.value);
      });
      const general=box.querySelector(".pmo-v6-farol-geral");
      if(general) general.dataset.tone=tone(farolGeral());
    }
  }
  function decorateSlide(parent,pacote){
    const r=pacote?.relatorio,geral=parent?.querySelector(".pmo-slide .slide-geral");
    if(!r||!geral)return;
    const f=reportFarol(r),date=r.go_live_forecast||r.go_live_baseline;
    const days=diffDays(date,r.data_referencia);
    geral.replaceChildren();
    geral.appendChild(make("small","FAROL ADOTADO / STATUS GERAL"));
    const signal=make("div","","pmo61-slide-signal");
    signal.appendChild(make("i","","pmo61-dot "+tone(f)));
    signal.appendChild(make("span",f==="TBD"?"Sem avaliação":f));
    geral.appendChild(signal);
    geral.appendChild(make("small","Status informado: "+(r.status_geral||"TBD"),"pmo61-status-text"));
    geral.appendChild(make("small","Report: "+br(r.data_referencia),"pmo61-report-sub"));
    const info=make("span","","pmo61-golive"+(days==null?" pendente":""));
    if(days==null){
      info.textContent="Dias para Go-Live: TBD (sem data baseline/forecast)";
    }else{
      info.textContent=days>=0
        ?pt(days)+" dia(s) para Go-Live"
        :pt(Math.abs(days))+" dia(s) após o Go-Live previsto";
      info.title="Go-Live: "+br(date)+" | Referência do report: "+br(r.data_referencia);
    }
    geral.appendChild(info);
    if(date) geral.appendChild(make("small","Data prevista: "+br(date),"pmo61-report-sub"));
  }

  const valueLabels={
    id:"pmo61ValueLabels",
    afterDatasetsDraw(chart,_args,config){
      if(config?.enabled!==true||chart.getDatasetMeta==null)return;
      const type=chart.config.type,ctx=chart.ctx;
      ctx.save();
      const size=type==="doughnut"?12:10;
      ctx.font="700 "+size+"px system-ui, Arial, sans-serif";
      ctx.textBaseline="middle";ctx.textAlign="center";
      chart.data.datasets.forEach((ds,idx)=>{
        if(!chart.isDatasetVisible(idx))return;
        const meta=chart.getDatasetMeta(idx);
        meta.data.forEach((point,i)=>{
          const n=number(ds.data[i]);if(n===null)return;
          if(type==="doughnut"&&n===0)return;
          const pos=point.tooltipPosition();
          if(!Number.isFinite(pos.x)||!Number.isFinite(pos.y))return;
          const label=type==="doughnut"?String(n):type==="bar"&&!String(ds.label).match(/planejado|realizado/i)?pt(n):pt(n,0)+"%";
          const w=ctx.measureText(label).width+11,h=17;
          const xx=Math.min(chart.width-w/2-3,Math.max(w/2+3,pos.x));
          let yy=pos.y;
          if(type==="line")yy+=idx===0?-17:17;
          if(type==="bar")yy-=13;
          yy=Math.max(chart.chartArea.top+h/2,Math.min(chart.chartArea.bottom-h/2,yy));
          ctx.fillStyle=type==="doughnut"?(idx===1?"#1b2f46":"#0d2033"):"#15283ee8";
          ctx.beginPath();ctx.roundRect(xx-w/2,yy-h/2,w,h,5);ctx.fill();
          ctx.fillStyle=type==="doughnut"&&idx===1?"#16263b":"#fff";
          ctx.fillText(label,xx,yy+.3);
        });
      });
      ctx.restore();
    }
  };
  function enableLabels(canvas){
    if(!window.Chart||!canvas)return;
    const c=Chart.getChart(canvas);if(!c)return;
    const light=Boolean(canvas.closest(".pmo-slide"));
    c.options.plugins=c.options.plugins||{};
    c.options.plugins.pmo61ValueLabels={enabled:true};
    if(c.config.type==="line"){
      c.options.plugins.tooltip={
        callbacks:{
          title:items=>items[0]?.label||"",
          label:item=>item.dataset.label+": "+(item.parsed?.y==null?"TBD":pt(item.parsed.y)+"%")
        }
      };
      if(c.options.scales?.x?.ticks)c.options.scales.x.ticks.color=light?"#24466a":"#e6f1ff";
      if(c.options.scales?.y?.ticks)c.options.scales.y.ticks.color=light?"#24466a":"#e6f1ff";
      if(c.options.plugins.legend?.labels)c.options.plugins.legend.labels.color=light?"#1c4168":"#e6f1ff";
      c.data.datasets.forEach((ds,i)=>{ds.borderWidth=3;ds.pointRadius=5;ds.pointHoverRadius=8;ds.tension=.25;ds.borderColor=i===0?"#4c7ec5":"#f58200";ds.pointBackgroundColor=ds.borderColor});
    }
    c.update("none");
  }
  function enhanceCharts(){
    document.querySelectorAll("#tabResumo canvas, #tabPortfolio canvas").forEach(enableLabels);
  }
  function annotateHistory(container,records){
    const data=(records||[]).filter(x=>x.planejado!=null||x.realizado!=null)
      .slice().sort((a,b)=>String(a.data_referencia).localeCompare(String(b.data_referencia))).slice(-12);
    if(!data.length)return;
    container.querySelectorAll(":scope > .pmo61-chart-meta, :scope > .pmo61-chart-table").forEach(x=>x.remove());
    const graph=container.querySelector(".pmo-grafico");
    if(graph){
      const height=parseInt(graph.style.height||"0",10);
      if(height&&height<195)graph.style.height="195px";
      enableLabels(graph.querySelector("canvas"));
    }
    const note=make("div","Linha azul: planejado | Linha laranja: realizado | Datas correspondem à referência semanal.","pmo61-chart-meta");
    container.appendChild(note);
    const scroller=make("div","","pmo61-chart-table");
    const table=document.createElement("table");
    const head=document.createElement("tr");
    head.appendChild(make("th","Semana"));
    data.forEach(x=>head.appendChild(make("th",br(x.data_referencia))));
    table.appendChild(head);
    for(const [label,key] of [["Planejado","planejado"],["Realizado","realizado"]]){
      const tr=document.createElement("tr");tr.appendChild(make("th",label));
      data.forEach(x=>tr.appendChild(make("td",number(x[key])==null?"TBD":pt(x[key])+"%")));
      table.appendChild(tr);
    }
    scroller.appendChild(table);container.appendChild(scroller);
  }
  function matchPortfolio(){
    if(typeof pmoDadosPortfolio==="undefined"||!Array.isArray(pmoDadosPortfolio))return [];
    const val=id=>get(id)?.value||"";
    const term=val("portBusca").toLocaleLowerCase("pt-BR");
    return pmoDadosPortfolio.filter(p=>
      (!term||p.nome.toLocaleLowerCase("pt-BR").includes(term))&&
      (!val("portGerente")||p.gerente===val("portGerente"))&&
      (!val("portSaude")||p.saude===val("portSaude"))&&
      (!val("portStatus")||(p.relatorio?.status_geral||"TBD")===val("portStatus"))&&
      (!val("portPublicado")||(val("portPublicado")==="sim"?p.publicado:!p.publicado))
    );
  }
  function autocomplete(){
    const input=get("portBusca");if(!input)return;
    let datalist=get("pmo61ProjetosLista");
    if(!datalist){
      datalist=document.createElement("datalist");datalist.id="pmo61ProjetosLista";
      input.insertAdjacentElement("afterend",datalist);
      input.setAttribute("list",datalist.id);
      input.setAttribute("autocomplete","off");
      input.placeholder="Escolha na lista ou digite";
      input.classList.add("pmo61-project-datalist");
    }
    const projetos=typeof pmoDadosPortfolio!=="undefined"&&Array.isArray(pmoDadosPortfolio)?pmoDadosPortfolio:[];
    datalist.replaceChildren();
    [...new Set(projetos.map(p=>p.nome))].sort((a,b)=>a.localeCompare(b,"pt-BR"))
      .forEach(n=>{const opt=document.createElement("option");opt.value=n;datalist.appendChild(opt)});
  }
  async function fetchSeries(refresh=false){
    if(refresh||!seriePromise)seriePromise=db.rpc("pmo_portfolio_evolucao").then(res=>{
      if(res.error)throw res.error;
      return Array.isArray(res.data)?res.data:[];
    }).catch(err=>{seriePromise=null;throw err});
    return seriePromise;
  }
  function aggregateSeries(source,selected,projectName){
    const rows=source.filter(x=>String(x.projeto_id)===String(selected)||selected==="all");
    const groups=new Map();
    rows.forEach(x=>{
      const week=semanaInicio(x.data_referencia);
      if(!groups.has(week))groups.set(week,new Map());
      const group=groups.get(week),id=String(x.projeto_id);
      const old=group.get(id);
      if(!old||String(x.data_referencia)>=String(old.data_referencia))group.set(id,x);
    });
    const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    return ordered.map(([week,records])=>{
      const r=[...records.values()];
      const plan=r.map(x=>number(x.planejado)).filter(n=>n!==null);
      const real=r.map(x=>number(x.realizado)).filter(n=>n!==null);
      const mean=nums=>nums.length?Number((nums.reduce((a,b)=>a+b,0)/nums.length).toFixed(1)):null;
      const date=selected==="all"?week:r[r.length-1]?.data_referencia||week;
      return {date,planned:mean(plan),real:mean(real),nPlan:plan.length,nReal:real.length,selected,projectName};
    });
  }
  function drawSeriesChart(root,data,consolidated){
    const canvas=root.querySelector("canvas");
    if(!canvas||!window.Chart)return;
    if(grafSerie){grafSerie.destroy();grafSerie=null;}
    const labels=data.map(x=>br(x.date));
    grafSerie=new Chart(canvas,{
      type:"line",
      data:{labels,datasets:[
        {label:"Planejado",data:data.map(x=>x.planned),borderColor:"#5b9be5",backgroundColor:"#5b9be5",borderWidth:3,pointBackgroundColor:"#5b9be5",pointRadius:5,spanGaps:false,tension:.25},
        {label:"Realizado",data:data.map(x=>x.real),borderColor:"#ff9212",backgroundColor:"#ff9212",borderWidth:3,pointBackgroundColor:"#ff9212",pointRadius:5,spanGaps:false,tension:.25}
      ]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{
          pmo61ValueLabels:{enabled:true},
          legend:{position:"top",labels:{color:"#edf5ff",usePointStyle:true,padding:18,font:{weight:"bold"}}},
          tooltip:{callbacks:{title:items=>items[0]?.label||"",
          label:item=>{
            const row=data[item.dataIndex],k=item.datasetIndex?"nReal":"nPlan";
            return item.dataset.label+": "+(item.parsed.y==null?"TBD":pt(item.parsed.y)+"%")+
              (consolidated?" | "+row[k]+" projeto(s) com dado":"");
          }}}
        },
        scales:{
          x:{ticks:{color:"#cde2f6",maxRotation:45},grid:{color:"#ffffff12"}},
          y:{min:0,max:100,ticks:{color:"#cde2f6",callback:x=>x+"%"},grid:{color:"#ffffff1e"}}
        }
      }
    });
  }
  async function renderPortfolioLine(refresh=false){
    const tab=get("tabPortfolio");if(!tab||tab.hidden||!db||!usu)return;
    autocomplete();
    let box=get("pmo61Line");
    if(!box){
      box=make("section","","pmo61-portfolio");box.id="pmo61Line";
      box.appendChild(make("h3","Evolução semanal • planejado x realizado"));
      box.appendChild(make("p","Consolidado = média simples dos percentuais publicados pelos projetos com dados na semana. Não representa avanço ponderado."));
      const controls=make("div","","pmo61-chart-toolbar");
      const label=make("label","Visualização");
      const sel=document.createElement("select");sel.id="pmo61ChartProject";
      sel.setAttribute("aria-label","Projeto exibido no gráfico histórico");
      sel.addEventListener("change",()=>renderPortfolioLine());
      label.appendChild(sel);
      controls.appendChild(label);
      box.appendChild(controls);
      const graph=make("div","","pmo61-portfolio-canvas");
      graph.appendChild(document.createElement("canvas"));
      box.appendChild(graph);
      box.appendChild(make("div","","pmo61-port-legend"));
      box.appendChild(make("div","","pmo61-chart-table"));
      const card=tab.querySelector(".card");
      (card||tab).appendChild(box);
    }
    const filtered=matchPortfolio(),sel=get("pmo61ChartProject");
    const prev=sel.value;
    sel.replaceChildren(new Option("Consolidado dos projetos filtrados","all"));
    filtered.filter(p=>p.publicado).forEach(p=>sel.add(new Option(p.nome,String(p.id))));
    sel.value=[...sel.options].some(o=>o.value===prev)?prev:"all";
    const cycle=++serieEpoch,desc=box.querySelector(":scope > p");
    let series;
    try {series=await fetchSeries(refresh)}catch(err){
      if(cycle!==serieEpoch)return;
      desc.textContent="Não foi possível consultar o histórico: "+err.message;
      return;
    }
    if(cycle!==serieEpoch)return;
    const ids=new Set(filtered.filter(x=>x.publicado).map(x=>String(x.id)));
    const filteredSeries=series.filter(x=>ids.has(String(x.projeto_id)));
    const selected=sel.value||"all",consolidated=selected==="all";
    const seriesData=aggregateSeries(filteredSeries,selected,sel.selectedOptions[0]?.textContent||"");
    desc.textContent=consolidated
      ?"Consolidado: média simples por semana, considerando somente os projetos filtrados com percentuais registrados."
      :"Projeto: percentuais semanais publicados, sem preencher datas ausentes.";
    const tableWrap=box.querySelector(".pmo61-chart-table");
    tableWrap.replaceChildren();
    const legend=box.querySelector(".pmo61-port-legend");
    legend.replaceChildren();
    [["Planejado","#5b9be5"],["Realizado","#ff9212"]].forEach(([label,color])=>{
      const item=make("span","","pmo61-legend-item");
      const dot=document.createElement("i");dot.style.background=color;
      item.append(dot,document.createTextNode(label));
      legend.appendChild(item);
    });
    if(!seriesData.length){
      if(grafSerie){grafSerie.destroy();grafSerie=null;}
      box.querySelector("canvas")?.getContext("2d")?.clearRect(0,0,2000,1000);
      tableWrap.appendChild(make("div","Sem reports publicados que correspondam aos filtros.","pmo61-empty"));
      return;
    }
    drawSeriesChart(box,seriesData,consolidated);
    const t=document.createElement("table");
    const head=document.createElement("tr");
    for(const h of ["Semana / referência","Planejado","Realizado",...(consolidated?["Projetos c/ planejado","Projetos c/ realizado"]:[])])head.appendChild(make("th",h));
    t.appendChild(head);
    seriesData.forEach(x=>{
      const tr=document.createElement("tr");
      for(const v of [br(x.date),x.planned==null?"TBD":pt(x.planned)+"%",x.real==null?"TBD":pt(x.real)+"%",...(consolidated?[x.nPlan,x.nReal]:[])])
        tr.appendChild(make("td",v));
      t.appendChild(tr);
    });
    tableWrap.appendChild(t);
  }
  function install(){
    if(window.__pmo61Installed)return;window.__pmo61Installed=true;
    if(window.Chart)Chart.register(valueLabels);
    dims.forEach(([id])=>get(id)?.addEventListener("change",()=>queueMicrotask(syncSignals)));
    const oldFill=preencherStatus;preencherStatus=function(...args){const r=oldFill.apply(this,args);syncSignals();return r};
    const oldClear=limparFormularioStatus;limparFormularioStatus=function(...args){const r=oldClear.apply(this,args);syncSignals();return r};
    const oldDetail=detalheExecutivo;detalheExecutivo=function(...args){
      const r=oldDetail.apply(this,args);
      decorateSlide(args[0],args[1]);
      return r;
    };
    const oldDraw=desenharBarras;desenharBarras=function(...args){
      const box=args[0];
      box?.querySelectorAll(":scope > .pmo61-chart-table,:scope > .pmo61-chart-meta").forEach(x=>x.remove());
      const r=oldDraw.apply(this,args);
      annotateHistory(box,args[1]);
      return r;
    };
    const oldFilter=filtrarPortfolio;filtrarPortfolio=function(...args){
      const r=oldFilter.apply(this,args);
      autocomplete();enhanceCharts();
      void renderPortfolioLine();
      return r;
    };
    const oldLoad=carregarPortfolio;carregarPortfolio=async function(...args){
      const r=await oldLoad.apply(this,args);
      void renderPortfolioLine(true);
      return r;
    };
    const oldResume=carregarResumo;carregarResumo=async function(...args){
      const r=await oldResume.apply(this,args);
      enhanceCharts();return r;
    };
    get("portBusca")?.addEventListener("input",()=>void renderPortfolioLine());
    get("portGerente")?.addEventListener("change",()=>void renderPortfolioLine());
    get("portSaude")?.addEventListener("change",()=>void renderPortfolioLine());
    get("portStatus")?.addEventListener("change",()=>void renderPortfolioLine());
    get("portPublicado")?.addEventListener("change",()=>void renderPortfolioLine());
    syncSignals();autocomplete();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});
  else install();
})();
