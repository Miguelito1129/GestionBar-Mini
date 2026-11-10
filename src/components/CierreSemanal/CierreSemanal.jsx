import { useState, useEffect } from "react";
import { C, s, COP } from "../../constants/theme.js";
import { canSeeNeg } from "../../constants/roles.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { localFetch } from "../../lib/localApi.js";
import { uid } from "../../utils/helpers.js";
import { Badge, LIST_PAGE_SIZE, PaginationTabs, SectionTitle, useListPagination } from "../common/index.jsx";

const getVisiblePage = (items, requestedPage) => {
  const pageCount = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE));
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  return {
    page,
    items: items.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
  };
};

// Normaliza "14/4/2026" (es-CO) o "2026-04-14" (ISO) → "2026-04-14"
const toISO = f => {
  if (!f) return '';
  if (f.includes('-')) return f;
  const [dd,mm,yyyy] = f.split('/');
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
};

export default function CierreSemanal({ negocios, negocioId }) {
  const { user } = useAuth();
  const visibles = negocios.filter(n => canSeeNeg(user, n.id));
  const fmt = d => d.toISOString().slice(0,10);
  const hoy = new Date();
  const hace7 = new Date(hoy); hace7.setDate(hoy.getDate()-7);

  const [desde, setDesde]   = useState(fmt(hace7));
  const [hasta, setHasta]   = useState(fmt(hoy));
  const [loading, setLoading] = useState(false);
  const [selNegs, setSelNegs] = useState(negocioId ? [negocioId] : visibles.slice(0,1).map(n=>n.id));

  // Sincronizar cuando el usuario cambia de negocio en la barra superior
  useEffect(()=>{ if(negocioId) setSelNegs([negocioId]); },[negocioId]);
  const [socios, setSocios]   = useState({});

  // 3-step flow: 'config' | 'seleccion' | 'cierre'
  const [paso, setPaso] = useState('config');

  // Data loaded from memory/Supabase
  const [planillasRango, setPlanillasRango] = useState({}); // negId -> planilla[]
  const [gastosRango,    setGastosRango]    = useState({}); // negId -> gasto[]

  // Selected IDs per negocio
  const [selPlanillas, setSelPlanillas] = useState({}); // negId -> id[]
  const [selGastos,    setSelGastos]    = useState({}); // negId -> id[]

  // ── Historial de cierres ─────────────────────────────────────────────────────
  const CIERRES_KEY = 'gesbar_cierres_v2';
  const [cierresHist, setCierresHist] = useState(()=>{
    try{return JSON.parse(localStorage.getItem('gesbar_cierres_v2')||'{}');}catch{return{};}
  });
  const cierreHistoryRows = visibles.flatMap(neg => (cierresHist[neg.id]||[]).map(cierre => ({ negId:neg.id, cierre })));
  const cierreHistoryPage = useListPagination(cierreHistoryRows);
  const [savedNegs, setSavedNegs] = useState(new Set());
  const [listPages, setListPages] = useState({});
  const changeListPage = (key, page) => setListPages(current => ({ ...current, [key]: page }));

  // IDs de planillas/gastos ya incluidos en algún cierre guardado
  const usedPlanillaIds = negId => new Set((cierresHist[negId]||[]).flatMap(c=>c.planillaIds||[]));
  const usedGastoIds    = negId => new Set((cierresHist[negId]||[]).flatMap(c=>c.gastoIds||[]));

  const guardarCierre = cd => {
    const cierre = {
      id:uid(), negId:cd.neg.id, fechaDesde:desde, fechaHasta:hasta,
      savedAt:new Date().toISOString(),
      planillaIds:cd.planillas.map(p=>p.id),
      gastoIds:cd.gastos.map(g=>g.id),
      dias:cd.dias,
      gastos:cd.gastos,
      totEfectivo:cd.totEfectivo, totTransferencias:cd.totTransferencias,
      totIngresos:cd.totIngresos, totGastosSema:cd.totGastosSema, saldo:cd.saldo,
      liquidacion:cd.liquidacion,
    };
    const updated={...cierresHist,[cd.neg.id]:[cierre,...(cierresHist[cd.neg.id]||[])]};
    setCierresHist(updated);
    localStorage.setItem(CIERRES_KEY,JSON.stringify(updated));
    setSavedNegs(p=>new Set([...p,cd.neg.id]));
  };

  const borrarCierre = (negId, cierreId) => {
    const updated={...cierresHist,[negId]:(cierresHist[negId]||[]).filter(c=>c.id!==cierreId)};
    setCierresHist(updated);
    localStorage.setItem(CIERRES_KEY,JSON.stringify(updated));
  };

  // ── Socios helpers ──────────────────────────────────────────────────────────
  const initSocios = negId => {
    if (socios[negId]) return;
    setSocios(p=>({...p,[negId]:[
      {id:uid(),nombre:'Socio A',pct:50,nequi:0,bancolombia:0,datafono:0,daviplata:0,llave:0,qr:0,cxcFavor:0,cxcContra:0,facturas:0},
      {id:uid(),nombre:'Socio B',pct:50,nequi:0,bancolombia:0,datafono:0,daviplata:0,llave:0,qr:0,cxcFavor:0,cxcContra:0,facturas:0},
    ]}));
  };
  const updSocio = (negId, socioId, field, val) =>
    setSocios(p=>({...p,[negId]:p[negId].map(s=>s.id===socioId?{...s,[field]:val}:s)}));
  const addSocio = negId =>
    setSocios(p=>({...p,[negId]:[...(p[negId]||[]),{id:uid(),nombre:'Nuevo Socio',pct:0,nequi:0,bancolombia:0,datafono:0,daviplata:0,llave:0,qr:0,cxcFavor:0,cxcContra:0,facturas:0}]}));
  const delSocio = (negId, socioId) =>
    setSocios(p=>({...p,[negId]:p[negId].filter(s=>s.id!==socioId)}));

  // ── Step 1 → Step 2: load data ──────────────────────────────────────────────
  const cargarDatos = async () => {
    setLoading(true);
    const planRes={}, gastRes={}, selPl={}, selGa={};
    for (const neg of visibles.filter(n=>selNegs.includes(n.id))) {
      const usedPl = usedPlanillaIds(neg.id);
      const usedGa = usedGastoIds(neg.id);
      const pls=(neg.planillas||[]).filter(p=>{const iso=toISO(p.fecha);return iso>=desde&&iso<=hasta&&!usedPl.has(p.id);}).sort((a,b)=>toISO(a.fecha).localeCompare(toISO(b.fecha)));
      planRes[neg.id]=pls;
      selPl[neg.id]=pls.map(p=>p.id);
      const data=await localFetch('gastos',`negocio_id=eq.${neg.id}&fecha=gte.${desde}&fecha=lte.${hasta}&select=*&order=fecha.asc`);
      const gastosFiltrados=(data||[]).filter(g=>!usedGa.has(g.id));
      gastRes[neg.id]=gastosFiltrados;
      selGa[neg.id]=gastosFiltrados.map(g=>g.id);
      initSocios(neg.id);
    }
    setPlanillasRango(planRes);
    setGastosRango(gastRes);
    setSelPlanillas(selPl);
    setSelGastos(selGa);
    setLoading(false);
    setPaso('seleccion');
  };

  // ── Selection toggles ───────────────────────────────────────────────────────
  const togglePl = (negId, id) => setSelPlanillas(p=>{
    const arr=p[negId]||[];
    return {...p,[negId]:arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]};
  });
  const toggleGa = (negId, id) => setSelGastos(p=>{
    const arr=p[negId]||[];
    return {...p,[negId]:arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]};
  });

  // ── Cierre calculator (uses only selected items) ────────────────────────────
  const calcCierre = neg => {
    const planillas=(planillasRango[neg.id]||[]).filter(p=>(selPlanillas[neg.id]||[]).includes(p.id));
    const gastos=(gastosRango[neg.id]||[]).filter(g=>(selGastos[neg.id]||[]).includes(g.id));
    const sc=socios[neg.id]||[];
    const dias=planillas.map(p=>{
      const gastoDiario=(p.gastos||0)+(p.personal||0);
      const efectivo=p.neto!==undefined?p.neto:p.ventas-(p.bancos||0)-gastoDiario;
      return{fecha:toISO(p.fecha),ventas:p.ventas,gastoDiario,efectivo,transferencias:p.bancos||0};
    });
    const totEfectivo=dias.reduce((s,d)=>s+d.efectivo,0);
    const totTransferencias=dias.reduce((s,d)=>s+d.transferencias,0);
    const totIngresos=totEfectivo+totTransferencias;
    const totGastosSema=gastos.reduce((s,g)=>s+g.monto,0);
    const saldo=totIngresos-totGastosSema;
    const liquidacion=sc.map(s=>{
      const ganancia=Math.round(saldo*(s.pct/100));
      const susBancos=(s.nequi||0)+(s.bancolombia||0)+(s.datafono||0)+(s.daviplata||0)+(s.llave||0)+(s.qr||0);
      const aPagar=ganancia-susBancos-(s.cxcFavor||0)+(s.cxcContra||0)+(s.facturas||0);
      return{...s,ganancia,susBancos,aPagar};
    });
    return{neg,planillas,dias,gastos,totEfectivo,totTransferencias,totIngresos,totGastosSema,saldo,sc,liquidacion};
  };

  // ── PDF printer ─────────────────────────────────────────────────────────────
  const printCierre = (cd, desdePrint=desde, hastaPrint=hasta) => {
    const{neg,dias,gastos,totEfectivo,totTransferencias,totIngresos,totGastosSema,saldo,liquidacion}=cd;
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cierre ${neg.name} ${desdePrint} al ${hastaPrint}</title>
    <style>*{box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;padding:1.5rem;font-size:11px;max-width:800px;margin:0 auto;}h2{font-size:13px;font-weight:800;text-align:center;margin:1.5rem 0 0.5rem;border-bottom:2px solid #1a1a2e;padding-bottom:4px;}h3{font-size:12px;font-weight:800;text-align:center;margin:0.5rem 0;}table{width:100%;border-collapse:collapse;margin-bottom:1rem;}th{background:#f1f5f9;padding:5px 8px;text-align:right;font-size:10px;font-weight:700;border:1px solid #e2e8f0;}th:first-child{text-align:left;}td{padding:5px 8px;border:1px solid #e2e8f0;text-align:right;}td:first-child{text-align:left;}.tot{font-weight:800;background:#f8fafc;}.g{color:#059669;font-weight:700;}.r{color:#dc2626;font-weight:700;}.a{color:#d97706;font-weight:800;font-size:13px;}.saldo-row{background:#1a1a2e;color:white;font-weight:800;font-size:13px;}.saldo-row td{border-color:#1a1a2e;color:white;}.socio-box{border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:10px;}.socio-title{font-weight:800;font-size:12px;text-align:center;margin-bottom:8px;padding:4px;background:#f1f5f9;border-radius:4px;}.row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f1f5f9;}.pagar{display:flex;justify-content:space-between;padding:8px 4px 4px;font-weight:800;font-size:14px;border-top:2px solid #1a1a2e;margin-top:4px;}.neg{color:#dc2626;}.pos{color:#059669;}@media print{@page{size:A4;margin:1.5cm}}</style></head><body>
    <h3>${neg.emoji} ${neg.name}</h3>
    <p style="text-align:center;color:#475569;font-size:10px;margin-bottom:1rem;">Cierre Semanal del ${desdePrint} al ${hastaPrint}</p>
    <h2>Ingresos ${neg.name} Semana del ${desdePrint} al ${hastaPrint}</h2>
    <table><thead><tr><th>Fecha</th><th>Venta día</th><th>Gastos Diarios</th><th>Efectivo</th><th>Transferencias</th></tr></thead><tbody>
    ${dias.map(d=>`<tr><td>${d.fecha}</td><td class="g">$${d.ventas.toLocaleString('es-CO')}</td><td class="r">$${d.gastoDiario.toLocaleString('es-CO')}</td><td>$${d.efectivo.toLocaleString('es-CO')}</td><td>$${d.transferencias.toLocaleString('es-CO')}</td></tr>`).join('')}
    <tr class="tot"><td>Totales</td><td class="g">$${dias.reduce((s,d)=>s+d.ventas,0).toLocaleString('es-CO')}</td><td class="r">$${dias.reduce((s,d)=>s+d.gastoDiario,0).toLocaleString('es-CO')}</td><td>$${totEfectivo.toLocaleString('es-CO')}</td><td>$${totTransferencias.toLocaleString('es-CO')}</td></tr>
    <tr class="tot"><td colspan="3">Dinero acumulado en efectivo más transferencias</td><td colspan="2" class="a">$${totIngresos.toLocaleString('es-CO')}</td></tr></tbody></table>
    <h2>Gastos ${neg.name} del ${desdePrint} al ${hastaPrint}</h2>
    <table><thead><tr><th>Descripción</th><th>Categoría</th><th>Monto</th></tr></thead><tbody>
    ${gastos.map(g=>`<tr><td>${g.descripcion||g.desc}</td><td>${g.cat}</td><td class="r">$${g.monto.toLocaleString('es-CO')}</td></tr>`).join('')}
    <tr class="tot"><td colspan="2">Total</td><td class="r">$${totGastosSema.toLocaleString('es-CO')}</td></tr></tbody></table>
    <table style="max-width:400px;margin:0 auto 1rem;"><tr><td>Ingresos</td><td>$${totIngresos.toLocaleString('es-CO')}</td></tr><tr><td>Egresos</td><td class="r">$${totGastosSema.toLocaleString('es-CO')}</td></tr><tr class="saldo-row"><td><strong>Saldo</strong></td><td><strong>$${saldo.toLocaleString('es-CO')}</strong></td></tr></table>
    ${liquidacion.map(liq=>`<div class="socio-box"><div class="socio-title">Pago a ${liq.nombre}</div><div class="row"><span>${liq.nombre} ${liq.pct}% Ganancias</span><span class="pos">$${liq.ganancia.toLocaleString('es-CO')}</span></div>${liq.nequi>0?`<div class="row"><span>Menos Nequi</span><span class="neg">-$${liq.nequi.toLocaleString('es-CO')}</span></div>`:''} ${liq.bancolombia>0?`<div class="row"><span>Menos Bancolombia</span><span class="neg">-$${liq.bancolombia.toLocaleString('es-CO')}</span></div>`:''} ${liq.datafono>0?`<div class="row"><span>Menos Datáfono</span><span class="neg">-$${liq.datafono.toLocaleString('es-CO')}</span></div>`:''} ${liq.daviplata>0?`<div class="row"><span>Menos Daviplata</span><span class="neg">-$${liq.daviplata.toLocaleString('es-CO')}</span></div>`:''} ${liq.llave>0?`<div class="row"><span>Menos Llave</span><span class="neg">-$${liq.llave.toLocaleString('es-CO')}</span></div>`:''} ${liq.qr>0?`<div class="row"><span>Menos QR</span><span class="neg">-$${liq.qr.toLocaleString('es-CO')}</span></div>`:''} ${liq.cxcFavor>0?`<div class="row"><span>CxC (en contra del socio)</span><span class="neg">-$${liq.cxcFavor.toLocaleString('es-CO')}</span></div>`:''} ${liq.cxcContra>0?`<div class="row"><span>CxC (a favor del socio)</span><span class="pos">+$${liq.cxcContra.toLocaleString('es-CO')}</span></div>`:''} ${liq.facturas>0?`<div class="row"><span>Facturas pagadas por socio</span><span class="pos">+$${liq.facturas.toLocaleString('es-CO')}</span></div>`:''}<div class="pagar"><span>Total a pagar ${liq.nombre}</span><span class="${liq.aPagar<0?'neg':'pos'}">$${liq.aPagar.toLocaleString('es-CO')}</span></div></div>`).join('')}
    <p style="text-align:center;font-size:9px;color:#6366f1;margin-top:2rem;border-top:1px solid #e2e8f0;padding-top:0.5rem;">GestiónBar · Cierre Semanal · Generado ${new Date().toLocaleString('es-CO')}</p>
    <script>window.onload=()=>window.print();</script></body></html>`;
    const w=window.open('','_blank','width=900,height=750');
    w.document.write(html); w.document.close();
  };

  const printCierreFromHist = (c, neg) => printCierre(
    {neg, dias:c.dias||[], gastos:c.gastos||[], totEfectivo:c.totEfectivo,
     totTransferencias:c.totTransferencias, totIngresos:c.totIngresos,
     totGastosSema:c.totGastosSema, saldo:c.saldo, liquidacion:c.liquidacion||[]},
    c.fechaDesde, c.fechaHasta
  );

  // ── Shared date shortcuts ───────────────────────────────────────────────────
  const shortcuts = [
    ['Últimos 7 días',  ()=>{const d=new Date(),d7=new Date(d);d7.setDate(d.getDate()-7);setDesde(fmt(d7));setHasta(fmt(d));}],
    ['Esta semana',     ()=>{const d=new Date(),l=new Date(d);l.setDate(d.getDate()-d.getDay()+1);setDesde(fmt(l));setHasta(fmt(d));}],
    ['Últimos 15 días', ()=>{const d=new Date(),d15=new Date(d);d15.setDate(d.getDate()-15);setDesde(fmt(d15));setHasta(fmt(d));}],
    ['Este mes',        ()=>{const d=new Date();setDesde(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);setHasta(fmt(d));}],
  ];

  // ══════════════════════════════════════════════════════════════════════════════
  // PASO 1 — Configurar período
  // ══════════════════════════════════════════════════════════════════════════════
  if (paso==='config') return (
    <div>
      <SectionTitle>📅 Cierres Semanales</SectionTitle>
      <div style={{...s.card,marginBottom:'1.25rem'}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div><div style={s.label}>Desde</div><input style={{...s.inp,width:150}} type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></div>
          <div><div style={s.label}>Hasta</div><input style={{...s.inp,width:150}} type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></div>
          <button style={{...s.btn('primary'),padding:'9px 22px',fontSize:13}} onClick={cargarDatos} disabled={loading||selNegs.length===0}>
            {loading?'Cargando...':'📋 Cargar Datos'}
          </button>
        </div>
        <div style={{marginTop:10,display:'flex',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:11,color:C.sub,alignSelf:'center'}}>Atajos:</span>
          {shortcuts.map(([l,fn])=><button key={l} style={{...s.btn(),fontSize:10,padding:'3px 8px',color:C.sub}} onClick={fn}>{l}</button>)}
        </div>
      </div>
      <div style={{...s.card,textAlign:'center',color:C.sub,padding:'2.5rem',fontSize:13}}>
        Selecciona el período y presiona <strong style={{color:C.amber}}>Cargar Datos</strong> para elegir las planillas y gastos a incluir en el cierre.
      </div>

      {/* ── Historial de cierres ──────────────────────────────────────────── */}
      {visibles.some(n=>(cierresHist[n.id]||[]).length>0)&&(
        <div style={{marginTop:'1.5rem'}}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:'0.75rem',color:C.amber}}>📚 Historial de Cierres</div>
          {visibles.map(neg=>{
            const cierres=cierreHistoryPage.pageItems.filter(row=>row.negId===neg.id).map(row=>row.cierre);
            if(!cierres.length) return null;
            return(
              <div key={neg.id} style={{...s.card,marginBottom:'1rem',borderColor:neg.color+'40'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:'0.75rem'}}>
                  <span style={{fontSize:18}}>{neg.emoji}</span>
                  <span style={{fontWeight:700,color:neg.color}}>{neg.name}</span>
                  <Badge color={neg.color} small>{cierres.length} cierres</Badge>
                </div>
                {cierres.map(c=>(
                  <div key={c.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${C.border}40`,fontSize:12}}>
                    <div style={{flex:1}}>
                      <span style={{fontWeight:700}}>{c.fechaDesde} → {c.fechaHasta}</span>
                      <span style={{color:C.sub,marginLeft:8,fontSize:11}}>{new Date(c.savedAt).toLocaleDateString('es-CO')}</span>
                      <span style={{color:C.sub,marginLeft:8}}>{c.planillaIds?.length||0} planillas · {c.gastoIds?.length||0} gastos</span>
                    </div>
                    <span style={{color:C.green,fontWeight:700}}>{COP(c.saldo)}</span>
                    <button style={{...s.btn('primary'),padding:'2px 8px',fontSize:11}} onClick={()=>printCierreFromHist(c,neg)}>🖨 PDF</button>
                    <button style={{...s.btn(),padding:'2px 8px',fontSize:11,color:C.red,border:`1px solid ${C.red}30`}} onClick={()=>borrarCierre(neg.id,c.id)}>✕ Borrar</button>
                  </div>
                ))}
              </div>
            );
          })}
          <PaginationTabs totalItems={cierreHistoryRows.length} page={cierreHistoryPage.page} onPageChange={cierreHistoryPage.setPage} />
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // PASO 2 — Seleccionar planillas y gastos
  // ══════════════════════════════════════════════════════════════════════════════
  if (paso==='seleccion') {
    const negsActivos = visibles.filter(n=>selNegs.includes(n.id));
    return (
      <div>
        <SectionTitle action={
          <div style={{display:'flex',gap:8}}>
            <button style={{...s.btn(),fontSize:12}} onClick={()=>setPaso('config')}>← Volver</button>
            <button style={{...s.btn('primary'),fontSize:13,padding:'8px 20px'}} onClick={()=>setPaso('cierre')}>Generar Cierre →</button>
          </div>
        }>📅 Selección — {desde} al {hasta}</SectionTitle>

        <div style={{fontSize:12,color:C.sub,marginBottom:'1.25rem'}}>
          Marca las planillas y gastos que harán parte del cierre. Los totales se actualizan en tiempo real.
        </div>

        {negsActivos.map(neg => {
          const pls   = planillasRango[neg.id]||[];
          const gas   = gastosRango[neg.id]||[];
          const selPl = selPlanillas[neg.id]||[];
          const selGa = selGastos[neg.id]||[];
          const allPlSel = pls.length>0 && selPl.length===pls.length;
          const allGaSel = gas.length>0 && selGa.length===gas.length;

          // Live preview
          const plSel  = pls.filter(p=>selPl.includes(p.id));
          const gaSel  = gas.filter(g=>selGa.includes(g.id));
          const planillaPageKey = `${neg.id}:planillas`;
          const expensePageKey = `${neg.id}:gastos`;
          const planillaPage = getVisiblePage(pls, listPages[planillaPageKey] || 1);
          const expensePage = getVisiblePage(gas, listPages[expensePageKey] || 1);
          const prevEfectivo  = plSel.reduce((a,p)=>a+(p.neto!==undefined?p.neto:(p.ventas||0)-(p.bancos||0)-(p.gastos||0)-(p.personal||0)),0);
          const prevBancos    = plSel.reduce((a,p)=>a+(p.bancos||0),0);
          const prevIngresos  = prevEfectivo+prevBancos;
          const prevGastos    = gaSel.reduce((a,g)=>a+g.monto,0);
          const prevSaldo     = prevIngresos-prevGastos;

          return (
            <div key={neg.id} style={{...s.card,marginBottom:'1.5rem',borderColor:neg.color+'50'}}>
              {/* Header */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1.25rem'}}>
                <div style={{width:34,height:34,borderRadius:8,background:neg.color+'25',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{neg.emoji}</div>
                <div style={{fontWeight:800,fontSize:15,color:neg.color}}>{neg.name}</div>
              </div>

              {/* ── Planillas ──────────────────────────────────────────── */}
              <div style={{marginBottom:'1.25rem'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:12}}>
                    📋 Planillas del período
                    <span style={{color:C.sub,fontWeight:400,marginLeft:6}}>({selPl.length}/{pls.length} seleccionadas)</span>
                  </div>
                  {pls.length>0&&(
                    <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,cursor:'pointer',color:C.sub}}>
                      <input type="checkbox" checked={allPlSel}
                        onChange={e=>setSelPlanillas(p=>({...p,[neg.id]:e.target.checked?pls.map(x=>x.id):[]}))}
                        style={{accentColor:neg.color}}/>
                      {allPlSel?'Deseleccionar todas':'Seleccionar todas'}
                    </label>
                  )}
                </div>
                {pls.length===0
                  ? <div style={{color:C.sub,fontSize:12,padding:'0.75rem',textAlign:'center',background:C.surface,borderRadius:8}}>Sin planillas en este período</div>
                  : <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:580}}>
                      <thead>
                        <tr style={{background:C.surface}}>
                          {['','Fecha','Apertura','Ventas','Gastos+Personal','Efectivo','Transferencias'].map(h=>(
                            <th key={h} style={{...s.th,textAlign:['Ventas','Gastos+Personal','Efectivo','Transferencias'].includes(h)?'right':'left'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {planillaPage.items.map((p,i)=>{
                          const isSel=selPl.includes(p.id);
                          const gastDia=(p.gastos||0)+(p.personal||0);
                          const efect=p.neto!==undefined?p.neto:(p.ventas||0)-(p.bancos||0)-gastDia;
                          return (
                            <tr key={p.id} style={{background:isSel?(i%2===0?C.rowA:C.rowB):C.bg,opacity:isSel?1:0.4}}>
                              <td style={{...s.td(i),width:32}}>
                                <input type="checkbox" checked={isSel} onChange={()=>togglePl(neg.id,p.id)}
                                  style={{accentColor:neg.color,width:14,height:14,cursor:'pointer'}}/>
                              </td>
                              <td style={{...s.td(i),fontWeight:isSel?600:400}}>{p.fecha}</td>
                              <td style={s.td(i)}>{p.apertura||'—'}</td>
                              <td style={{...s.td(i),textAlign:'right',color:C.green,fontWeight:600}}>{COP(p.ventas||0)}</td>
                              <td style={{...s.td(i),textAlign:'right',color:C.red}}>{COP(gastDia)}</td>
                              <td style={{...s.td(i),textAlign:'right',fontWeight:600}}>{COP(efect)}</td>
                              <td style={{...s.td(i),textAlign:'right',color:C.indigo}}>{COP(p.bancos||0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <PaginationTabs totalItems={pls.length} page={planillaPage.page} onPageChange={page=>changeListPage(planillaPageKey,page)} />
                  </div>
                }
              </div>

              {/* ── Gastos ─────────────────────────────────────────────── */}
              <div style={{marginBottom:'1.25rem'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontWeight:700,fontSize:12}}>
                    💸 Gastos del período
                    <span style={{color:C.sub,fontWeight:400,marginLeft:6}}>({selGa.length}/{gas.length} seleccionados)</span>
                  </div>
                  {gas.length>0&&(
                    <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,cursor:'pointer',color:C.sub}}>
                      <input type="checkbox" checked={allGaSel}
                        onChange={e=>setSelGastos(p=>({...p,[neg.id]:e.target.checked?gas.map(x=>x.id):[]}))}
                        style={{accentColor:neg.color}}/>
                      {allGaSel?'Deseleccionar todos':'Seleccionar todos'}
                    </label>
                  )}
                </div>
                {gas.length===0
                  ? <div style={{color:C.sub,fontSize:12,padding:'0.75rem',textAlign:'center',background:C.surface,borderRadius:8}}>Sin gastos registrados en este período</div>
                  : <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',minWidth:420}}>
                      <thead>
                        <tr style={{background:C.surface}}>
                          {['','Fecha','Descripción','Categoría','Monto'].map(h=>(
                            <th key={h} style={{...s.th,textAlign:h==='Monto'?'right':'left'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {expensePage.items.map((g,i)=>{
                          const isSel=selGa.includes(g.id);
                          return (
                            <tr key={g.id} style={{background:isSel?(i%2===0?C.rowA:C.rowB):C.bg,opacity:isSel?1:0.4}}>
                              <td style={{...s.td(i),width:32}}>
                                <input type="checkbox" checked={isSel} onChange={()=>toggleGa(neg.id,g.id)}
                                  style={{accentColor:neg.color,width:14,height:14,cursor:'pointer'}}/>
                              </td>
                              <td style={s.td(i)}>{g.fecha}</td>
                              <td style={s.td(i)}>{g.descripcion||g.desc}</td>
                              <td style={s.td(i)}><Badge color={C.amber} small>{g.cat}</Badge></td>
                              <td style={{...s.td(i),textAlign:'right',color:C.red,fontWeight:600}}>{COP(g.monto)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <PaginationTabs totalItems={gas.length} page={expensePage.page} onPageChange={page=>changeListPage(expensePageKey,page)} />
                  </div>
                }
              </div>

              {/* ── Live preview totals ─────────────────────────────────── */}
              <div style={{background:C.surface,borderRadius:10,padding:'0.75rem 1rem',border:`1px solid ${neg.color}30`}}>
                <div style={{fontSize:10,color:C.sub,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>Resumen de lo seleccionado</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {[
                    ['Efectivo',       prevEfectivo,  C.text],
                    ['Transferencias', prevBancos,    C.indigo],
                    ['Total Ingresos', prevIngresos,  neg.color],
                    ['Gastos',         prevGastos,    C.red],
                    ['Saldo',          prevSaldo,     prevSaldo>=0?C.green:C.red],
                  ].map(([label,val,col])=>(
                    <div key={label} style={{background:C.card,borderRadius:8,padding:'6px 12px',border:`1px solid ${C.border}`,minWidth:120,flex:1}}>
                      <div style={{fontSize:9,color:C.sub,textTransform:'uppercase',marginBottom:2}}>{label}</div>
                      <div style={{fontWeight:700,fontSize:13,color:col}}>{COP(val)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:'0.5rem',paddingBottom:'2rem'}}>
          <button style={{...s.btn(),fontSize:13,padding:'9px 20px'}} onClick={()=>setPaso('config')}>← Volver</button>
          <button style={{...s.btn('primary'),fontSize:13,padding:'9px 24px'}} onClick={()=>setPaso('cierre')}>Generar Cierre →</button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PASO 3 — Cierre final
  // ══════════════════════════════════════════════════════════════════════════════
  const negData = visibles.filter(n=>selNegs.includes(n.id)).map(calcCierre);
  return (
    <div>
      <SectionTitle action={
        <button style={{...s.btn(),fontSize:12}} onClick={()=>setPaso('seleccion')}>← Modificar selección</button>
      }>📅 Cierres Semanales</SectionTitle>

      {negData.map(cd => {
        const{neg,dias,gastos,totEfectivo,totTransferencias,totIngresos,totGastosSema,saldo,sc,liquidacion}=cd;
        const catGastos=gastos.reduce((acc,g)=>{acc[g.cat]=(acc[g.cat]||0)+g.monto;return acc;},{});
        const dailyPageKey = `${neg.id}:daily-report`;
        const closureExpensePageKey = `${neg.id}:expense-report`;
        const dailyPage = getVisiblePage(dias, listPages[dailyPageKey] || 1);
        const closureExpensePage = getVisiblePage(gastos, listPages[closureExpensePageKey] || 1);
        return (
          <div key={neg.id} style={{marginBottom:'2rem'}}>
            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:38,height:38,borderRadius:10,background:neg.color+'25',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{neg.emoji}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:16,color:neg.color}}>{neg.name}</div>
                  <div style={{fontSize:11,color:C.sub}}>{desde} al {hasta} · {dias.length} turnos · {gastos.length} gastos</div>
                </div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                {savedNegs.has(neg.id)
                  ? <Badge color={C.green}>✓ Cierre Guardado</Badge>
                  : <button style={{...s.btn('primary'),padding:'7px 16px',fontSize:12,background:C.green,color:'#0b0b14',fontWeight:700}} onClick={()=>guardarCierre(cd)}>✓ Guardar Cierre</button>
                }
                <button style={{...s.btn('primary'),padding:'7px 16px',fontSize:12,background:neg.color,color:'#0b0b14'}} onClick={()=>printCierre(cd)}>🖨 PDF</button>
              </div>
            </div>

            {/* Ingresos */}
            <div style={{...s.card,marginBottom:'1rem',borderColor:neg.color+'40'}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem',color:neg.color}}>Ingresos {neg.name} — Semana {desde} al {hasta}</div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                  <thead><tr style={{background:C.surface}}>{['Fecha','Venta Día','Gastos Diarios','Efectivo','Transferencias'].map(h=><th key={h} style={{...s.th,textAlign:h==='Fecha'?'left':'right'}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {dailyPage.items.map((d,i)=>(
                      <tr key={i}>
                        <td style={s.td(i)}>{d.fecha}</td>
                        <td style={{...s.td(i),textAlign:'right',color:C.green,fontWeight:600}}>{COP(d.ventas)}</td>
                        <td style={{...s.td(i),textAlign:'right',color:C.red}}>{COP(d.gastoDiario)}</td>
                        <td style={{...s.td(i),textAlign:'right',fontWeight:600}}>{COP(d.efectivo)}</td>
                        <td style={{...s.td(i),textAlign:'right',color:C.indigo}}>{COP(d.transferencias)}</td>
                      </tr>
                    ))}
                    {dias.length===0&&<tr><td colSpan={5} style={{padding:'1rem',textAlign:'center',color:C.sub,fontSize:12}}>Sin planillas seleccionadas</td></tr>}
                    <tr style={{background:neg.color+'15'}}>
                      <td style={{...s.td(0),fontWeight:800}}>Totales</td>
                      <td style={{...s.td(0),textAlign:'right',color:C.green,fontWeight:800}}>{COP(dias.reduce((s,d)=>s+d.ventas,0))}</td>
                      <td style={{...s.td(0),textAlign:'right',color:C.red,fontWeight:700}}>{COP(dias.reduce((s,d)=>s+d.gastoDiario,0))}</td>
                      <td style={{...s.td(0),textAlign:'right',fontWeight:800}}>{COP(totEfectivo)}</td>
                      <td style={{...s.td(0),textAlign:'right',color:C.indigo,fontWeight:800}}>{COP(totTransferencias)}</td>
                    </tr>
                    <tr style={{background:neg.color+'25'}}>
                      <td colSpan={3} style={{...s.td(0),fontWeight:700,fontSize:12}}>Dinero acumulado en efectivo más transferencias</td>
                      <td colSpan={2} style={{...s.td(0),textAlign:'right',color:neg.color,fontWeight:800,fontSize:16}}>{COP(totIngresos)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <PaginationTabs totalItems={dias.length} page={dailyPage.page} onPageChange={page=>changeListPage(dailyPageKey,page)} />
              <div style={{marginTop:'0.75rem',display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap'}}>
                {[['Total Efectivo',totEfectivo,C.text],['Total Transferencias',totTransferencias,C.indigo],['Total Ingresos',totIngresos,neg.color]].map(([l,v,col])=>(
                  <div key={l} style={{background:C.surface,borderRadius:8,padding:'8px 14px',border:`1px solid ${C.border}`,textAlign:'right',minWidth:160}}>
                    <div style={{fontSize:10,color:C.sub,textTransform:'uppercase'}}>{l}</div>
                    <div style={{fontWeight:800,fontSize:15,color:col,marginTop:2}}>{COP(v)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gastos */}
            <div style={{...s.card,marginBottom:'1rem',borderColor:C.red+'30'}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem',color:C.red}}>Gastos {neg.name} — del {desde} al {hasta}</div>
              {gastos.length===0
                ? <div style={{color:C.sub,fontSize:12,padding:'0.75rem',textAlign:'center'}}>Sin gastos seleccionados.</div>
                : <>
                  <table style={{width:'100%',borderCollapse:'collapse',marginBottom:'0.75rem'}}>
                    <thead><tr style={{background:C.surface}}>{['Descripción','Categoría','Monto'].map(h=><th key={h} style={{...s.th,textAlign:h==='Monto'?'right':'left'}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {closureExpensePage.items.map((g,i)=>(
                        <tr key={g.id}>
                          <td style={s.td(i)}>{g.descripcion||g.desc}</td>
                          <td style={s.td(i)}><Badge color={C.amber} small>{g.cat}</Badge></td>
                          <td style={{...s.td(i),textAlign:'right',color:C.red,fontWeight:600}}>{COP(g.monto)}</td>
                        </tr>
                      ))}
                      <tr style={{background:C.red+'12'}}>
                        <td colSpan={2} style={{...s.td(0),fontWeight:800}}>Total Gastos Semanales</td>
                        <td style={{...s.td(0),textAlign:'right',color:C.red,fontWeight:800,fontSize:14}}>{COP(totGastosSema)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <PaginationTabs totalItems={gastos.length} page={closureExpensePage.page} onPageChange={page=>changeListPage(closureExpensePageKey,page)} />
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {Object.entries(catGastos).sort((a,b)=>b[1]-a[1]).map(([cat,tot])=>(
                      <div key={cat} style={{background:C.amber+'18',borderRadius:6,padding:'4px 10px',fontSize:11,border:`1px solid ${C.amber}30`}}>
                        <span style={{color:C.amber,fontWeight:600}}>{cat}:</span> <span style={{color:C.red,fontWeight:700}}>{COP(tot)}</span>
                      </div>
                    ))}
                  </div>
                </>
              }
            </div>

            {/* Balance */}
            <div style={{...s.card,marginBottom:'1rem',borderColor:C.green+'40'}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>Balance del Período</div>
              <div style={{maxWidth:380}}>
                {[['Ingresos (Efectivo + Bancos)',totIngresos,C.green],['Egresos (Gastos Semanales)',totGastosSema,C.red]].map(([l,v,col])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',borderBottom:`1px solid ${C.border}40`,fontSize:13}}>
                    <span style={{color:C.sub}}>{l}</span>
                    <span style={{fontWeight:700,color:col}}>{COP(v)}</span>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'12px',background:C.surface,borderRadius:8,marginTop:8,border:`2px solid ${saldo>=0?C.green:C.red}`}}>
                  <span style={{fontWeight:800,fontSize:15}}>Saldo</span>
                  <span style={{fontWeight:900,fontSize:22,color:saldo>=0?C.green:C.red}}>{COP(saldo)}</span>
                </div>
              </div>
            </div>

            {/* Socios */}
            <div style={{...s.card,borderColor:C.amber+'50'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                <div style={{fontWeight:700,fontSize:13,color:C.amber}}>Distribución de Utilidades</div>
                <button style={{...s.btn('primary'),padding:'4px 12px',fontSize:11}} onClick={()=>addSocio(neg.id)}>+ Socio</button>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:'1rem',flexWrap:'wrap'}}>
                {(sc||[]).map(so=>(
                  <div key={so.id} style={{background:neg.color+'18',border:`1px solid ${neg.color}40`,borderRadius:8,padding:'8px 14px',minWidth:160}}>
                    <div style={{fontSize:11,color:C.sub}}>{so.nombre} ({so.pct}%)</div>
                    <div style={{fontWeight:800,fontSize:16,color:neg.color,marginTop:2}}>{COP(Math.round(saldo*(so.pct/100)))}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:'1rem'}}>
                {(sc||[]).map(so=>{
                  const ganancia=Math.round(saldo*(so.pct/100));
                  const susBancos=(so.nequi||0)+(so.bancolombia||0)+(so.datafono||0)+(so.daviplata||0)+(so.llave||0);
                  const aPagar=ganancia-susBancos-(so.cxcFavor||0)+(so.cxcContra||0)+(so.facturas||0);
                  return (
                    <div key={so.id} style={{background:C.surface,borderRadius:10,padding:'1rem',border:`1px solid ${neg.color}30`}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                        <input style={{...s.inp,fontWeight:700,fontSize:13,width:'auto',flex:1}} value={so.nombre} onChange={e=>updSocio(neg.id,so.id,'nombre',e.target.value)}/>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:8}}>
                          <input style={{...s.inp,width:55,textAlign:'center'}} type="number" value={so.pct} onChange={e=>updSocio(neg.id,so.id,'pct',Number(e.target.value))}/><span style={{fontSize:12,color:C.sub}}>%</span>
                          <button style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:12}} onClick={()=>delSocio(neg.id,so.id)}>✕</button>
                        </div>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:`1px solid ${C.border}40`,fontSize:12}}>
                        <span>{so.nombre} {so.pct}% Ganancias</span>
                        <span style={{color:C.green,fontWeight:700}}>{COP(ganancia)}</span>
                      </div>
                      <div style={{marginTop:'0.5rem',fontSize:11,color:C.sub,marginBottom:4}}>Bancos recibidos (a descontar):</div>
                      {[['nequi','Nequi'],['bancolombia','Bancolombia'],['datafono','Datáfono'],['daviplata','Daviplata'],['llave','Llave'],['qr','QR']].map(([k,label])=>(
                        <div key={k} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                          <div style={{minWidth:90,fontSize:11,color:C.text}}>{label}</div>
                          <input style={{...s.inp,maxWidth:130,fontSize:11,padding:'3px 8px'}} type="number" placeholder="0" value={so[k]||''} onChange={e=>updSocio(neg.id,so.id,k,parseInt(e.target.value)||0)}/>
                          {so[k]>0&&<span style={{color:C.red,fontSize:11,fontWeight:600}}>-{COP(so[k])}</span>}
                        </div>
                      ))}
                      <div style={{marginTop:'0.75rem',display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                        <div><div style={s.label}>CxC (en contra)</div><input style={{...s.inp,fontSize:11,padding:'3px 8px'}} type="number" placeholder="0" value={so.cxcFavor||''} onChange={e=>updSocio(neg.id,so.id,'cxcFavor',parseInt(e.target.value)||0)}/></div>
                        <div><div style={s.label}>CxC (a favor)</div><input style={{...s.inp,fontSize:11,padding:'3px 8px'}} type="number" placeholder="0" value={so.cxcContra||''} onChange={e=>updSocio(neg.id,so.id,'cxcContra',parseInt(e.target.value)||0)}/></div>
                        <div style={{gridColumn:'span 2'}}><div style={s.label}>Facturas pagadas por socio (+)</div><input style={{...s.inp,fontSize:11,padding:'3px 8px'}} type="number" placeholder="0" value={so.facturas||''} onChange={e=>updSocio(neg.id,so.id,'facturas',parseInt(e.target.value)||0)}/></div>
                      </div>
                      <div style={{marginTop:'0.75rem',padding:'10px 12px',borderRadius:8,background:aPagar>=0?C.green+'18':C.red+'18',border:`1px solid ${aPagar>=0?C.green:C.red}40`}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <span style={{fontWeight:700,fontSize:13}}>Total a pagar {so.nombre}</span>
                          <span style={{fontWeight:900,fontSize:18,color:aPagar>=0?C.green:C.red}}>{COP(aPagar)}</span>
                        </div>
                        {aPagar<0&&<div style={{fontSize:10,color:C.red,marginTop:4}}>⚠ Valor negativo: el socio recibió más de lo que le corresponde</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
