// Genera e imprime una planilla de turno como PDF en nueva ventana.
// Se aplica escapeHtml para prevenir XSS en campos de usuario (novedades, nombres).

const esc = str => String(str||'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const fmt  = n => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n||0);
const r1k  = v => Math.round((v||0) / 1000) * 1000; // redondear al millar más cercano

export function printPlanilla(p, negName) {
  const movs    = p.movimientos || [];
  const hasMovs = movs.some(m => m.salidas>0 || m.entradas>0 || m.cortesia>0 || m.final!==undefined);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Planilla ${esc(p.fecha)} — ${esc(negName)}</title>
<style>
*{box-sizing:border-box;}
body{font-family:'Segoe UI',sans-serif;color:#1a1a2e;padding:1.5rem;font-size:11px;max-width:900px;margin:0 auto;}
h1{font-size:16px;font-weight:800;margin:0 0 2px;}
h2{font-size:11px;font-weight:800;margin:1rem 0 4px;text-transform:uppercase;letter-spacing:.06em;color:#4338ca;border-bottom:1px solid #e2e8f0;padding-bottom:3px;}
.meta{color:#475569;font-size:10px;margin-bottom:1rem;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:1rem;}
.box{border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;}
.row{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #f8fafc;font-size:11px;}
.lbl{color:#64748b;}.val{font-weight:600;}
.g{color:#059669;font-weight:700;}.r{color:#dc2626;font-weight:700;}.a{color:#d97706;font-weight:800;}.b{color:#4338ca;font-weight:600;}
.tot{display:flex;justify-content:space-between;padding:6px 0 2px;font-weight:800;font-size:13px;border-top:2px solid #e2e8f0;margin-top:4px;}
table{width:100%;border-collapse:collapse;margin-bottom:1rem;font-size:10px;}
th{background:#f8fafc;border:1px solid #e2e8f0;padding:4px 6px;text-align:right;font-weight:700;font-size:9px;text-transform:uppercase;color:#64748b;}
th:first-child{text-align:left;}
td{border:1px solid #e2e8f0;padding:3px 6px;text-align:right;}
td:first-child{text-align:left;font-weight:500;}
tr.yellow{background:#fefce8;}tr.subtot{background:#f1f5f9;font-weight:800;}
tr.modified{background:#fff7ed;}
.badge-mod{background:#d97706;color:white;border-radius:3px;padding:1px 5px;font-size:8px;font-weight:800;margin-left:5px;vertical-align:middle;letter-spacing:.03em;}
.auto-ref{color:#94a3b8;font-size:9px;text-decoration:line-through;display:block;}
.resumen{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.res-box{border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;}
.lock{text-align:center;font-size:9px;color:#6366f1;margin-top:1.5rem;border-top:1px solid #e2e8f0;padding-top:8px;}
@media print{@page{size:A4 landscape;margin:1.2cm}body{padding:0;}}
</style></head><body>
<h1>Planilla de Turno — ${esc(negName)}</h1>
<div class="meta">Fecha: <strong>${esc(p.fecha)}</strong> · Turno: ${esc(p.apertura||'')}–${esc(p.cierre||'')} · <span style="background:#d1fae5;color:#065f46;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:700;">Cerrada ✓</span></div>

${hasMovs?`
<h2>Movimiento de Inventario</h2>
<table>
  <thead><tr><th>Productos</th><th>Inicio</th><th>Entradas</th><th>Existencias</th><th>Salidas</th><th>V/Unitario</th><th>DESCU</th><th>V/Total</th></tr></thead>
  <tbody>
    ${movs.map(m=>{
      const vendidas    = Math.max(0,(m.salidas||0)-(m.cortesia||0));
      const vAuto       = vendidas*(m.precio||0);
      const esAjuste    = m.ventaManual!==undefined;
      const vTotal      = esAjuste ? m.ventaManual : (m.total!==undefined ? m.total : vAuto);
      const diferencia  = esAjuste ? (vTotal - vAuto) : 0;
      const existencias = m.final !== undefined ? m.final : (m.inicio||0)+(m.entradas||0)-(m.salidas||0)-(m.cortesia||0);
      const esNeg       = existencias<0;
      const rowClass    = esNeg?'yellow':esAjuste?'modified':'';
      return `<tr${rowClass?` class="${rowClass}"`:''}>
        <td>${esc(m.name)}${esAjuste?'<span class="badge-mod">✏ AJUSTE MANUAL</span>':''}</td>
        <td>${m.inicio||0}</td>
        <td>${m.entradas||0}</td>
        <td${esNeg?' style="background:#fef2f2;color:#dc2626;font-weight:800;"':''}>${existencias}</td>
        <td>${m.salidas||0}</td>
        <td>${m.precio?new Intl.NumberFormat('es-CO').format(m.precio):'-'}</td>
        <td>${esAjuste?`<span class="${diferencia>=0?'g':'r'}">${diferencia>=0?'+':''}${new Intl.NumberFormat('es-CO').format(diferencia)}</span><span class="auto-ref">auto: ${fmt(vAuto)}</span>`:'-'}</td>
        <td class="${esAjuste?'a':'g'}">${vTotal>0?fmt(vTotal):'-'}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>
${movs.some(m=>m.ventaManual!==undefined)?`<div style="margin:-4px 0 12px;padding:8px 12px;background:#fff7ed;border:1px solid #f59e0b40;border-radius:6px;font-size:10px;"><strong style="color:#d97706;">⚠ Aviso de auditoría:</strong> Este reporte contiene <strong>${movs.filter(m=>m.ventaManual!==undefined).length}</strong> producto(s) con valor de venta <strong>modificado manualmente</strong>. Los valores automáticos (precio × cantidad) se muestran tachados en la columna DESCU para referencia y verificación.</div>`:''}
`:''}

<div class="resumen">
  <div>
    <h2>Gastos Noche</h2>
    <table>
      <thead><tr><th>Concepto</th><th>Valor</th></tr></thead>
      <tbody>
        ${(p.personalDetalle||[]).map(m=>`<tr><td>${esc(m.name)}${m.rol==='barra'?' (Barra)':m.rol==='dj'?' (DJ)':m.rol==='mesero'?' (Mesero)':` (${esc(m.rol)})`}</td><td class="r">${fmt(r1k(m.pago))}</td></tr>`).join('')}
        ${(p.gastosDetalle||[]).filter(g=>g.monto>0).map(g=>`<tr><td>${esc(g.desc||g.descripcion)}</td><td class="r">${fmt(g.monto)}</td></tr>`).join('')}
        ${!(p.personalDetalle||[]).length&&!(p.gastosDetalle||[]).length?`<tr><td colspan="2" style="color:#64748b;text-align:center;">Sin detalle registrado</td></tr>`:''}
        <tr class="subtot"><td>TOTAL</td><td class="r">${fmt((p.gastos||0)+(p.personalDetalle||[]).reduce((s,m)=>s+r1k(m.pago),0))}</td></tr>
      </tbody>
    </table>
    ${p.novedades?`<div class="box"><strong>Novedades:</strong> ${esc(p.novedades)}</div>`:''}
  </div>
  <div>
    <h2>Bancos</h2>
    ${p.bancoDetalle
      ? `<table><thead><tr><th>Plataforma</th><th>Valor</th></tr></thead><tbody>
          ${Object.entries(p.bancoDetalle).filter(([,v])=>v>0).map(([k,v])=>`<tr><td style="text-transform:capitalize;">${esc(k)}</td><td class="b">${fmt(v)}</td></tr>`).join('')}
          <tr class="subtot"><td>Total</td><td class="b">${fmt(p.bancos||0)}</td></tr>
        </tbody></table>`
      : `<div class="row"><span class="lbl">Total bancos</span><span class="b">${fmt(p.bancos||0)}</span></div>`
    }
    <h2>Resumen Financiero</h2>
    <table><tbody>
      <tr><td>Total Venta</td><td class="g">${fmt(p.ventas)}</td></tr>
      <tr><td>Gastos</td><td class="r">- ${fmt(p.gastos||0)}</td></tr>
      <tr><td>Bancos</td><td class="r">- ${fmt(p.bancos||0)}</td></tr>
      ${p.extras>0?`<tr><td>Descorches/Extras</td><td class="g">+ ${fmt(p.extras)}</td></tr>`:''}
      <tr class="subtot"><td>Total+Descorches</td><td class="a">${fmt(p.neto)}</td></tr>
    </tbody></table>
  </div>
</div>
<div class="lock">🔒 Planilla bloqueada · ${esc(negName)} · ${esc(p.fecha)}</div>
<script>window.onload=()=>window.print();<\/script></body></html>`;

  const w = window.open('', '_blank', 'width=1050,height=800');
  w.document.write(html);
  w.document.close();
}
