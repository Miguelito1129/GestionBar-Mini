import { C, s, COP } from "../../constants/theme.js";
import { Metric, Badge, PaginationTabs, SectionTitle, useListPagination } from "../common/index.jsx";

export default function Dashboard({ negocio }) {
  const products = Array.isArray(negocio.productos) ? negocio.productos : [];
  const fixedExpenses = Array.isArray(negocio.gastosFijos) ? negocio.gastosFijos : [];
  const receivables = Array.isArray(negocio.cxc) ? negocio.cxc : [];
  const shifts = Array.isArray(negocio.planillas) ? negocio.planillas : [];
  const low      = products.filter(p => p.stock <= p.min && p.min > 0);
  const today    = new Date().getDate();
  const upcoming = fixedExpenses.filter(g => g.dia > 0 && (g.dia - today) <= 7 && (g.dia - today) >= 0);
  const totalCxC = receivables.reduce((s,c) => s+c.monto, 0);
  const upcomingPage = useListPagination(upcoming);
  const receivablesPage = useListPagination(receivables);

  const lastFour = [...shifts]
    .sort((a,b) => b.fecha.localeCompare(a.fecha))
    .slice(0,4);

  const totalVentas = lastFour.reduce((s,p) => s+p.ventas, 0);
  const totalNeto   = lastFour.reduce((s,p) => s+p.neto,   0);

  return (
    <div>
      <SectionTitle>Dashboard — {negocio.name}</SectionTitle>

      {/* KPIs últimos 4 turnos */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:'1.5rem'}}>
        <Metric label="Ventas (últimos 4)" value={COP(totalVentas)} color={C.green} icon="💰"/>
        <Metric label="Neto (últimos 4)"   value={COP(totalNeto)}   color={C.amber} icon="📊"/>
        <Metric label="Bajo Stock"   value={low.filter(p=>p.stock>0).length}        color={C.amber} icon="⚠"/>
        <Metric label="Agotados"     value={products.filter(p=>p.stock===0&&p.min>0).length} color={C.red} icon="🚨"/>
        <Metric label="CxC Pendiente" value={COP(totalCxC)} color={totalCxC>0?C.red:C.green} icon="💳"/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.25rem'}}>
        {/* Productos bajo stock */}
        <div style={s.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>⚠ Productos Bajo Stock</div>
          {low.length===0
            ? <div style={{color:C.green,fontSize:12}}>✓ Todo el inventario en orden.</div>
            : low.map(p=>(
              <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${C.border}40`,fontSize:12}}>
                <span>{p.name}</span>
                <Badge color={p.stock===0?C.red:C.amber} small>{p.stock===0?'Agotado':`${p.stock}/${p.min}`}</Badge>
              </div>
            ))
          }
        </div>

        {/* Gastos fijos próximos */}
        <div style={s.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>📅 Gastos Fijos Próximos (7 días)</div>
          {upcoming.length===0
            ? <div style={{color:C.sub,fontSize:12}}>Sin vencimientos en los próximos 7 días.</div>
            : upcomingPage.pageItems.map(g=>(
              <div key={g.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${C.border}40`,fontSize:12}}>
                <span>{g.desc}</span>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <Badge color={C.amber} small>día {g.dia}</Badge>
                  <span style={{color:C.red,fontWeight:600}}>{COP(g.monto)}</span>
                </div>
              </div>
            ))
          }
          <PaginationTabs totalItems={upcoming.length} page={upcomingPage.page} onPageChange={upcomingPage.setPage} />
        </div>

        {/* Cuentas por cobrar */}
        {receivables.length > 0 && (
          <div style={s.card}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>💳 Cuentas por Cobrar</div>
            {receivablesPage.pageItems.map(c=>(
              <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${C.border}40`,fontSize:12}}>
                <div>
                  <div style={{fontWeight:600}}>{c.deudor}</div>
                  <div style={{color:C.sub,fontSize:11}}>{c.concepto} · {c.fecha}</div>
                </div>
                <span style={{color:C.red,fontWeight:700}}>{COP(c.monto)}</span>
              </div>
            ))}
            <PaginationTabs totalItems={receivables.length} page={receivablesPage.page} onPageChange={receivablesPage.setPage} />
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,fontWeight:800,fontSize:13}}>
              <span>Total CxC</span>
              <span style={{color:C.red}}>{COP(totalCxC)}</span>
            </div>
          </div>
        )}

        {/* Historial rápido */}
        <div style={s.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>📋 Últimos Turnos</div>
          {lastFour.length===0
            ? <div style={{color:C.sub,fontSize:12}}>Sin planillas registradas.</div>
            : lastFour.map((p,i)=>(
              <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:`1px solid ${C.border}40`,fontSize:12}}>
                <span style={{color:C.sub}}>{p.fecha}</span>
                <div style={{display:'flex',gap:12}}>
                  <span style={{color:C.green,fontWeight:600}}>{COP(p.ventas)}</span>
                  <span style={{color:C.amber,fontWeight:700}}>{COP(p.neto)}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
