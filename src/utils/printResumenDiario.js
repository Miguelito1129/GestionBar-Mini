// Genera e imprime un Resumen Diario de turno como PDF en nueva ventana.
// Optimizado para caber en una sola hoja tamaño carta (8.5" × 11").

const esc = str => String(str||'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const fmt = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0);
const r1k = v => Math.round((v||0)/1000)*1000;

const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function printResumenDiario(p, negName) {
  const bancoDetalle    = p.bancoDetalle || {};
  const personalDetalle = p.personalDetalle || [];
  const gastosDetalle   = p.gastosDetalle || [];
  const movs = (p.movimientos||[]).filter(m=>(m.salidas||0)+(m.entradas||0)>0);

  const totalBancos      = p.bancos || 0;
  const totalPersonal    = personalDetalle.reduce((s,m)=>s+r1k(m.pago||0),0);
  const totalGastosTurno = gastosDetalle.reduce((s,g)=>s+(g.monto||0),0);
  const efectivo         = p.neto || 0;
  const margen           = p.ventas ? Math.round((efectivo/p.ventas)*100) : 0;

  const fecha = new Date((p.fecha||'')+'T12:00:00');
  const fechaLarga = isNaN(fecha)
    ? esc(p.fecha||'')
    : `${DIAS[fecha.getDay()]}, ${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;

  const bancosRows = Object.entries(bancoDetalle).filter(([,v])=>v>0);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Resumen ${esc(p.fecha)} — ${esc(negName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;background:#fff;padding:0.6rem 0.8rem;font-size:9.5px;max-width:720px;margin:0 auto;}
.header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 55%,#0f3460 100%);color:#fff;padding:0.55rem 1rem;border-radius:7px;margin-bottom:0.45rem;display:flex;justify-content:space-between;align-items:center;}
.header-title{font-size:15px;font-weight:800;letter-spacing:-.5px;}
.header-sub{font-size:8.5px;opacity:.7;margin-top:2px;}
.header-badge{display:inline-block;background:#f59e0b;color:#1a1a2e;padding:2px 8px;border-radius:20px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;}
.turno-bar{display:flex;gap:14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:5px;padding:4px 10px;margin-bottom:0.45rem;font-size:9px;color:#4b5563;}
.turno-bar strong{color:#111827;}
.kpi-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:0.45rem;}
.kpi{border-radius:6px;padding:6px 8px;border-left:3px solid;}
.kpi-lbl{font-size:7px;text-transform:uppercase;letter-spacing:.07em;font-weight:700;opacity:.65;margin-bottom:2px;}
.kpi-val{font-size:13px;font-weight:800;}
.g{background:#f0fdf4;border-color:#22c55e;}.g .kpi-val{color:#15803d;}
.bl{background:#eff6ff;border-color:#3b82f6;}.bl .kpi-val{color:#1d4ed8;}
.am{background:#fffbeb;border-color:#f59e0b;}.am .kpi-val{color:#d97706;}
.rd{background:#fef2f2;border-color:#ef4444;}.rd .kpi-val{color:#dc2626;}
.pu{background:#faf5ff;border-color:#a855f7;}.pu .kpi-val{color:#7e22ce;}
.gr{background:#f9fafb;border-color:#6b7280;}.gr .kpi-val{color:#374151;}
h2{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#6366f1;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin:0 0 5px;}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:0.45rem;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:0.45rem;}
.section{border:1px solid #e5e7eb;border-radius:6px;padding:6px 9px;}
.row{display:flex;justify-content:space-between;padding:1.5px 0;font-size:9px;border-bottom:1px solid #f3f4f6;}
.row:last-child{border-bottom:none;}
.lbl{color:#6b7280;}.val{font-weight:600;}
.vg{color:#16a34a;font-weight:700;}.vr{color:#dc2626;font-weight:700;}.vb{color:#1d4ed8;font-weight:700;}
.subtot{display:flex;justify-content:space-between;padding:3px 0 1px;font-weight:800;font-size:9.5px;border-top:1px solid #d1d5db;margin-top:3px;}
.fin{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:6px 9px;margin-bottom:0.45rem;}
.fin h2{color:#16a34a;border-color:#86efac;}
.fin .row{border-color:#dcfce7;}
.fin-total{display:flex;justify-content:space-between;padding:5px 0 1px;font-weight:800;font-size:12px;border-top:2px solid #86efac;margin-top:4px;}
table{width:100%;border-collapse:collapse;font-size:8px;margin-bottom:0.45rem;}
th{background:#f8fafc;border:1px solid #e5e7eb;padding:2px 5px;font-size:7.5px;font-weight:700;text-transform:uppercase;color:#6b7280;text-align:left;}
th:not(:first-child){text-align:center;}
td{border:1px solid #e5e7eb;padding:1.5px 5px;text-align:center;}
td:first-child{text-align:left;font-weight:500;}
.nov{background:#fffbeb;border:1px solid #fef08a;border-radius:5px;padding:5px 9px;font-size:9px;color:#92400e;margin-bottom:0.45rem;line-height:1.4;}
.empty{color:#9ca3af;font-size:9px;font-style:italic;padding:2px 0;}
.footer{text-align:center;font-size:7.5px;color:#9ca3af;margin-top:0.5rem;border-top:1px solid #e5e7eb;padding-top:4px;}
@media print{
  @page{size:letter portrait;margin:0.5cm 0.7cm;}
  body{padding:0;font-size:9px;max-width:100%;}
  .header{padding:0.45rem 0.8rem;}
  .kpi-val{font-size:12px;}
  .fin-total{font-size:11px;}
}
</style></head><body>

<div class="header">
  <div>
    <div class="header-title">${esc(negName)}</div>
    <div class="header-sub">${esc(fechaLarga)}</div>
  </div>
  <div><div class="header-badge">📊 Resumen de Turno</div></div>
</div>

<div class="turno-bar">
  <span>🕐 Apertura: <strong>${esc(p.apertura||'—')}</strong></span>
  <span>🔒 Cierre: <strong>${esc(p.cierre||'—')}</strong></span>
  <span>📅 Fecha: <strong>${esc(p.fecha||'—')}</strong></span>
  <span>📊 Margen: <strong style="color:${margen>40?'#16a34a':margen>20?'#d97706':'#dc2626'}">${margen}%</strong></span>
</div>

<div class="kpi-grid">
  <div class="kpi g"><div class="kpi-lbl">💰 Ventas</div><div class="kpi-val">${fmt(p.ventas)}</div></div>
  <div class="kpi bl"><div class="kpi-lbl">🏦 Bancos</div><div class="kpi-val">${fmt(totalBancos)}</div></div>
  <div class="kpi am"><div class="kpi-lbl">💵 Efectivo</div><div class="kpi-val">${fmt(efectivo)}</div></div>
  <div class="kpi rd"><div class="kpi-lbl">👥 Personal</div><div class="kpi-val">${fmt(totalPersonal)}</div></div>
  <div class="kpi rd"><div class="kpi-lbl">🧾 Gastos</div><div class="kpi-val">${fmt(totalGastosTurno||(p.gastos||0))}</div></div>
  ${p.extras>0
    ? `<div class="kpi pu"><div class="kpi-lbl">🥂 Extras</div><div class="kpi-val">${fmt(p.extras)}</div></div>`
    : `<div class="kpi gr"><div class="kpi-lbl">📋 Margen</div><div class="kpi-val">${margen}%</div></div>`}
</div>

<div class="${gastosDetalle.length>0?'grid3':'grid2'}">
  <div class="section">
    <h2>💳 Detalle Bancos</h2>
    ${bancosRows.length>0
      ? bancosRows.map(([k,v])=>`<div class="row"><span class="lbl" style="text-transform:capitalize">${esc(k)}</span><span class="val vb">${fmt(Number(v))}</span></div>`).join('')
      : '<div class="empty">Sin pagos digitales</div>'
    }
    <div class="subtot"><span>Total</span><span style="color:#1d4ed8">${fmt(totalBancos)}</span></div>
  </div>
  <div class="section">
    <h2>👥 Personal Pagado</h2>
    ${personalDetalle.length>0
      ? personalDetalle.map(m=>`<div class="row"><span class="lbl">${esc(m.name)} <span style="font-size:7px;background:#ede9fe;color:#6d28d9;padding:0 4px;border-radius:8px">${esc(m.rol)}</span></span><span class="val vr">−${fmt(r1k(m.pago||0))}</span></div>`).join('')
      : '<div class="empty">Sin personal registrado</div>'
    }
    <div class="subtot"><span>Total</span><span style="color:#dc2626">−${fmt(totalPersonal)}</span></div>
  </div>
  ${gastosDetalle.length>0?`
  <div class="section">
    <h2>🧾 Gastos del Turno</h2>
    ${gastosDetalle.map(g=>`<div class="row"><span class="lbl">${esc(g.desc||g.descripcion||'')}</span><span class="val vr">−${fmt(g.monto||0)}</span></div>`).join('')}
    <div class="subtot"><span>Total</span><span style="color:#dc2626">−${fmt(totalGastosTurno)}</span></div>
  </div>`:''}
</div>

${movs.length>0?`
<div style="margin-bottom:0.45rem">
  <h2>📦 Movimiento de Inventario</h2>
  <table>
    <thead><tr><th>Producto</th><th>Inicio</th><th>Entradas</th><th>Salidas</th><th>Final</th><th>Venta</th></tr></thead>
    <tbody>
      ${movs.map(m=>{
        const fin = m.final!==undefined ? m.final : (m.inicio||0)+(m.entradas||0)-(m.salidas||0)-(m.cortesia||0);
        return `<tr>
          <td>${esc(m.name)}${m.ventaManual!==undefined?'<span style="background:#d97706;color:#fff;font-size:6px;padding:0 3px;border-radius:2px;margin-left:3px">AJ</span>':''}</td>
          <td>${m.inicio||0}</td>
          <td style="color:#16a34a;font-weight:${(m.entradas||0)>0?700:400}">${m.entradas||0}</td>
          <td style="color:#d97706;font-weight:700">${m.salidas||0}</td>
          <td style="font-weight:800;color:${fin<0?'#dc2626':'#111827'}">${fin}</td>
          <td style="font-weight:700;color:#16a34a">${(m.total||0)>0?fmt(m.total):'—'}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>`:''}

<div class="fin">
  <h2>💼 Resumen Financiero</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px;">
    <div>
      <div class="row"><span class="lbl">Ventas Brutas</span><span class="vg">${fmt(p.ventas)}</span></div>
      <div class="row"><span class="lbl">− Bancos (digital)</span><span class="vr">−${fmt(totalBancos)}</span></div>
      <div class="row"><span class="lbl">− Personal</span><span class="vr">−${fmt(totalPersonal)}</span></div>
    </div>
    <div>
      <div class="row"><span class="lbl">− Gastos Turno</span><span class="vr">−${fmt(totalGastosTurno||(p.gastos||0))}</span></div>
      ${(p.extras||0)>0?`<div class="row"><span class="lbl">+ Extras/Descorches</span><span class="vg">+${fmt(p.extras)}</span></div>`:''}
      ${(p.pendientes||0)>0?`<div class="row"><span class="lbl">− Pendientes</span><span class="vr">−${fmt(p.pendientes)}</span></div>`:''}
    </div>
  </div>
  <div class="fin-total">
    <span>EFECTIVO EN CAJA</span>
    <span style="color:${efectivo>=0?'#d97706':'#dc2626'}">${fmt(efectivo)}</span>
  </div>
</div>

${p.novedades?`<div class="nov">📝 <strong>Novedades:</strong> ${esc(p.novedades)}</div>`:''}

<div class="footer">
  Generado: ${new Date().toLocaleString('es-CO')} &nbsp;·&nbsp; ${esc(negName)} &nbsp;·&nbsp; Turno ${esc(p.apertura||'')}–${esc(p.cierre||'')}
</div>
<script>window.onload=()=>window.print();<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=750');
  w.document.write(html);
  w.document.close();
}
