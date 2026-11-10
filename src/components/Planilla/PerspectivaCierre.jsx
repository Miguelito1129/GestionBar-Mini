/**
 * PerspectivaCierre.jsx
 * Vista pre-cierre: inventario 100%, desglose financiero completo y neto estimado.
 * Puramente presentacional — no modifica ningún estado, solo lee lo que recibe.
 */
import { C, COP } from '../../constants/theme.js';

const PLAT_COLORS = {
  nequi:'#FF0066', bancolombia:'#FFCD00', datafono:'#34d399',
  daviplata:'#FF4500', llave:'#67e8f9', qr:'#a78bfa', otro:'#94a3b8',
};
const PLAT_LABELS = {
  nequi:'Nequi', bancolombia:'Bancolombia', datafono:'Datáfono',
  daviplata:'Daviplata', llave:'Llave', qr:'QR', otro:'Otro',
};

const ROL_LABELS = {
  barra:'Barra', dj:'DJ', mesero:'Mesero', patin:'Patín',
  seguridad:'Seguridad', aseo:'Aseo', barra_fija:'Barra (fijo)', mesero_fijo:'Mesero (fijo)',
};

/* ── helpers de estilo ───────────────────────────────────────────────────── */
const card  = (extra={}) => ({ background:C.card, borderRadius:10, padding:'1rem', border:`1px solid ${C.border}`, ...extra });
const hdr   = () => ({ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.sub, padding:'6px 8px', textAlign:'right', borderBottom:`1px solid ${C.border}` });
const cell  = (i, right=true) => ({ fontSize:12, padding:'5px 8px', borderBottom:`1px solid ${C.border}20`, background: i%2===0?C.rowA:C.rowB, textAlign: right?'right':'left' });
const subtot= (right=true) => ({ fontSize:12, padding:'6px 8px', fontWeight:800, borderTop:`1px solid ${C.border}`, color:C.amber, textAlign:right?'right':'left' });

