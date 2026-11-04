/* PMO V6.5 | Acessibilidade e tipografia global.
   Sem alterações de login, dados, permissões ou regras de publicação. */
(()=>{
  "use strict";
  const optionInk="#193b60",optionPaper="#ffffff";
  function fixSelect(select){
    if(!(select instanceof HTMLSelectElement))return;
    // Controla a paleta do menu nativo, inclusive opções criadas após o login.
    select.style.setProperty("color-scheme","light","important");
    for(const option of select.options){
      option.style.setProperty("color",optionInk,"important");
      option.style.setProperty("background-color",optionPaper,"important");
      option.style.setProperty("-webkit-text-fill-color",optionInk,"important");
      option.style.setProperty("font-weight","600","important");
    }
    for(const group of select.querySelectorAll("optgroup")){
      group.style.setProperty("color",optionInk,"important");
      group.style.setProperty("background-color",optionPaper,"important");
    }
  }
  function allSelects(){
    document.querySelectorAll("select").forEach(fixSelect);
  }
  function chartDefaults(){
    if(!window.Chart)return;
    const defaults=Chart.defaults;
    defaults.color="#1b3f64";
    defaults.font.family='system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
    defaults.font.size=12;
    defaults.font.weight="600";
  }
  function start(){
    chartDefaults();
    allSelects();
    // Os módulos de cadastro criam ou atualizam opções dinamicamente.
    document.addEventListener("focusin",ev=>fixSelect(ev.target),true);
    document.addEventListener("pointerdown",ev=>{
      const sel=ev.target?.closest?.("select");
      if(sel)fixSelect(sel);
    },true);
    document.addEventListener("change",ev=>fixSelect(ev.target),true);
  }
  if(document.readyState==="loading")
    document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
