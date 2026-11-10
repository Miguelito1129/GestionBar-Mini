// ── Paleta de colores ──────────────────────────────────────────────────────────
export const C = {
  bg:"#09090d", surface:"#111116", card:"#17171f",
  border:"#292932", border2:"#393944",
  amber:"#ffc45c", indigo:"#a394ff", green:"#45d6a0",
  red:"#ff727f", purple:"#d09bff", cyan:"#72dce5",
  muted:"#737386", sub:"#a0a0b2", text:"#f3f0f7", text2:"#c3c0ce",
  rowA:"#17171f", rowB:"#121218",
};

export const CHART_COLORS = ['#ffc45c','#a394ff','#45d6a0','#ff727f','#d09bff','#72dce5','#ff9566','#b9e769'];
export const BILLETS     = [100000, 50000, 20000, 10000, 5000, 2000];
export const PALETTE     = ["#ffc45c","#a394ff","#45d6a0","#f47eb7","#72dce5","#ff9566","#be9cff","#b9e769"];

// ── Formatters ─────────────────────────────────────────────────────────────────
export const COP      = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n||0);
export const NOW_TIME = () => new Date().toLocaleTimeString("es-CO",{timeZone:"America/Bogota",hour:"2-digit",minute:"2-digit"});
export const TODAY_STR= new Date().toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

// ── Estilos compartidos ────────────────────────────────────────────────────────
export const s = {
  nav:    { background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"0 1.5rem", display:"flex", alignItems:"center", gap:"4px", height:56, position:"sticky", top:0, zIndex:100, flexWrap:"wrap" },
  main:   { maxWidth:1280, margin:"0 auto", padding:"1.5rem" },
  card:   { background:`linear-gradient(145deg, ${C.card}, ${C.surface})`, border:`1px solid ${C.border}`, borderRadius:16, padding:"1.25rem", boxShadow:"0 14px 36px rgba(0,0,0,.2)" },
  metric: { background:`linear-gradient(145deg, ${C.card}, ${C.surface})`, borderRadius:14, padding:"1rem 1.1rem", border:`1px solid ${C.border}`, boxShadow:"0 10px 26px rgba(0,0,0,.16)" },
  label:  { fontSize:10, color:C.sub, textTransform:"uppercase", letterSpacing:"0.09em", marginBottom:5, fontWeight:750 },
  big:    { fontSize:24, fontWeight:800, letterSpacing:"-0.5px" },
  btn:    (v="def") => ({ padding:"9px 16px", borderRadius:10, border:`1px solid ${v==="ghost"?C.border:"transparent"}`, cursor:"pointer", fontWeight:700, fontSize:12, background:v==="primary"?"linear-gradient(135deg, #ffd47a, #ffb83d)":v==="danger"?"#8f2635":v==="success"?"#16795c":v==="ghost"?"rgba(255,255,255,.025)":C.surface, color:v==="primary"?"#21170a":C.text, boxShadow:v==="primary"?"0 5px 18px rgba(255,196,92,.16)":"none", transition:"background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease" }),
  inp:    { background:"#0d0d12", border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 12px", color:C.text, fontSize:13, width:"100%", outline:"none", boxSizing:"border-box", transition:"border-color .18s ease, box-shadow .18s ease" },
  sel:    { background:"#0d0d12", border:`1px solid ${C.border}`, borderRadius:10, padding:"9px 12px", color:C.text, fontSize:13, width:"100%", boxSizing:"border-box", transition:"border-color .18s ease, box-shadow .18s ease" },
  th:     { textAlign:"left", padding:"7px 10px", color:C.sub, borderBottom:`1px solid ${C.border}`, fontWeight:600, fontSize:10, textTransform:"uppercase", letterSpacing:"0.07em" },
  td:     i => ({ padding:"8px 10px", borderBottom:`1px solid ${C.border}30`, fontSize:12, background:i%2===0?C.rowA:C.rowB }),
  overlay:{ position:"fixed", inset:0, background:"rgba(4,4,8,.82)", backdropFilter:"blur(8px)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" },
  modal:  { background:`linear-gradient(145deg, ${C.card}, ${C.surface})`, border:`1px solid ${C.border2}`, borderRadius:20, padding:"1.5rem", width:"min(560px,96vw)", maxHeight:"88vh", overflowY:"auto", boxShadow:"0 28px 90px rgba(0,0,0,.58)" },
};