export default function PerspectivaCierre({
  negocio, movs, gastosT, bancosTransfs, ventasMesero,
  pctBarra, pctMeseros, extras, pendientes, apertura,
  totalVentas, totalBancos, totalGastosT, totalPersonal, neto,
  pagoBarra, pagoDJ, pagoMeseros, pagoFijosStaff,
  barman, dj, meseros,
}) {
  const fecha     = new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
  const horaActual= new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});

  /* ── Inventario: todos los productos ──────────────────────────────────── */
  const productos = negocio.productos || [];
  const filas = productos.map(p => {
    const m         = movs[p.id] || {};
    const salidas   = m.salidas  || 0;
    const entradas  = m.entradas || 0;
    const existencias = m.existencias;
    const finalEst  = existencias !== undefined
      ? existencias
      : Math.max(0, p.stock + entradas - salidas);
    const vendidas  = Math.max(0, salidas - (m.cortesia || 0));
    const venta     = m.ventaManual !== undefined
      ? m.ventaManual
      : vendidas * p.price;
    const activo    = salidas > 0 || entradas > 0 || m.cortesia > 0 || existencias !== undefined;
    return { ...p, m, salidas, entradas, finalEst, vendidas, venta, activo };
  });

  const activosFirst = [...filas.filter(f=>f.activo), ...filas.filter(f=>!f.activo)];

  /* ── Desglose de transferencias ──────────────────────────────────────── */
  const transfAgg = {};
  bancosTransfs.forEach(t => {
    transfAgg[t.plataforma] = (transfAgg[t.plataforma] || 0) + (t.monto || 0);
  });
  const transfRows = Object.entries(transfAgg).filter(([,v])=>v>0);

  /* ── Desglose de personal ────────────────────────────────────────────── */
  const personalRows = [];
  if (barman && pagoBarra > 0)
    personalRows.push({ name: barman.name, rol: 'barra', pago: pagoBarra, nota: `${pctBarra}% ventas` });
  if (dj && pagoDJ > 0)
    personalRows.push({ name: dj.name, rol: 'dj', pago: pagoDJ });
  pagoMeseros.filter(m=>m.pago>0).forEach(m =>
    personalRows.push({ name: m.name, rol: 'mesero', pago: m.pago, nota: `${pctMeseros}% de ${COP(m.venta||0)}` })
  );
  pagoFijosStaff.filter(p=>typeof p.pay==='number'&&p.pay>0).forEach(p =>
    personalRows.push({ name: p.name, rol: p.rol, pago: p.pay })
  );

  /* ── Gastos con monto > 0 ────────────────────────────────────────────── */
  const gastosActivos = gastosT.filter(g => g.monto > 0);

  const extrasN    = parseInt(extras)    || 0;
  const pendientesN= parseInt(pendientes)|| 0;

  /* ── Print ───────────────────────────────────────────────────────────── */
  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1000,height=780');
    win.document.write(generarHTML({
      negocio, fecha, horaActual, apertura, activosFirst,
      transfRows, personalRows, gastosActivos,
      totalVentas, totalBancos, totalGastosT, totalPersonal,
      extrasN, pendientesN, neto,
    }));
    win.document.close();
  };

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{display:'flex',flexDirection:'column',gap:'1rem',paddingBottom:'2rem'}}>

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div style={{...card(),display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.75rem',
        background:`linear-gradient(135deg,${negocio.color}18 0%,${C.card} 60%)`}}>
        <div>
          <div style={{fontWeight:800,fontSize:16,color:negocio.color}}>
            {negocio.emoji} {negocio.name} — Perspectiva de Cierre
          </div>
          <div style={{fontSize:11,color:C.sub,marginTop:3}}>
            {fecha} &nbsp;·&nbsp; Apertura: <strong style={{color:C.text}}>{apertura}</strong>
            &nbsp;·&nbsp; Actualizado a las <strong style={{color:C.text}}>{horaActual}</strong>
          </div>
        </div>
        <button onClick={handlePrint} style={{background:negocio.color,color:'#fff',border:'none',
          borderRadius:8,padding:'8px 18px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
          🖨 Imprimir / PDF
        </button>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:'0.6rem'}}>
        {[
          { label:'💰 Ventas',        val:totalVentas,    color:C.green  },
          { label:'🏦 Transferencias',val:totalBancos,    color:C.indigo },
          { label:'👥 Personal',      val:totalPersonal,  color:C.amber  },
          { label:'🧾 Gastos',        val:totalGastosT,   color:C.red    },
          ...(extrasN>0 ? [{ label:'🥂 Extras', val:extrasN, color:C.purple }] : []),
          ...(pendientesN>0 ? [{ label:'⏳ Pendientes', val:pendientesN, color:C.red }] : []),
          { label:'📊 Neto Estimado', val:neto, color:neto>=0?C.green:C.red, big:true },
        ].map(k=>(
          <div key={k.label} style={{...card(),textAlign:'center',borderLeft:`3px solid ${k.color}`,
            ...(k.big?{gridColumn:'span 2',background:`${k.color}12`}:{})}}>
            <div style={{fontSize:9,color:C.sub,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>{k.label}</div>
            <div style={{fontSize:k.big?20:16,fontWeight:800,color:k.color}}>{COP(k.val)}</div>
          </div>
        ))}
      </div>

      {/* ── Tabla de Inventario ─────────────────────────────────────────── */}
      <div style={card()}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem',color:C.text}}>
          📦 Inventario del Turno
          <span style={{fontSize:10,color:C.sub,fontWeight:400,marginLeft:8}}>
            ({activosFirst.filter(f=>f.activo).length} productos con movimiento · {activosFirst.filter(f=>!f.activo).length} sin movimiento)
          </span>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr>
                {['Producto','Inicio','Entradas','Salidas','Final','Precio','Vendidas','Venta $'].map((h,i)=>(
                  <th key={h} style={{...hdr(), textAlign:i===0?'left':'right',
                    color: h==='Venta $'?C.green:C.sub}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activosFirst.map((f,i)=>(
                <tr key={f.id} style={{opacity: f.activo ? 1 : 0.45}}>
                  <td style={{...cell(i,false),fontWeight: f.activo?600:400,color: f.activo?C.text:C.sub}}>
                    {f.name}
                    {!f.activo&&<span style={{fontSize:9,color:C.sub,marginLeft:6}}>(sin movimiento)</span>}
                  </td>
                  <td style={cell(i)}>{f.stock}</td>
                  <td style={{...cell(i), color: f.entradas>0?C.green:C.sub, fontWeight:f.entradas>0?700:400}}>
                    {f.entradas>0?`+${f.entradas}`:f.entradas}
                  </td>
                  <td style={{...cell(i), color: f.salidas>0?C.amber:C.sub, fontWeight:f.salidas>0?700:400}}>
                    {f.salidas}
                  </td>
                  <td style={{...cell(i), fontWeight:700,
                    color: f.finalEst < 0 ? C.red : f.finalEst === 0 ? C.amber : C.text}}>
                    {f.finalEst}
                    {f.finalEst < 0 && <span style={{fontSize:9,marginLeft:4}}>⚠️</span>}
                  </td>
                  <td style={{...cell(i), color:C.sub}}>{COP(f.price)}</td>
                  <td style={cell(i)}>{f.vendidas}</td>
                  <td style={{...cell(i), color: f.venta>0?C.green:C.sub, fontWeight:f.venta>0?700:400}}>
                    {f.venta>0 ? COP(f.venta) : '—'}
                    {f.m.ventaManual!==undefined &&
                      <span style={{fontSize:9,background:C.amber,color:'#000',padding:'0 4px',borderRadius:3,marginLeft:4}}>AJ</span>}
                  </td>
                </tr>
              ))}
              {/* Total inventario */}
              <tr>
                <td style={subtot(false)}>TOTAL</td>
                <td style={subtot()}></td>
                <td style={{...subtot(),color:C.green}}>{activosFirst.reduce((s,f)=>s+f.entradas,0)||'—'}</td>
                <td style={subtot()}>{activosFirst.reduce((s,f)=>s+f.salidas,0)}</td>
                <td style={subtot()}></td>
                <td style={subtot()}></td>
                <td style={subtot()}>{activosFirst.reduce((s,f)=>s+f.vendidas,0)}</td>
                <td style={{...subtot(),color:C.green,fontSize:14}}>{COP(totalVentas)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Desglose financiero ─────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1rem'}}>

        {/* Transferencias */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:'0.6rem',color:C.indigo}}>🏦 Transferencias</div>
          {transfRows.length===0
            ? <div style={{color:C.sub,fontSize:11}}>Sin transferencias registradas</div>
            : transfRows.map(([plat,monto])=>(
              <div key={plat} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',
                borderBottom:`1px solid ${C.border}20`,fontSize:12}}>
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:PLAT_COLORS[plat]||C.sub,display:'inline-block'}}/>
                  <span style={{color:C.text}}>{PLAT_LABELS[plat]||plat}</span>
                </span>
                <span style={{fontWeight:700,color:C.indigo}}>{COP(monto)}</span>
              </div>
            ))
          }
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:6,
            borderTop:`1px solid ${C.border}`,fontWeight:800,fontSize:13}}>
            <span style={{color:C.sub}}>Total</span>
            <span style={{color:C.indigo}}>{COP(totalBancos)}</span>
          </div>
        </div>

        {/* Personal */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:'0.6rem',color:C.amber}}>👥 Personal</div>
          {personalRows.length===0
            ? <div style={{color:C.sub,fontSize:11}}>Sin personal configurado</div>
            : personalRows.map((p,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',
                borderBottom:`1px solid ${C.border}20`,fontSize:12}}>
                <span>
                  <span style={{color:C.text}}>{p.name}</span>
                  <span style={{fontSize:9,background:C.border,color:C.sub,padding:'1px 5px',borderRadius:8,marginLeft:5}}>
                    {ROL_LABELS[p.rol]||p.rol}
                  </span>
                  {p.nota&&<span style={{fontSize:9,color:C.sub,marginLeft:5}}>{p.nota}</span>}
                </span>
                <span style={{fontWeight:700,color:C.amber}}>{COP(p.pago)}</span>
              </div>
            ))
          }
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:6,
            borderTop:`1px solid ${C.border}`,fontWeight:800,fontSize:13}}>
            <span style={{color:C.sub}}>Total</span>
            <span style={{color:C.amber}}>{COP(totalPersonal)}</span>
          </div>
        </div>

        {/* Gastos */}
        <div style={card()}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:'0.6rem',color:C.red}}>🧾 Gastos del Turno</div>
          {gastosActivos.length===0
            ? <div style={{color:C.sub,fontSize:11}}>Sin gastos registrados</div>
            : gastosActivos.map((g,i)=>(
              <div key={g.id||i} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',
                borderBottom:`1px solid ${C.border}20`,fontSize:12}}>
                <span style={{color:C.text,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {g.desc}
                </span>
                <span style={{fontWeight:700,color:C.red}}>{COP(g.monto)}</span>
              </div>
            ))
          }
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:6,
            borderTop:`1px solid ${C.border}`,fontWeight:800,fontSize:13}}>
            <span style={{color:C.sub}}>Total</span>
            <span style={{color:C.red}}>{COP(totalGastosT)}</span>
          </div>
        </div>
      </div>

      {/* ── Resumen final ────────────────────────────────────────────────── */}
      <div style={{...card(), background: neto>=0?`${C.green}0d`:`${C.red}0d`,
        border:`1px solid ${neto>=0?C.green:C.red}40`}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem',
          color: neto>=0?C.green:C.red}}>💼 Resumen Financiero Estimado</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 2rem',maxWidth:520}}>
          {[
            { label:'Ventas brutas',                val:totalVentas,    sign:'+', color:C.green },
            { label:'Transferencias digitales',      val:totalBancos,    sign:'−', color:C.red   },
            { label:'Pagos de personal',             val:totalPersonal,  sign:'−', color:C.red   },
            { label:'Gastos del turno',              val:totalGastosT,   sign:'−', color:C.red   },
            ...(extrasN>0    ? [{ label:'Extras / descorches',   val:extrasN,     sign:'+', color:C.green }] : []),
            ...(pendientesN>0? [{ label:'Cuentas pendientes',    val:pendientesN, sign:'−', color:C.red   }] : []),
          ].map((r,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',
              borderBottom:`1px solid ${C.border}30`,fontSize:12}}>
              <span style={{color:C.sub}}>{r.sign} {r.label}</span>
              <span style={{fontWeight:700,color:r.color}}>{COP(r.val)}</span>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:12,paddingTop:10,
          borderTop:`2px solid ${neto>=0?C.green:C.red}`,fontWeight:800}}>
          <span style={{fontSize:15,color:neto>=0?C.green:C.red}}>
            {neto>=0 ? '✅ EFECTIVO EN CAJA' : '❌ FALTANTE ESTIMADO'}
          </span>
          <span style={{fontSize:22,color:neto>=0?C.green:C.red}}>{COP(neto)}</span>
        </div>
        <div style={{fontSize:10,color:C.sub,marginTop:6}}>
          * Valores estimados con los datos actuales del turno. El neto final puede variar al completar el arqueo.
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   GENERADOR HTML PARA IMPRESIÓN
════════════════════════════════════════════════════════════════════════════ */
function generarHTML({ negocio, fecha, horaActual, apertura, activosFirst,
  transfRows, personalRows, gastosActivos,
  totalVentas, totalBancos, totalGastosT, totalPersonal,
  extrasN, pendientesN, neto }) {

  const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0);
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const invRows = activosFirst.map((f,i) => `
    <tr class="${i%2===0?'ra':'rb'} ${f.activo?'':'dim'}">
      <td class="l">${esc(f.name)}${f.activo?'':'<span class="badge grey">sin mov.</span>'}</td>
      <td>${f.stock}</td>
      <td class="${f.entradas>0?'tg':''}">${f.entradas>0?'+'+f.entradas:f.entradas}</td>
      <td class="${f.salidas>0?'ta':''}">${f.salidas}</td>
      <td class="${f.finalEst<0?'tr':''}" style="font-weight:800">${f.finalEst}${f.finalEst<0?' ⚠':''}  </td>
      <td>${fmt(f.price)}</td>
      <td>${f.vendidas}</td>
      <td class="${f.venta>0?'tg':''}" style="font-weight:700">${f.venta>0?fmt(f.venta):'—'}${f.m.ventaManual!==undefined?'<span class="badge am">AJ</span>':''}</td>
    </tr>`).join('');

  const transfHTML = transfRows.length===0
    ? '<tr><td colspan="2" class="empty">Sin transferencias</td></tr>'
    : transfRows.map(([p,v])=>`<tr><td class="l">${esc(PLAT_LABELS[p]||p)}</td><td class="tb">${fmt(v)}</td></tr>`).join('');

  const persHTML = personalRows.length===0
    ? '<tr><td colspan="2" class="empty">Sin personal</td></tr>'
    : personalRows.map(p=>`<tr><td class="l">${esc(p.name)} <span class="badge">${esc(ROL_LABELS[p.rol]||p.rol)}</span>${p.nota?` <span class="note">${esc(p.nota)}</span>`:''}</td><td class="ta">${fmt(p.pago)}</td></tr>`).join('');

  const gastHTML = gastosActivos.length===0
    ? '<tr><td colspan="2" class="empty">Sin gastos</td></tr>'
    : gastosActivos.map(g=>`<tr><td class="l">${esc(g.desc)}</td><td class="tr">${fmt(g.monto)}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Perspectiva de Cierre — ${esc(negocio.name)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:0.8rem 1rem;font-size:10px;}
.header{background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#fff;padding:0.8rem 1.2rem;border-radius:8px;margin-bottom:0.7rem;display:flex;justify-content:space-between;align-items:center;}
.ht{font-size:16px;font-weight:800;}.hs{font-size:9px;opacity:.7;margin-top:2px;}
.badge-ok{background:#f59e0b;color:#1a1a2e;padding:2px 8px;border-radius:20px;font-size:8px;font-weight:800;}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:0.7rem;}
.kpi{border-radius:6px;padding:7px 10px;border-left:3px solid;text-align:center;}
.kpi-l{font-size:7.5px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;opacity:.65;margin-bottom:2px;}
.kpi-v{font-size:13px;font-weight:800;}
.g{background:#f0fdf4;border-color:#22c55e;}.g .kpi-v{color:#15803d;}
.b{background:#eff6ff;border-color:#3b82f6;}.b .kpi-v{color:#1d4ed8;}
.a{background:#fffbeb;border-color:#f59e0b;}.a .kpi-v{color:#d97706;}
.r{background:#fef2f2;border-color:#ef4444;}.r .kpi-v{color:#dc2626;}
.n{background:${neto>=0?'#f0fdf4':'#fef2f2'};border-color:${neto>=0?'#22c55e':'#ef4444'};}.n .kpi-v{color:${neto>=0?'#15803d':'#dc2626'};}
h2{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6366f1;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin:0 0 6px;}
.inv-table{width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:0.7rem;}
.inv-table th{background:#f8fafc;border:1px solid #e5e7eb;padding:3px 6px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:center;}
.inv-table th:first-child{text-align:left;}
.inv-table td{border:1px solid #e5e7eb;padding:2px 6px;text-align:right;}
.inv-table td.l{text-align:left;font-weight:500;}
.ra{background:#fff;}.rb{background:#f9fafb;}
.dim{opacity:.45;}
.tg{color:#15803d;font-weight:700;}.ta{color:#d97706;font-weight:700;}.tr{color:#dc2626;font-weight:700;}.tb{color:#1d4ed8;font-weight:700;}.tp{color:#7e22ce;}
.tot{background:#f1f5f9;font-weight:800;}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:0.7rem;}
.section{border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;}
.mini-table{width:100%;border-collapse:collapse;font-size:9px;}
.mini-table td{padding:2.5px 0;border-bottom:1px solid #f3f4f6;}
.mini-table td.l{color:#6b7280;}
.mini-table tr:last-child td{border-bottom:none;}
.total-row td{font-weight:800;border-top:1px solid #d1d5db;padding-top:4px;}
.badge{background:#e5e7eb;color:#374151;font-size:7px;padding:0 4px;border-radius:6px;margin-left:3px;}
.badge.grey{background:#e5e7eb;color:#6b7280;}.badge.am{background:#f59e0b;color:#1a1a2e;}
.note{color:#9ca3af;font-size:8px;}
.empty{color:#9ca3af;font-style:italic;}
.fin{background:${neto>=0?'#f0fdf4':'#fef2f2'};border:1px solid ${neto>=0?'#86efac':'#fca5a5'};border-radius:6px;padding:8px 12px;margin-bottom:0.7rem;}
.fin-rows{display:grid;grid-template-columns:1fr 1fr;gap:0 2rem;max-width:500px;}
.fin-row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #e5e7eb30;font-size:9px;}
.fin-total{display:flex;justify-content:space-between;padding:8px 0 2px;font-weight:800;font-size:14px;border-top:2px solid ${neto>=0?'#22c55e':'#ef4444'};margin-top:6px;color:${neto>=0?'#15803d':'#dc2626'};}
.footer{text-align:center;font-size:7.5px;color:#9ca3af;margin-top:0.7rem;border-top:1px solid #e5e7eb;padding-top:4px;}
@media print{@page{size:letter landscape;margin:0.5cm 0.7cm;}body{padding:0;}}
</style></head><body>

<div class="header">
  <div><div class="ht">${esc(negocio.emoji)} ${esc(negocio.name)} — Perspectiva de Cierre</div>
  <div class="hs">${esc(fecha)} · Apertura: ${esc(apertura)} · Generado: ${esc(horaActual)}</div></div>
  <div><span class="badge-ok">⏳ TURNO EN CURSO</span></div>
</div>

<div class="kpis">
  <div class="kpi g"><div class="kpi-l">💰 Ventas</div><div class="kpi-v">${fmt(totalVentas)}</div></div>
  <div class="kpi b"><div class="kpi-l">🏦 Transferencias</div><div class="kpi-v">${fmt(totalBancos)}</div></div>
  <div class="kpi a"><div class="kpi-l">👥 Personal</div><div class="kpi-v">${fmt(totalPersonal)}</div></div>
  <div class="kpi r"><div class="kpi-l">🧾 Gastos</div><div class="kpi-v">${fmt(totalGastosT)}</div></div>
  <div class="kpi n"><div class="kpi-l">📊 Neto Est.</div><div class="kpi-v">${fmt(neto)}</div></div>
</div>

<h2>📦 Inventario del Turno</h2>
<table class="inv-table">
  <thead><tr>
    <th style="text-align:left">Producto</th>
    <th>Inicio</th><th>Entradas</th><th>Salidas</th>
    <th>Final Est.</th><th>Precio</th><th>Vendidas</th><th>Venta $</th>
  </tr></thead>
  <tbody>
    ${invRows}
    <tr class="tot">
      <td class="l">TOTAL</td>
      <td></td>
      <td class="tg">${activosFirst.reduce((s,f)=>s+f.entradas,0)||'—'}</td>
      <td>${activosFirst.reduce((s,f)=>s+f.salidas,0)}</td>
      <td></td><td></td>
      <td>${activosFirst.reduce((s,f)=>s+f.vendidas,0)}</td>
      <td class="tg" style="font-size:11px">${fmt(totalVentas)}</td>
    </tr>
  </tbody>
</table>

<div class="grid3">
  <div class="section">
    <h2>🏦 Transferencias</h2>
    <table class="mini-table">
      ${transfHTML}
      <tr class="total-row"><td class="l">Total</td><td class="tb" style="text-align:right">${fmt(totalBancos)}</td></tr>
    </table>
  </div>
  <div class="section">
    <h2>👥 Personal</h2>
    <table class="mini-table">
      ${persHTML}
      <tr class="total-row"><td class="l">Total</td><td class="ta" style="text-align:right">${fmt(totalPersonal)}</td></tr>
    </table>
  </div>
  <div class="section">
    <h2>🧾 Gastos</h2>
    <table class="mini-table">
      ${gastHTML}
      <tr class="total-row"><td class="l">Total</td><td class="tr" style="text-align:right">${fmt(totalGastosT)}</td></tr>
    </table>
  </div>
</div>

<div class="fin">
  <h2>${neto>=0?'💼 Resumen Financiero Estimado':'⚠️ Resumen Financiero — Faltante detectado'}</h2>
  <div class="fin-rows">
    <div class="fin-row"><span>+ Ventas brutas</span><span style="color:#15803d;font-weight:700">${fmt(totalVentas)}</span></div>
    <div class="fin-row"><span>− Transferencias</span><span style="color:#dc2626;font-weight:700">${fmt(totalBancos)}</span></div>
    <div class="fin-row"><span>− Personal</span><span style="color:#dc2626;font-weight:700">${fmt(totalPersonal)}</span></div>
    <div class="fin-row"><span>− Gastos</span><span style="color:#dc2626;font-weight:700">${fmt(totalGastosT)}</span></div>
    ${extrasN>0?`<div class="fin-row"><span>+ Extras</span><span style="color:#15803d;font-weight:700">${fmt(extrasN)}</span></div>`:''}
    ${pendientesN>0?`<div class="fin-row"><span>− Pendientes</span><span style="color:#dc2626;font-weight:700">${fmt(pendientesN)}</span></div>`:''}
  </div>
  <div class="fin-total">
    <span>${neto>=0?'✅ EFECTIVO ESPERADO EN CAJA':'❌ FALTANTE ESTIMADO'}</span>
    <span>${fmt(neto)}</span>
  </div>
</div>

<div class="footer">
  GestiónBar · Perspectiva de Cierre · ${esc(negocio.name)} · ${esc(fecha)} · Valores estimados — no definitivos
</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;
}
