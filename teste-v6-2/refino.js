
/* PMO V6 | refinamentos sobre a homologação V5, sem alterar permissões */
(() => {
  "use strict";
  const $v = id => document.getElementById(id);
  const safe = text => String(text == null ? "" : text);
  const dom = (tag, text, cls) => {
    const x = document.createElement(tag);
    if (text != null) x.textContent = safe(text);
    if (cls) x.className = cls;
    return x;
  };
  const people = new Map();
  const emails = new Map();
  let activePhoto = "";
  let charts = [];
  let alreadyDecorating = false;

  const displayFallback = email => {
    const prefix = safe(email).split("@")[0].replace(/[._-]+/g, " ").trim();
    return prefix ? prefix.split(/\s+/).map(t => t[0].toUpperCase() + t.slice(1)).join(" ") : "Usuário";
  };
  const photoIsSafe = value => typeof value === "string" &&
    value.length <= 120000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);

  function identify(value) {
    const email = safe(value).toLowerCase().trim();
    const id = emails.get(email) || (usu && email === safe(usu.email).toLowerCase() ? usu.id : null);
    const p = id ? people.get(id) : null;
    return {
      name: p?.nome_exibicao || (email.includes("@") ? displayFallback(email) : safe(value) || "Gerente a atribuir"),
      photo: photoIsSafe(p?.foto_data) ? p.foto_data : "",
      email
    };
  }

  function avatar(name, photo, cls = "") {
    const circle = dom("span", null, "pmo-v6-avatar " + cls);
    circle.setAttribute("aria-hidden", "true");
    if (photoIsSafe(photo)) {
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "";
      circle.appendChild(img);
    } else {
      const parts = safe(name).trim().split(/\s+/).filter(Boolean);
      circle.textContent = ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
    }
    return circle;
  }
  function identityLine(identifier, cls = "") {
    const p = identify(identifier);
    const wrap = dom("span", null, "pmo-v6-gerente-inline " + cls);
    wrap.appendChild(avatar(p.name, p.photo, "tiny"));
    wrap.appendChild(dom("span", p.name, "pmo-v6-label"));
    wrap.title = p.email;
    return wrap;
  }
  async function identitiesLoad() {
    if (!usu || !papel) return;
    const [ident, gerentes] = await Promise.all([
      db.from("pmo_identidades").select("usuario_id,nome_exibicao,foto_data").limit(500),
      db.rpc("resumo_publicado_por_gerente")
    ]);
    if (!ident.error) {
      people.clear();
      (ident.data || []).forEach(x => people.set(String(x.usuario_id),x));
    }
    if (!gerentes.error) {
      emails.clear();
      (gerentes.data || []).forEach(x => {
        if (x.gerente_id && x.gerente_identificacao)
          emails.set(String(x.gerente_identificacao).trim().toLowerCase(), String(x.gerente_id));
      });
    }
    if (usu) emails.set(safe(usu.email).toLowerCase(),String(usu.id));
    drawSelf();
    decorateGroups();
    decoratePortfolio();
    decorateSlides();
    decorateSelectedManager();
  }
  function feedback(text, failed = false) {
    const e = $v("pmoV6Feedback");
    if (!e) return;
    e.className = "pmo-v6-feedback " + (failed ? "erro" : "ok");
    e.textContent = text;
  }
  function drawSelf() {
    if (!usu || !papel || !$v("app") || $v("app").hidden) return;
    let root = $v("pmoV6Identity");
    if (!root) {
      root = dom("div", null, "pmo-v6-identidade");
      root.id = "pmoV6Identity";
      const appTop = $v("app").querySelector(":scope > .top");
      const logout = $v("logout");
      appTop?.insertBefore(root,logout);
      const actions = dom("div",null,"pmo-v6-perfil-botoes");
      const editName = dom("button","Editar nome","secondary");
      editName.type = "button";
      editName.onclick = editMyName;
      const editPhoto = dom("button","Anexar foto","secondary");
      editPhoto.type = "button";
      editPhoto.onclick = () => $v("pmoV6File")?.click();
      const inp = document.createElement("input");
      inp.type = "file"; inp.id = "pmoV6File";
      inp.hidden = true;
      inp.accept = "image/jpeg,image/png,image/webp";
      inp.onchange = () => { if (inp.files?.[0]) updateMyPhoto(inp.files[0]); inp.value = ""; };
      actions.append(editName,editPhoto,inp);
      const feedbackEl = dom("small", "", "pmo-v6-feedback");
      feedbackEl.id = "pmoV6Feedback";
      root.appendChild(actions);
      root.appendChild(feedbackEl);
    }
    const old = root.querySelector(".pmo-v6-perfil");
    if (old) old.remove();
    const id = identify(usu.email);
    const wrap = dom("div",null,"pmo-v6-perfil");
    wrap.appendChild(avatar(id.name,id.photo));
    const info = dom("div");
    info.appendChild(dom("strong",id.name));
    info.appendChild(dom("small",usu.email));
    info.appendChild(dom("small",papel === "administrador" ? "Administrador" : papel === "gerente" ? "Gerente de projetos" : "Consulta executiva"));
    wrap.appendChild(info);
    root.insertBefore(wrap,root.firstChild);
    if ($v("usuario")) $v("usuario").textContent = "Olá, " + id.name;
  }
  async function saveMe(nome, foto) {
    if (!usu || !papel) return;
    const item = {
      usuario_id: usu.id,
      nome_exibicao: nome,
      foto_data: foto || null,
      atualizado_em: new Date().toISOString()
    };
    const r = await db.from("pmo_identidades").upsert(item,{onConflict:"usuario_id"});
    if (r.error) throw r.error;
    people.set(String(usu.id),item);
    drawSelf();
    decorateGroups();decoratePortfolio();decorateSlides();decorateSelectedManager();
  }
  async function editMyName() {
    if (!usu || !papel) return;
    const p = identify(usu.email);
    const v = window.prompt("Nome que aparecerá nos relatórios e no portfólio:",p.name);
    if (v === null) return;
    const nome = v.trim();
    if (nome.length < 2 || nome.length > 100) {feedback("Nome deve ter de 2 a 100 caracteres.",true);return;}
    try { await saveMe(nome,p.photo);feedback("Nome atualizado para toda a equipe."); }
    catch(err){feedback("Não foi possível salvar: " + err.message,true);}
  }
  async function updateMyPhoto(file) {
    if (!usu || !papel) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5000000) {
      feedback("Envie JPG, PNG ou WebP de até 5 MB.",true);return;
    }
    feedback("Preparando sua foto...");
    try {
      const photo = await new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Leitura da imagem falhou"));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error("Imagem inválida"));
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const size = 160;
            canvas.width = size;canvas.height = size;
            const ctx = canvas.getContext("2d");
            const scale = Math.max(size/img.width,size/img.height);
            const w = img.width * scale, h = img.height * scale;
            ctx.fillStyle = "#fff";ctx.fillRect(0,0,size,size);
            ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
            const output = canvas.toDataURL("image/jpeg",.78);
            if (output.length > 110000)reject(new Error("A foto ainda ficou grande demais"));
            else resolve(output);
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
      await saveMe(identify(usu.email).name,photo);
      feedback("Foto publicada para a equipe.");
    } catch(err) { feedback("Não foi possível salvar a foto: " + err.message,true); }
  }

  function decorateGroups() {
    if (alreadyDecorating) return;
    alreadyDecorating = true;
    try {
      document.querySelectorAll("#listaResumo details.pmo-gerente > summary").forEach(sum => {
        let original = sum.dataset.pmoV6Original || sum.textContent || "";
        if (!sum.dataset.pmoV6Original) sum.dataset.pmoV6Original = original;
        const match = original.match(/^Gerente:\s*(.*?)\s*\|\s*(\d+.*)$/);
        if (!match) return;
        const line = identityLine(match[1]);
        const wrap = dom("span",null,"pmo-v6-nome-gerente");
        wrap.appendChild(line);
        wrap.appendChild(dom("small",match[2],"muted"));
        sum.replaceChildren(wrap);
      });
    } finally { alreadyDecorating = false; }
  }
  function decoratePortfolio() {
    document.querySelectorAll("#portLinhas tr").forEach(tr => {
      const td = tr.children[1];
      if (!td) return;
      const email = td.dataset.pmoV6Original || td.textContent || "";
      if (!td.dataset.pmoV6Original) td.dataset.pmoV6Original = email;
      td.replaceChildren(identityLine(email));
    });
  }
  function decorateSlides() {
    document.querySelectorAll(".pmo-slide").forEach(slide => {
      if (slide.dataset.pmoV6Avatar === "1") return;
      const header = slide.querySelector(".slide-identidade");
      if (!header) return;
      // O gerente é recuperado do projeto no próprio grupo ou na linha do portfólio.
      let manager = "";
      const gpGroup = slide.closest(".pmo-gerente");
      if (gpGroup) {
        const summary = gpGroup.querySelector(":scope > summary");
        const original = summary?.dataset.pmoV6Original || summary?.textContent || "";
        manager = original.replace(/^Gerente:\s*/,"").split(" | ")[0].trim();
      } else {
        const name = header.querySelector("h2")?.textContent || "";
        const row = pmoDadosPortfolio.find(x => x.nome === name);
        manager = row?.gerente || "";
      }
      if (!manager) return;
      const badge = identityLine(manager);
      header.insertBefore(badge,header.querySelector(".slide-objetivo") || header.children[1] || null);
      slide.dataset.pmoV6Avatar = "1";
    });
  }
  function decorateSelectedManager() {
    const sel = $v("sProjeto");
    if (!sel?.value || !$v("tabStatus") || $v("tabStatus").hidden) return;
    const manager = pmoDadosPortfolio.find(x => String(x.id) === String(sel.value));
    const email = manager?.gerente || (cred("gerente") && usu ? usu.email : "");
    if (!email) return;
    let badge = $v("pmoV6SelectedManager");
    if (!badge) {
      badge = dom("div",null,"pmo-v6-campo-responsavel");
      badge.id = "pmoV6SelectedManager";
      sel.closest("label")?.appendChild(badge);
    }
    badge.replaceChildren(identityLine(email),dom("span","Responsável pelo projeto"));
  }

  function refreshStatusVisual() {
    const info = $v("avisoStatus");
    if (!info) return;
    const txt = safe(info.textContent);
    const authorized = !$v("camposStatus")?.disabled;
    let state = "informar";
    if (authorized) state = "editar";
    else if (txt.includes("Somente leitura") || txt.includes("não atribuído")) state = "bloquear";
    else if (txt.includes("primeira publicação") || txt.includes("Aguardando")) state = "aguardar";
    info.classList.add("pmo-v6-status-aviso");
    info.classList.remove("editar","bloquear","aguardar","informar");
    info.classList.add(state);
    decorateSelectedManager();
  }

  const lights = [["sEscopo","Escopo"],["sPrazo","Prazo"],["sCusto","Custo"],["sQualidade","Qualidade"]];
  function paintLights() {
    const status = $v("sFarolGeral");
    if (!status) return;
    let panel = $v("pmoV6FarolPanel");
    if (!panel) {
      panel = dom("div",null,"pmo-v6-farol-panel");
      panel.id = "pmoV6FarolPanel";
      status.insertAdjacentElement("afterend",panel);
    }
    panel.replaceChildren();
    const cards = dom("div",null,"pmo-v6-farol-cards");
    lights.forEach(([id,label]) => {
      const sel = $v(id);
      if (!sel) return;
      const value = sel.value;
      const style = value === "No prazo" ? "verde" : value === "Atenção" ? "amarelo" : value === "Crítico" ? "vermelho" : "cinza";
      sel.classList.remove("pmo-v6-verde","pmo-v6-amarelo","pmo-v6-vermelho","pmo-v6-cinza");
      sel.classList.add("pmo-v6-" + style);
      const card = dom("div",null,"pmo-v6-farol-card");
      card.appendChild(dom("small",label));
      card.appendChild(dom("span",value || "Não selecionado"));
      card.style.borderLeft = "4px solid " + (style === "verde" ? "#35ce8e" : style === "amarelo" ? "#ffbf43" : style === "vermelho" ? "#fd7185" : "#8795aa");
      cards.appendChild(card);
    });
    const general = dom("div","Saúde consolidada (pior dimensão): " + farolGeral(),"pmo-v6-farol-geral");
    const legend = dom("div",null,"pmo-v6-farol-legenda");
    [["Verde: no prazo","verde"],["Amarelo: atenção","amarelo"],["Vermelho: crítico","vermelho"],["Cinza: N/A ou pendente","cinza"]].forEach(([t,c]) => legend.appendChild(dom("span",t,"farol "+c)));
    panel.append(cards,general,legend,dom("small","Indicador de saúde apenas informativo. O Status Geral é escolhido separadamente pelo gerente.","muted small"));
  }

  function chartTheme(container) {
    if (!container) return;
    const g = graficosHistoricoPMO.get(container);
    if (!g) return;
    const light = Boolean(container.closest(".pmo-slide"));
    const ink = light ? "#23466b" : "#e6f2ff";
    const grid = light ? "rgba(25,75,125,.16)" : "rgba(230,240,255,.09)";
    const colors = ["#4373c6","#ed7b00"];
    g.data.datasets.forEach((ds,i)=>{
      ds.borderColor = colors[i] || colors[0];
      ds.backgroundColor = colors[i] || colors[0];
      ds.borderWidth = 4;
      ds.pointBackgroundColor = colors[i] || colors[0];
      ds.pointBorderColor = light ? "#fff" : "#0b1b32";
      ds.pointBorderWidth = 2;
      ds.pointRadius = 6;
      ds.pointHoverRadius = 8;
      ds.tension = .28;
      ds.fill = false;
      ds.spanGaps = false;
    });
    if (g.options.plugins?.legend?.labels) {
      g.options.plugins.legend.labels.color = ink;
      g.options.plugins.legend.labels.font = {size:12,weight:"bold"};
      g.options.plugins.legend.labels.padding = 16;
    }
    ["x","y"].forEach(k=>{
      if (g.options.scales?.[k]?.ticks) g.options.scales[k].ticks.color = ink;
      if (g.options.scales?.[k]?.grid) g.options.scales[k].grid.color = grid;
    });
    g.update("none");
  }

  function makeChart(holder,type,data,options) {
    const canvas = document.createElement("canvas");
    holder.appendChild(canvas);
    if (!window.Chart) { holder.appendChild(dom("p","Gráfico indisponível."));return; }
    charts.push(new Chart(canvas,{type,data,options}));
  }
  function portfolioFilterRows() {
    if (!Array.isArray(pmoDadosPortfolio)) return [];
    const val = id => $v(id)?.value || "";
    const q = val("portBusca").toLocaleLowerCase("pt-BR");
    return pmoDadosPortfolio.filter(x =>
      (!q || x.nome.toLocaleLowerCase("pt-BR").includes(q)) &&
      (!val("portGerente") || x.gerente === val("portGerente")) &&
      (!val("portSaude") || x.saude === val("portSaude")) &&
      (!val("portStatus") || (x.relatorio?.status_geral || "TBD") === val("portStatus")) &&
      (!val("portPublicado") || (val("portPublicado") === "sim" ? x.publicado : !x.publicado))
    );
  }
  function portfolioVisual() {
    const panel = $v("tabPortfolio");
    if (!panel || panel.hidden) return;
    let root = $v("pmoV6PortfolioVisual");
    if (!root) {
      root = dom("section",null,"pmo-v6-dash");
      root.id = "pmoV6PortfolioVisual";
      panel.querySelector(".card")?.appendChild(root);
    }
    charts.forEach(g=>g.destroy());charts=[];
    root.replaceChildren();
    root.appendChild(dom("h3","Visão gráfica do portfólio"));
    root.appendChild(dom("p","Os gráficos respeitam os filtros selecionados acima. Não são estimados dados de semanas sem publicação."));
    const filtered = portfolioFilterRows();
    const published = filtered.filter(x=>x.publicado);
    const known = published.filter(x=>x.relatorio?.realizado != null);
    const media = known.length ? known.reduce((s,x)=>s+Number(x.relatorio.realizado),0)/known.length : null;
    const cards = dom("div",null,"pmo-v6-dash-cards");
    [["Projetos selecionados",filtered.length],["Reports publicados",published.length],["Realizado médio",media==null?"TBD":media.toFixed(1)+"%"],["Em atenção ou crítico",filtered.filter(x=>["Atenção","Crítico"].includes(x.saude)).length]].forEach(([k,v])=>{
      const card=dom("div",null,"pmo-v6-dash-card");
      card.appendChild(dom("small",k));card.appendChild(dom("strong",v));cards.appendChild(card);
    });
    root.appendChild(cards);
    const grid=dom("div",null,"pmo-v6-graficos");
    const left=dom("div",null,"pmo-v6-grafico-bloco");
    const right=dom("div",null,"pmo-v6-grafico-bloco");
    left.appendChild(dom("h4","Saúde consolidada dos projetos"));
    right.appendChild(dom("h4","Planejado x realizado por projeto (último report)"));
    grid.append(left,right);root.appendChild(grid);
    const labels=["No prazo","Atenção","Crítico","Sem avaliação"];
    const categories=labels.map(s=>filtered.filter(x=> (s==="Sem avaliação" ? !["No prazo","Atenção","Crítico"].includes(x.saude) : x.saude===s)).length);
    makeChart(left,"doughnut",
      {labels,datasets:[{data:categories,backgroundColor:["#36d39e","#f9b43c","#f66b7d","#667993"],borderColor:"#14253b",borderWidth:3}]},
      {responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{color:"#e8f2fe",usePointStyle:true,padding:15}},tooltip:{callbacks:{label:c=>c.label+": "+c.raw+" projeto(s)"}}},cutout:"56%"});
    const samples=published.filter(x=>x.relatorio?.planejado!=null || x.relatorio?.realizado!=null).slice(0,9);
    makeChart(right,"bar",
      {labels:samples.map(x=> x.nome.length>22?x.nome.slice(0,21)+"…":x.nome),
        datasets:[
          {label:"Planejado",data:samples.map(x=>x.relatorio?.planejado??null),backgroundColor:"#5b8cd4",borderRadius:5},
          {label:"Realizado",data:samples.map(x=>x.relatorio?.realizado??null),backgroundColor:"#f58200",borderRadius:5}
        ]},
      {responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:"#f0f6ff",usePointStyle:true,padding:16}},tooltip:{callbacks:{label:c=>c.dataset.label+": "+c.raw+"%"}}},
        scales:{x:{ticks:{color:"#d4e5f7",maxRotation:40},grid:{display:false}},y:{min:0,max:100,ticks:{color:"#d4e5f7",callback:v=>v+"%"},grid:{color:"#ffffff16"}}}});
    decoratePortfolio();
  }

  function installEnhancements() {
    if (window.__PMO_V6_INSTALLED__) return;
    window.__PMO_V6_INSTALLED__ = true;
    lights.forEach(([id])=>$v(id)?.addEventListener("change",paintLights));
    $v("sProjeto")?.addEventListener("change",()=>setTimeout(decorateSelectedManager,80));

    const oldStatus = bloquearStatus;
    bloquearStatus = function(...args){const r=oldStatus.apply(this,args);refreshStatusVisual();return r;};
    const oldPreencher = preencherStatus;
    preencherStatus = function(...args){const r=oldPreencher.apply(this,args);paintLights();return r;};
    const oldLimpar = limparFormularioStatus;
    limparFormularioStatus = function(...args){const r=oldLimpar.apply(this,args);paintLights();return r;};
    const oldDraw = desenharBarras;
    desenharBarras = function(...args){const r=oldDraw.apply(this,args);chartTheme(args[0]);return r;};
    const oldSlide = detalheExecutivo;
    detalheExecutivo = function(...args){const r=oldSlide.apply(this,args);decorateSlides();return r;};
    const oldResumo = carregarResumo;
    carregarResumo = async function(...args){const r=await oldResumo.apply(this,args);decorateGroups();decorateSlides();return r;};
    const oldFiltrar = filtrarPortfolio;
    filtrarPortfolio = function(...args){const r=oldFiltrar.apply(this,args);portfolioVisual();return r;};
    const oldAba = mostrarAba;
    mostrarAba = function(...args){const r=oldAba.apply(this,args);drawSelf();decorateSelectedManager();return r;};
    const oldSessao = sessao;
    sessao = async function(...args){const r=await oldSessao.apply(this,args);if(usu&&papel)await identitiesLoad();return r;};
    drawSelf();paintLights();refreshStatusVisual();
    db.auth.getUser().then(async result=>{
      if (!result.error && result.data?.user) {
        if(!usu || !papel) {setTimeout(async()=>{if(usu&&papel)await identitiesLoad();},500);}
        else await identitiesLoad();
      }
    }).catch(()=>{});
  }
  if (document.readyState === "loading")document.addEventListener("DOMContentLoaded",installEnhancements,{once:true});
  else installEnhancements();
})();
