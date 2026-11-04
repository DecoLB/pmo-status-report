/* PMO V6.3: dashboard e linhas em uma fonte de filtros. Sem gravar dados. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const make = (tag,txt,cls) => {
    const e=document.createElement(tag);
    if(txt!==undefined && txt!==null) e.textContent=String(txt);
    if(cls)e.className=cls;
    return e;
  };
  const number = v => v===undefined || v===null || v==="" || !Number.isFinite(Number(v)) ? null : Number(v);
  const fmt = (v,decimal=1) => number(v)===null ? "TBD" : Number(v).toLocaleString("pt-BR",{maximumFractionDigits:decimal,minimumFractionDigits:0});
  const norm = x => {
    const v=String(x||"");
    if(["No prazo","Atenção","Crítico","Não avaliado"].includes(v))return v;
    if(v==="Em atraso"||v==="Bloqueado")return "Crítico";
    return "Não avaliado";
  };
  const tone = v => norm(v)==="No prazo"?"verde":norm(v)==="Atenção"?"amarelo":norm(v)==="Crítico"?"vermelho":"cinza";
  const chartState = new Map();
  const cache = {rows:null,loading:null,version:0};
  let filters=[],rev=0,renderDelay=null;

  function br(date){return date ? dataBR(date) : "TBD"}
  function avg(nums){
    const n=nums.map(number).filter(v=>v!==null);
    return n.length ? +(n.reduce((a,b)=>a+b,0)/n.length).toFixed(1) : null;
  }
  function eligibleRows(list){
    return (list||[]).filter(p=>p.publicado);
  }
  function appendKpi(parent,title,value,subtitle,accent){
    const c=make("div",null,"pmo63-kpi");
    if(accent)c.dataset.accent=accent;
    c.appendChild(make("span",title,"pmo63-kpi-label"));
    c.appendChild(make("strong",value,"pmo63-kpi-value"));
    if(subtitle)c.appendChild(make("small",subtitle,"pmo63-kpi-sub"));
    parent.appendChild(c);
  }
  function colorVars(c){
    const light=Boolean(c?.canvas?.closest(".pmo-slide"));
    return light?{text:"#254752",grid:"#cadbe0",badge:"#f0f8f8",badgeText:"#173e46"}:
      {text:"#edf6ef",grid:"#314e52",badge:"#12313b",badgeText:"#f9fef9"};
  }
  function chartLabels(chart,_args,options){
    if(options?.enabled===false)return;
    const type=chart.config.type;
    if(!["line","bar","doughnut"].includes(type))return;
    const ctx=chart.ctx,area=chart.chartArea;
    if(!ctx||!area)return;
    const light=true; // V6.4 utiliza fundo claro em report e dashboard
    const mode=options?.mode||"percent";
    ctx.save();ctx.font="800 12px system-ui,Arial";ctx.textBaseline="middle";ctx.textAlign="center";
    function badge(x,y,label,forced){
      const width=ctx.measureText(label).width+12,h=19;
      if(!Number.isFinite(x)||!Number.isFinite(y))return;
      const ax=Math.max(area.left+width/2,Math.min(area.right-width/2,x));
      const ay=Math.max(area.top+h/2,Math.min(area.bottom-h/2,y));
      ctx.fillStyle=forced||(light?"#f4fbfbf5":"#16313bee");
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(ax-width/2,ay-h/2,width,h,6);else ctx.rect(ax-width/2,ay-h/2,width,h);
      ctx.fill();ctx.fillStyle=light?"#17343b":"#f5fcf7";
      ctx.fillText(label,ax,ay);
    }
    if(type==="doughnut"){
      const values=chart.data.datasets[0]?.data||[];
      const total=values.reduce((sum,v)=>sum+(number(v)||0),0);
      const arcMeta=chart.getDatasetMeta(0);
      arcMeta.data.forEach((arc,i)=>{
        const n=number(values[i]);if(n===null||n<=0||!total)return;
        const t=(arc.startAngle+arc.endAngle)/2,r=(arc.innerRadius+arc.outerRadius)/2;
        badge(arc.x+Math.cos(t)*r,arc.y+Math.sin(t)*r,fmt(n,0)+" ("+Math.round(n/total*100)+"%)");
      });
      if(total&&arcMeta.data[0]){
        const a=arcMeta.data[0];
        ctx.fillStyle=light?"#1b4652":"#eef9f1";
        ctx.font="800 22px system-ui,Arial";ctx.fillText(fmt(total,0),a.x,a.y);
      }
    }else{
      chart.data.datasets.forEach((dataset,di)=>{
        if(!chart.isDatasetVisible(di))return;
        const meta=chart.getDatasetMeta(di);
        meta.data.forEach((item,i)=>{
          const v=number(dataset.data[i]);if(v===null||item.skip)return;
          const unit=dataset.pmoUnit||(mode==="count"?"":mode==="gap"?" p.p.":"%");
          const text=fmt(v,1)+unit;
          const horizontal=type==="bar"&&chart.options.indexAxis==="y";
          const x=horizontal ? item.x+ctx.measureText(text).width/2+11 : item.x;
          const y=horizontal ? item.y : item.y+(type==="line"?(di===0?-21:21):-17);
          badge(x,y,text);
        });
      });
    }
    ctx.restore();
  }
  function initPlugin(){
    if(!window.Chart||window.__pmo63ChartPlugin)return;
    Chart.register({id:"pmo63Labels",afterDatasetsDraw:chartLabels});
    window.__pmo63ChartPlugin=true;
  }
  function renderChart(id,parent,type,labels,datasets,opt={}){
    const area=make("div",null,"pmo63-chart-canvas");
    if(opt.height)area.style.height=opt.height+"px";
    const canvas=document.createElement("canvas");canvas.setAttribute("aria-label",opt.aria||id);
    canvas.setAttribute("role","img");area.appendChild(canvas);parent.appendChild(area);
    if(!window.Chart){area.appendChild(make("p","Gráfico indisponível: Chart.js não carregou.","pmo63-empty"));return}
    const colors={labels:"#1c3f62",grid:"rgba(36,73,111,.16)"};
    const isBar=type==="bar",horizontal=opt.horizontal===true;
    const options={
      responsive:true,maintainAspectRatio:false,
      indexAxis:horizontal?"y":"x",
      layout:{padding:{left:10,right:32,top:31,bottom:19}},
      plugins:{
        pmo63Labels:{enabled:true,mode:opt.mode||"percent"},
        legend:{display:!opt.hideLegend,position:"top",labels:{color:colors.labels,usePointStyle:true,padding:18,font:{size:13,weight:"bold",family:"system-ui, Segoe UI, Arial"}}},
        tooltip:{callbacks:{
          title:items=>items[0]?.label||"",
          label:item=>item.dataset.label+": "+fmt(item.raw)+(item.dataset.pmoUnit||"%" )
        }}
      },
      scales:type==="doughnut"?undefined:{
        x:{min:horizontal?(opt.min??0):undefined,max:horizontal?(opt.max??100):undefined,
          ticks:{color:colors.labels,callback:horizontal?v=>fmt(v,0)+(opt.mode==="gap"?" p.p.":"%"):undefined,
            maxRotation:opt.rotate||0},grid:{color:colors.grid}},
        y:{min:horizontal?undefined:(opt.min??0),max:horizontal?undefined:(opt.max??100),
          ticks:{color:colors.labels,callback:horizontal?undefined:(v=>fmt(v,0)+(opt.mode==="gap"?" p.p.":"%")),autoSkip:false,
            callback:horizontal?function(value){const s=String(this.getLabelForValue(value));return s.length>30?s.slice(0,29)+"…":s;}:undefined},
          grid:{color:colors.grid}}
      }
    };
    if(type==="doughnut"){options.cutout="58%";delete options.indexAxis;delete options.scales}
    const c=new Chart(canvas,{type,data:{labels,datasets},options});
    chartState.set(id,c);
    return c;
  }
  function cleanCharts(){
    chartState.forEach(c=>{try{c.destroy()}catch(_){}});
    chartState.clear();
  }
  function makePanel(root,title,info,cls=""){
    const p=make("section",null,"pmo63-panel "+cls);
    p.appendChild(make("h3",title));
    if(info)p.appendChild(make("p",info,"pmo63-panel-note"));
    root.appendChild(p);
    return p;
  }
  function table(parent,columns,rows){
    const wrap=make("div",null,"pmo63-table-wrap");
    const t=document.createElement("table");
    const th=document.createElement("thead"),hr=document.createElement("tr");
    columns.forEach(label=>hr.appendChild(make("th",label)));th.appendChild(hr);t.appendChild(th);
    const body=document.createElement("tbody");
    if(!rows.length){const tr=document.createElement("tr"),td=make("td","Nenhum dado para este filtro.");td.colSpan=columns.length;tr.appendChild(td);body.appendChild(tr)}
    rows.forEach(row=>{const tr=document.createElement("tr");row.forEach(v=>tr.appendChild(make("td",v)));body.appendChild(tr)});
    t.appendChild(body);wrap.appendChild(t);parent.appendChild(wrap);
  }
  function displayNoData(parent,msg){parent.appendChild(make("p",msg,"pmo63-empty"))}
  function projectMetrics(project){
    const r=project.relatorio||{};
    const planned=number(r.planejado),actual=number(r.realizado);
    return {project,planned,actual,gap:planned===null||actual===null?null:+(actual-planned).toFixed(1)};
  }
  function filteredHistory(pids){
    return (cache.rows||[]).filter(x=>pids.has(String(x.projeto_id)));
  }
  async function getHistory(force=false){
    if(force){cache.rows=null;cache.loading=null;cache.version++}
    if(cache.rows)return cache.rows;
    if(cache.loading)return cache.loading;
    cache.loading=db.rpc("pmo_portfolio_evolucao")
      .then(result=>{if(result.error)throw result.error;cache.rows=Array.isArray(result.data)?result.data:[];return cache.rows})
      .catch(e=>{cache.loading=null;throw e});
    return cache.loading;
  }
  function groupWeekly(rows,projectId){
    const weeks=new Map();
    rows.forEach(r=>{
      if(projectId!=="all"&&String(r.projeto_id)!==String(projectId))return;
      const monday=semanaInicio(r.data_referencia);
      if(!weeks.has(monday))weeks.set(monday,new Map());
      const group=weeks.get(monday),key=String(r.projeto_id),prev=group.get(key);
      if(!prev||String(r.data_referencia)>=String(prev.data_referencia))group.set(key,r);
    });
    return [...weeks.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-26).map(([day,group])=>{
      const list=[...group.values()],pland=list.map(x=>number(x.planejado)).filter(x=>x!==null),
        actual=list.map(x=>number(x.realizado)).filter(x=>x!==null);
      const dates=[...new Set(list.map(x=>String(x.data_referencia)))].sort();
      return {week:day,date:projectId==="all"?day:dates[dates.length-1],
        dates,planned:avg(pland),actual:avg(actual),nPlan:pland.length,nActual:actual.length};
    });
  }
  function dashboard(list,seq){
    const target=$("pmo63Dashboard");if(!target)return;
    cleanCharts();target.replaceChildren();
    target.appendChild(make("h2","Painel executivo · visões do conjunto filtrado"));
    target.appendChild(make("p","Todos os gráficos abaixo usam exatamente os projetos listados na tabela acima. Nenhum valor ausente é estimado.","pmo63-overview"));
    const published=eligibleRows(list),metrics=published.map(projectMetrics);
    const meanP=avg(metrics.map(x=>x.planned)),meanA=avg(metrics.map(x=>x.actual));
    const withGap=metrics.filter(x=>x.gap!==null),meanGap=avg(withGap.map(x=>x.gap));
    const summary=make("div",null,"pmo63-summary");
    appendKpi(summary,"Projetos visíveis",fmt(list.length,0),"Com filtros ativos","neutral");
    appendKpi(summary,"Publicados",fmt(published.length,0),"Sem report: "+(list.length-published.length),"neutral");
    appendKpi(summary,"Planejado médio",meanP===null?"TBD":fmt(meanP)+"%","Projetos com percentual informado","blue");
    appendKpi(summary,"Realizado médio",meanA===null?"TBD":fmt(meanA)+"%","Projetos com percentual informado","teal");
    appendKpi(summary,"Desvio médio",meanGap===null?"TBD":(meanGap>0?"+":"")+fmt(meanGap)+" p.p.","Apenas projetos com os dois valores",meanGap<0?"alert":"teal");
    const crit=list.filter(x=>norm(x.saude)==="Crítico"||norm(x.saude)==="Atenção").length;
    appendKpi(summary,"Atenção / crítico",fmt(crit,0),"Saúde consolidada do conjunto",crit>0?"alert":"neutral");
    target.appendChild(summary);
    const grid=make("div",null,"pmo63-chart-grid");target.appendChild(grid);
    const segments=["No prazo","Atenção","Crítico","Não avaliado"];
    const count=segments.map(v=>list.filter(p=>norm(p.saude)===v).length);
    const health=makePanel(grid,"Saúde dos projetos","Quantidade e proporção por classificação. Status Geral permanece independente.","pmo63-health");
    if(list.length)renderChart("health",health,"doughnut",segments,[{label:"Projetos",data:count,backgroundColor:["#10b981","#f1b835","#ed6472","#8298a3"],borderColor:"#152d31",borderWidth:3,pmoUnit:" projeto(s)"}],{aria:"Distribuição de saúde dos projetos"});
    else displayNoData(health,"Sem projetos para o filtro.");
    const progress=makePanel(grid,"Planejado x realizado por projeto","Percentuais da última semana publicada. Passe o cursor para visualizar o nome completo.","pmo63-progress");
    const valid=metrics.filter(x=>x.planned!==null||x.actual!==null);
    if(valid.length)renderChart("progress",progress,"bar",valid.map(x=>x.project.nome),
      [{label:"Planejado",data:valid.map(x=>x.planned),backgroundColor:"#3276b7",borderRadius:5,pmoUnit:"%"},
       {label:"Realizado",data:valid.map(x=>x.actual),backgroundColor:"#ec8a15",borderRadius:5,pmoUnit:"%"}],
      {horizontal:true,height:Math.max(260,valid.length*39+90),aria:"Percentuais planejados e realizados por projeto"});
    else displayNoData(progress,"Sem percentuais publicados.");
    // Comparação gerencial calculada apenas com os projetos filtrados e com valores informados.
    const groups=new Map();
    metrics.forEach(m=>{
      const name=m.project.gerente||"Não atribuído";
      if(!groups.has(name))groups.set(name,[]);
      groups.get(name).push(m);
    });
    const managers=[...groups.entries()].map(([name,arr])=>({
      name,projects:arr.length,plan:avg(arr.map(x=>x.planned)),real:avg(arr.map(x=>x.actual))
    })).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
    const managerPanel=makePanel(grid,"Comparativo por gerente","Média simples dos projetos filtrados, preservando ausências de dados.","pmo63-managers");
    if(managers.some(x=>x.plan!==null||x.real!==null)){
      renderChart("managers",managerPanel,"bar",managers.map(x=>x.name),
        [{label:"Planejado médio",data:managers.map(x=>x.plan),backgroundColor:"#3276b7",borderRadius:4,pmoUnit:"%"},
         {label:"Realizado médio",data:managers.map(x=>x.real),backgroundColor:"#ec8a15",borderRadius:4,pmoUnit:"%"}],
        {horizontal:true,height:Math.max(245,managers.length*44+90),aria:"Comparação de médias entre gerentes"});
      table(managerPanel,["Gerente","Projetos","Planejado","Realizado"],
        managers.map(m=>[m.name,String(m.projects),m.plan===null?"TBD":fmt(m.plan)+"%",m.real===null?"TBD":fmt(m.real)+"%"]));
    }else displayNoData(managerPanel,"Sem percentuais registrados para os gerentes visíveis.");
    const gapPanel=makePanel(grid,"Desvio por projeto","Realizado menos planejado, em pontos percentuais. Valores negativos exigem acompanhamento.","pmo63-gaps");
    const gaps=withGap.slice().sort((a,b)=>a.gap-b.gap);
    if(gaps.length)renderChart("gaps",gapPanel,"bar",gaps.map(x=>x.project.nome),
      [{label:"Desvio (p.p.)",data:gaps.map(x=>x.gap),
        backgroundColor:gaps.map(x=>x.gap<0?"#f17a84":"#22c29b"),borderRadius:4,pmoUnit:" p.p."}],
      {horizontal:true,mode:"gap",height:Math.max(245,gaps.length*33+90),min:Math.min(-5,Math.floor(Math.min(...gaps.map(x=>x.gap))/5)*5),max:Math.max(5,Math.ceil(Math.max(...gaps.map(x=>x.gap))/5)*5),aria:"Desvios entre realizado e planejado"});
    else displayNoData(gapPanel,"Desvios ainda não calculáveis: faltam percentuais comparáveis.");
    const statusPanel=makePanel(target,"Status Geral declarado","Distribuição por classificação definida pelo gerente, distinta da saúde calculada.","pmo63-status");
    const chips=make("div",null,"pmo63-status-chips");
    segments.forEach((value,i)=>{
      const n=list.filter(p=>norm(p.relatorio?.status_geral)===value).length;
      const item=make("div",null,"pmo63-status-chip "+(["verde","amarelo","vermelho","cinza"][i]));
      item.append(make("span",value),make("strong",fmt(n,0)));
      chips.appendChild(item);
    });
    statusPanel.appendChild(chips);
    const alerts=makePanel(target,"Atenções para a reunião gerencial",
      "Critérios: sem report, saúde crítica/atenção ou desvio negativo. Indicação analítica, não substitui a matriz de riscos.","pmo63-alerts");
    const priorities=list.map(p=>{
      const m=projectMetrics(p);
      const hasIssue=!p.publicado||norm(p.saude)==="Crítico"||norm(p.saude)==="Atenção"||(m.gap!==null&&m.gap<0);
      return {p, m,hasIssue,score:(!p.publicado?4:0)+(norm(p.saude)==="Crítico"?3:norm(p.saude)==="Atenção"?2:0)+(m.gap<0?1:0)};
    }).filter(x=>x.hasIssue).sort((a,b)=>b.score-a.score||((a.m.gap??0)-(b.m.gap??0))).slice(0,10);
    table(alerts,["Projeto","Gerente","Saúde","Desvio","Publicação"],
      priorities.map(x=>[x.p.nome,x.p.gerente,norm(x.p.saude),x.m.gap===null?"TBD":(x.m.gap>0?"+":"")+fmt(x.m.gap)+" p.p.",x.p.publicado?"Publicado":"Sem report"]));
    const timeline=makePanel(target,"Evolução histórica · linha semanal",
      "Planejado e realizado por data informada. Na visão consolidada, média simples dos projetos com dado naquela semana.","pmo63-timeline");
    const tools=make("div",null,"pmo63-timeline-tools");
    const label=make("label","Projeto exibido na linha","pmo63-timeline-label");
    const select=document.createElement("select");select.id="pmo63TimelineSelect";
    select.setAttribute("aria-label","Selecionar projeto ou série consolidada");
    select.appendChild(new Option("Consolidado dos projetos filtrados","all"));
    published.forEach(p=>select.add(new Option(p.nome,String(p.id))));
    // Um projeto selecionado pelos filtros recebe foco automático na timeline.
    if(published.length===1) select.value=String(published[0].id);
    label.appendChild(select);tools.appendChild(label);
    const note=make("span",null,"pmo63-unit-note");note.textContent="Unidade: % | ausência: TBD";
    tools.appendChild(note);timeline.appendChild(tools);
    const canvasHolder=make("div",null,"pmo63-timeline-chart");timeline.appendChild(canvasHolder);
    const detail=make("div",null,"pmo63-timeline-values");timeline.appendChild(detail);
    select.onchange=()=>{void showHistory(seq)};
    void showHistory(seq);
  }
  async function showHistory(seq){
    const target=$("pmo63Dashboard");
    if(!target || seq!==rev)return;
    const picker=$("pmo63TimelineSelect");
    if(!picker)return;
    const selected=picker.value||"all";
    const pids=new Set(eligibleRows(filters).map(p=>String(p.id)));
    const area=target.querySelector(".pmo63-timeline-chart");
    const tableArea=target.querySelector(".pmo63-timeline-values");
    if(!area||!tableArea)return;
    const previous=chartState.get("timeline");
    if(previous){previous.destroy();chartState.delete("timeline");}
    tableArea.replaceChildren();area.replaceChildren();
    try{
      const records=await getHistory();
      if(seq!==rev||!picker.isConnected||picker.value!==selected)return;
      const rows=records.filter(x=>pids.has(String(x.projeto_id)));
      const values=groupWeekly(rows,selected);
      if(!values.length){
        displayNoData(area,"Nenhuma semana publicada com informações para o filtro.");
        return;
      }
      const labels=values.map(v=>selected==="all"?"Sem. "+br(v.week):br(v.date));
      renderChart("timeline",area,"line",labels,[
        {label:"Planejado",data:values.map(x=>x.planned),borderColor:"#3276b7",backgroundColor:"#3276b7",pointRadius:5,pointHoverRadius:8,spanGaps:false,tension:.2,pmoUnit:"%"},
        {label:"Realizado",data:values.map(x=>x.actual),borderColor:"#ec8a15",backgroundColor:"#ec8a15",pointRadius:5,pointHoverRadius:8,spanGaps:false,tension:.2,pmoUnit:"%"}
      ],{height:280,aria:"Histórico de planejado e realizado com datas e percentuais",rotate:0});
      table(tableArea,["Semana / referência","Planejado","Realizado",...(selected==="all"?["Projetos com planejado","Projetos com realizado"]:[])],
        values.map(x=>[selected==="all"?"Sem. "+br(x.week):br(x.date),
          x.planned===null?"TBD":fmt(x.planned)+"%",x.actual===null?"TBD":fmt(x.actual)+"%",
          ...(selected==="all"?[String(x.nPlan),String(x.nActual)]:[])]));
    }catch(e){
      if(seq===rev)displayNoData(area,"Histórico indisponível: "+e.message);
    }
  }
  function scheduleRender(list){
    filters=(list||[]).slice();
    const seq=++rev;
    if(renderDelay)clearTimeout(renderDelay);
    renderDelay=setTimeout(()=>{
      const root=$("pmo63Dashboard");if(!root||!root.isConnected)return;
      dashboard(filters,seq);
    },80);
  }
  window.pmo63OnPortfolioFilter=scheduleRender;

  function slideHistory(slide,payload){
    const panel=slide.querySelector(".slide-evolucao");
    if(!panel)return;
    panel.classList.add("pmo63-history");
    const original=payload?.historico||[];
    const hist=original.filter(x=>x.planejado!==null&&x.planejado!==undefined||
       x.realizado!==null&&x.realizado!==undefined)
      .slice().sort((a,b)=>String(a.data_referencia).localeCompare(String(b.data_referencia))).slice(-12);
    if(!hist.length)return;
    const info=make("p",hist.length===1
      ? "Azul: Planejado | Laranja: Realizado | Barras comparativas referentes à semana informada. A evolução em linha começa com duas semanas."
      : "Linha azul: Planejado | Linha laranja: Realizado | Eixo horizontal: data de referência do report.",
      "pmo63-slide-note");
    const canvasArea=panel.querySelector(".pmo-grafico");
    if(canvasArea) {
      // Uma legenda HTML visível em qualquer tema, sem depender do contraste do canvas.
      const key=make("div",null,"pmo65-chart-legend");
      key.setAttribute("role","group");
      key.setAttribute("aria-label","Legenda do gráfico");
      for(const [name,css] of [["Planejado","plan"],["Realizado","actual"]]){
        const item=make("span",name,"pmo65-chart-key "+css);
        key.appendChild(item);
      }
      canvasArea.insertAdjacentElement("beforebegin",key);
      canvasArea.insertAdjacentElement("afterend",info);
    } else panel.querySelector(".pmo64-semana-unica")?.insertAdjacentElement("afterend",info);
    table(panel,["Referência","Planejado","Realizado","Desvio"],
      hist.map(x=>{
        const p=number(x.planejado),r=number(x.realizado);
        const gap=p===null||r===null?null:r-p;
        return [br(x.data_referencia),p===null?"TBD":fmt(p)+"%",r===null?"TBD":fmt(r)+"%",gap===null?"TBD":(gap>0?"+":"")+fmt(gap)+" p.p."];
      }));
    const metricas=slide.querySelector(".slide-metricas");
    if(metricas){
      const ultimo=hist[hist.length-1];
      const a=number(ultimo.planejado),b=number(ultimo.realizado);
      if(a!==null&&b!==null){
        const box=make("div",null,"slide-metrica pmo63-gap-box");
        box.append(make("span","DESVIO DO ÚLTIMO REPORT","slide-legenda"),
          make("strong",(b-a>0?"+":"")+fmt(b-a)+" p.p.","slide-valor"));
        metricas.appendChild(box);
      }
    }
  }
  window.pmo63AfterSlide=slideHistory;

  function installDatalist(){
    const input=$("portBusca");if(!input)return;
    let list=$("pmo63Projects");
    if(!list){
      list=document.createElement("datalist");list.id="pmo63Projects";
      input.after(list);input.setAttribute("list","pmo63Projects");
      input.placeholder="Selecione na lista ou digite...";
      input.setAttribute("autocomplete","off");
    }
    const options=typeof pmoDadosPortfolio!=="undefined"&&Array.isArray(pmoDadosPortfolio)
      ?[...new Set(pmoDadosPortfolio.map(x=>x.nome))].sort((a,b)=>a.localeCompare(b,"pt-BR")):[];
    list.replaceChildren(...options.map(s=>{const o=document.createElement("option");o.value=s;return o}));
  }
  function paintStatus(){
    for(const id of ["sStatusGeral","sEscopo","sPrazo","sCusto","sQualidade"]){
      const sel=$(id);if(!sel)continue;
      const l=sel.closest("label");
      if(l){l.classList.add("pmo63-light-label");l.dataset.light=tone(sel.value);}
    }
    // Cartões inferiores devem ter a cor inteira, mantendo o campo seletor neutro.
    const health=["sEscopo","sPrazo","sCusto","sQualidade"];
    document.querySelectorAll("#pmoV6FarolPanel .pmo-v6-farol-card").forEach((card,i)=>{
      card.dataset.tone=tone($(health[i])?.value);
    });
  }
  function installDecorations(){
    paintStatus();
    for(const id of ["sStatusGeral","sEscopo","sPrazo","sCusto","sQualidade"]){
      $(id)?.addEventListener("change",paintStatus);
    }
    const root=$("tabStatus");
    if(root){
      const observer=new MutationObserver(()=>paintStatus());
      observer.observe(root,{subtree:true,childList:true});
    }
    const app=$("app");
    // Uma sessão sem credenciais não mostra conteúdo gerencial.
    if(app?.hidden)$("loginBox")?.removeAttribute("aria-hidden");
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
    let raf=0,x=16,y=24;
    document.addEventListener("pointermove",ev=>{
      if(ev.pointerType==="touch")return;
      x=ev.clientX/window.innerWidth*100;y=ev.clientY/window.innerHeight*100;
      if(raf)return;
      raf=requestAnimationFrame(()=>{
        document.body.style.setProperty("--pmo63-x",x.toFixed(1)+"%");
        document.body.style.setProperty("--pmo63-y",y.toFixed(1)+"%");
        raf=0;
      });
    },{passive:true});
  }
  const originalHook=window.pmo63OnPortfolioFilter;
  window.pmo63OnPortfolioFilter=function(list){
    installDatalist();
    return originalHook(list);
  };
  function start(){
    initPlugin();installDecorations();installDatalist();
    const atualizar=$("portAtualizar");
    atualizar?.addEventListener("click",()=>{cache.rows=null;cache.loading=null});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();