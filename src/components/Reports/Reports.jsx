import { useState } from "react";
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, CartesianGrid, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { C, s, COP } from "../../constants/theme.js";
import { canSeeNeg } from "../../constants/roles.js";
import { useAuth } from "../../hooks/useAuth.jsx";
import { printPlanilla } from "../../utils/printPlanilla.js";
import { printResumenDiario } from "../../utils/printResumenDiario.js";
import { Badge, Metric, PaginationTabs, useListPagination } from "../common/index.jsx";

const tt = {
  contentStyle:{background:'#1a1a2e',border:'1px solid #2a2a4a',borderRadius:8,fontSize:11},
  labelStyle:{color:'#e2e8f0'},
  itemStyle:{color:'#e2e8f0'},
};

// Colores para top egresos
const EGR_COLORS = ['#f87171','#fb923c','#fbbf24','#a78bfa','#60a5fa','#34d399','#f472b6','#94a3b8'];

export default function Reports({ negocios }) {
  const { user } = useAuth();
  const visible = negocios.filter(n => canSeeNeg(user, n.id));
  const [selNeg, setSelNeg]             = useState(visible[0]?.id || '');
  const [periodo, setPeriodo]           = useState('all');
  const [viewPlanilla, setViewPlanilla] = useState(null);
  const [showResumenPicker, setShowResumenPicker] = useState(false);
  const [resumenFecha, setResumenFecha] = useState('');
  const neg = visible.find(n => n.id === selNeg) || visible[0];

  const allPlanillas = (neg?.planillas || []).filter(p => p.fecha);
  const allSorted    = [...allPlanillas].sort((a,b) => a.fecha.localeCompare(b.fecha));
  const lastPlanilla = allSorted[allSorted.length - 1] || null;

  // ── Filtro período ────────────────────────────────────────────────────────────
  const cutoff = periodo === 'all' ? null : (() => {
    const d = new Date(); d.setDate(d.getDate() - parseInt(periodo));
    return d.toISOString().slice(0, 10);
  })();
  const planillas = cutoff ? allPlanillas.filter(p => p.fecha >= cutoff) : allPlanillas;
  const reportPage = useListPagination([...planillas].sort((a,b)=>b.fecha.localeCompare(a.fecha)));
  if (!neg) return <div style={{color:C.sub,padding:'2rem',textAlign:'center'}}>Sin negocios asignados.</div>;
  const sorted    = [...planillas].sort((a,b) => a.fecha.localeCompare(b.fecha));

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const totalVentas  = planillas.reduce((s,p) => s + (p.ventas  || 0), 0);
  const totalEgresos = planillas.reduce((s,p) => s + (p.gastos  || 0) + (p.personal || 0), 0);
  const totalNeto    = planillas.reduce((s,p) => s + (p.neto    || 0), 0);
  const margen       = totalVentas ? Math.round((totalNeto / totalVentas) * 100) : 0;
  const mejorSemana  = sorted.reduce((mx,p) => p.neto > mx ? p.neto : mx, 0);
  const avgNeto      = sorted.length ? Math.round(totalNeto / sorted.length) : 0;

  // ── Chart 1: Composición semanal (ventas | egresos | utilidad) ────────────────
  const composData = sorted.map(p => ({
    fecha:    p.fecha.slice(5),
    ventas:   p.ventas  || 0,
    egresos:  (p.gastos || 0) + (p.personal || 0),
    utilidad: p.neto    || 0,
    margen:   p.ventas  ? Math.round((p.neto / p.ventas) * 100) : 0,
  }));

  // ── Chart 2: Evolución acumulada de utilidad ──────────────────────────────────
  let acum = 0;
  const utilAcumData = sorted.map(p => {
    acum += (p.neto || 0);
    return { fecha: p.fecha.slice(5), utilidad: p.neto || 0, acumulado: acum };
  });

  // ── Chart 3: Top egresos acumulados (gastosDetalle) ───────────────────────────
  const gastosMap = {};
  planillas.forEach(p => {
    (p.gastosDetalle || []).forEach(g => {
      const k = (g.desc || g.descripcion || '').trim();
      if (k) gastosMap[k] = (gastosMap[k] || 0) + (g.monto || 0);
    });
  });
  const topEgresos = Object.entries(gastosMap)
    .sort((a,b) => b[1] - a[1]).slice(0, 10)
    .map(([name, value]) => ({ name: name.length > 28 ? name.slice(0,28)+'…' : name, value }));

  // ── Chart 4: Efectivo vs Transferencias ──────────────────────────────────────
  const efectivoVsTransData = sorted.map(p => ({
    fecha:         p.fecha.slice(5),
    efectivo:      p.bancoDetalle?.Efectivo || p.bancoDetalle?.efectivo || 0,
    transferencias: p.bancos || 0,
  }));
  const totalEfectivo = efectivoVsTransData.reduce((s,d) => s + d.efectivo, 0);
  const totalTrans    = efectivoVsTransData.reduce((s,d) => s + d.transferencias, 0);
  const totalIngCol   = totalEfectivo + totalTrans;
  const pctEfect = totalIngCol ? Math.round((totalEfectivo / totalIngCol) * 100) : 0;
  const pctTrans = totalIngCol ? Math.round((totalTrans    / totalIngCol) * 100) : 0;

  const noData = sorted.length === 0;

  return (
    <div>
      {/* ── Encabezado ─────────────────────────────────────────────────────────── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.25rem',flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:18,fontWeight:800}}>📊 Análisis de Utilidad — {neg.name}</div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <select style={{...s.sel,width:160}} value={selNeg} onChange={e=>setSelNeg(e.target.value)}>
            {visible.map(n=><option key={n.id} value={n.id}>{n.emoji} {n.name}</option>)}
          </select>
          <select style={{...s.sel,width:145}} value={periodo} onChange={e=>setPeriodo(e.target.value)}>
            <option value="30">Últimos 30 días</option>
            <option value="60">Últimos 60 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="all">Todo el historial</option>
          </select>
          {allPlanillas.length>0&&(
            <button style={{...s.btn('primary'),fontSize:11,padding:'7px 14px'}}
              onClick={()=>{setResumenFecha(lastPlanilla?.fecha||'');setShowResumenPicker(true);}}>
              📋 Resumen Diario
            </button>
          )}
          <button style={{...s.btn(),color:C.amber,border:`1px solid ${C.amber}30`,fontSize:11}} onClick={()=>window.print()}>
            🖨 Exportar
          </button>
        </div>
      </div>

      {/* ── KPIs Utilidad ──────────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginBottom:'1.25rem'}}>
        <Metric label="Ventas Totales"     value={COP(totalVentas)}  color={C.green}  icon="💰"/>
        <Metric label="Total Egresos"      value={COP(totalEgresos)} color={C.red}    icon="📉"/>
        <Metric label="Utilidad Neta"      value={COP(totalNeto)}    color={totalNeto>=0?C.amber:C.red} icon="📊"/>
        <Metric label="Margen Utilidad"    value={`${margen}%`}      color={margen>40?C.green:margen>20?C.amber:C.red} icon="💹"/>
        <Metric label="Mejor Semana"       value={COP(mejorSemana)}  color={C.green}  icon="🏆"/>
        <Metric label="Promedio Semanal"   value={COP(avgNeto)}      color={C.indigo} icon="📈"/>
      </div>

      {/* ── Barra resumen visual: Egresos vs Utilidad ─────────────────────────── */}
      {totalVentas > 0 && (
        <div style={{...s.card, marginBottom:'1rem', padding:'1rem 1.25rem'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
            <div style={{fontWeight:700,fontSize:13}}>Distribución del ingreso total</div>
            <div style={{display:'flex',gap:16,fontSize:12}}>
              <span style={{color:C.red}}>■ Egresos {Math.round((totalEgresos/totalVentas)*100)}%</span>
              <span style={{color:C.amber}}>■ Utilidad {margen}%</span>
            </div>
          </div>
          <div style={{display:'flex',height:22,borderRadius:8,overflow:'hidden',gap:2}}>
            <div style={{width:`${Math.round((totalEgresos/totalVentas)*100)}%`,background:'linear-gradient(90deg,#f87171,#fb923c)',transition:'width .5s',display:'flex',alignItems:'center',justifyContent:'center'}}>
              {Math.round((totalEgresos/totalVentas)*100)>15&&<span style={{fontSize:10,fontWeight:700,color:'#fff'}}>{COP(totalEgresos)}</span>}
            </div>
            <div style={{flex:1,background:'linear-gradient(90deg,#34d399,#059669)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontSize:10,fontWeight:700,color:'#fff'}}>{COP(totalNeto)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Chart 1: Ventas / Egresos / Utilidad por semana (HERO) ───────────── */}
      <div style={{...s.card, marginBottom:'1rem'}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>
          Ventas vs Egresos vs Utilidad — por semana
        </div>
        {noData
          ? <div style={{color:C.sub,fontSize:13,padding:'2rem',textAlign:'center'}}>Sin datos en el período seleccionado</div>
          : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={composData} margin={{top:10,right:20,left:5,bottom:5}} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="fecha" tick={{fontSize:9,fill:C.sub}}/>
                <YAxis yAxisId="izq" tick={{fontSize:9,fill:C.sub}} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
                <YAxis yAxisId="der" orientation="right" tick={{fontSize:9,fill:C.sub}} tickFormatter={v=>`${v}%`} domain={[-10,80]}/>
                <Tooltip
                  {...tt}
                  formatter={(v,name)=>{
                    if(name==='Margen %') return [`${v}%`, 'Margen %'];
                    return [COP(v), name];
                  }}
                  labelFormatter={l=>`Semana ${l}`}
                />
                <Legend wrapperStyle={{fontSize:11,color:C.sub}}/>
                <ReferenceLine yAxisId="izq" y={0} stroke={C.border} strokeDasharray="3 3"/>
                <Bar yAxisId="izq" dataKey="ventas"   fill="#34d39930" stroke="#34d399" strokeWidth={1.5} name="Ventas"   radius={[3,3,0,0]}/>
                <Bar yAxisId="izq" dataKey="egresos"  fill="#f8717160" stroke="#f87171" strokeWidth={1.5} name="Egresos"  radius={[3,3,0,0]}/>
                <Bar yAxisId="izq" dataKey="utilidad" fill="#f59e0b"   stroke="#f59e0b" strokeWidth={0}   name="Utilidad" radius={[3,3,0,0]}>
                  {composData.map((d,i)=>(
                    <Cell key={i} fill={d.utilidad >= 0 ? '#f59e0b' : '#f87171'}/>
                  ))}
                </Bar>
                <Line yAxisId="der" type="monotone" dataKey="margen" stroke="#818cf8" strokeWidth={2}
                  dot={{r:3,fill:'#818cf8'}} activeDot={{r:5}} name="Margen %" strokeDasharray="5 3"/>
              </ComposedChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* ── Chart 2 + 3: Evolución utilidad | Top Egresos ─────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>

        {/* Evolución acumulada de utilidad */}
        <div style={s.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>Evolución de la Utilidad Semanal</div>
          {noData
            ? <div style={{color:C.sub,fontSize:13,padding:'2rem',textAlign:'center'}}>Sin datos</div>
            : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={utilAcumData} margin={{top:5,right:10,left:5,bottom:5}}>
                  <defs>
                    <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#34d399" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis dataKey="fecha" tick={{fontSize:9,fill:C.sub}}/>
                  <YAxis tick={{fontSize:9,fill:C.sub}} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
                  <Tooltip {...tt} formatter={v=>COP(v)} labelFormatter={l=>`Semana ${l}`}/>
                  <Legend wrapperStyle={{fontSize:10,color:C.sub}}/>
                  <ReferenceLine y={0} stroke={C.red} strokeDasharray="3 3"/>
                  <Area type="monotone" dataKey="utilidad"   stroke="#f59e0b" fill="url(#gU)" strokeWidth={2}   name="Utilidad semana"/>
                  <Area type="monotone" dataKey="acumulado"  stroke="#34d399" fill="url(#gA)" strokeWidth={1.5} name="Acumulado" strokeDasharray="5 3"/>
                </AreaChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* Top egresos acumulados */}
        <div style={s.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem'}}>Top Egresos Acumulados</div>
          {topEgresos.length === 0
            ? <div style={{color:C.sub,fontSize:13,padding:'2rem',textAlign:'center'}}>Sin detalle de gastos registrado</div>
            : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topEgresos} layout="vertical" margin={{left:5,right:30,top:5,bottom:5}}>
                  <XAxis type="number" tick={{fontSize:9,fill:C.sub}} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:9,fill:C.text}} width={120}/>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <Tooltip {...tt} formatter={v=>COP(v)} labelFormatter={l=>l}/>
                  <Bar dataKey="value" name="Total egresado" radius={[0,4,4,0]}>
                    {topEgresos.map((_,i)=><Cell key={i} fill={EGR_COLORS[i % EGR_COLORS.length]}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* ── Chart 4: Efectivo vs Transferencias ───────────────────────────────── */}
      <div style={{...s.card,marginBottom:'1rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.75rem',flexWrap:'wrap',gap:8}}>
          <div style={{fontWeight:700,fontSize:13}}>💵 Efectivo vs 💳 Transferencias — por semana</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <div style={{textAlign:'center',padding:'5px 12px',background:'#34d39918',borderRadius:7,border:'1px solid #34d39930'}}>
              <div style={{fontSize:10,color:C.sub}}>Efectivo</div>
              <div style={{fontWeight:800,fontSize:13,color:'#34d399'}}>{COP(totalEfectivo)}</div>
              <div style={{fontSize:10,color:C.sub}}>{pctEfect}%</div>
            </div>
            <div style={{textAlign:'center',padding:'5px 12px',background:'#818cf818',borderRadius:7,border:'1px solid #818cf830'}}>
              <div style={{fontSize:10,color:C.sub}}>Transferencias</div>
              <div style={{fontWeight:800,fontSize:13,color:'#818cf8'}}>{COP(totalTrans)}</div>
              <div style={{fontSize:10,color:C.sub}}>{pctTrans}%</div>
            </div>
          </div>
        </div>

        {totalIngCol>0&&(
          <div style={{display:'flex',height:10,borderRadius:6,overflow:'hidden',marginBottom:'1rem'}}>
            <div style={{width:`${pctEfect}%`,background:'#34d399',transition:'width .4s'}}/>
            <div style={{flex:1,background:'#818cf8'}}/>
          </div>
        )}

        {noData
          ? <div style={{color:C.sub,fontSize:13,padding:'2rem',textAlign:'center'}}>Sin datos</div>
          : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={efectivoVsTransData} margin={{top:5,right:10,left:5,bottom:5}} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="fecha" tick={{fontSize:9,fill:C.sub}}/>
                <YAxis tick={{fontSize:9,fill:C.sub}} tickFormatter={v=>`$${(v/1e6).toFixed(1)}M`}/>
                <Tooltip
                  {...tt}
                  formatter={(v,name)=>[COP(v), name==='efectivo'?'💵 Efectivo':'💳 Transferencias']}
                  labelFormatter={l=>`Semana ${l}`}
                />
                <Legend wrapperStyle={{fontSize:11,color:C.sub}}
                  formatter={v=>v==='efectivo'?'💵 Efectivo':'💳 Transferencias'}/>
                <Bar dataKey="efectivo"        fill="#34d399" radius={[0,0,4,4]} name="efectivo"        stackId="a"/>
                <Bar dataKey="transferencias"  fill="#818cf8" radius={[4,4,0,0]} name="transferencias"  stackId="a"/>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* ── Modal Resumen Diario ────────────────────────────────────────────────── */}
      {showResumenPicker&&(
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}
          onClick={()=>setShowResumenPicker(false)}>
          <div style={{...s.card,width:'min(380px,94vw)',padding:'1.5rem'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:15,marginBottom:'0.25rem'}}>📊 Resumen Diario</div>
            <div style={{color:C.sub,fontSize:12,marginBottom:'1rem'}}>Selecciona la fecha del turno a exportar:</div>
            <select style={{...s.sel,width:'100%',marginBottom:'1rem'}} value={resumenFecha} onChange={e=>setResumenFecha(e.target.value)}>
              <option value="">-- Seleccionar fecha --</option>
              {[...allPlanillas].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(p=>(
                <option key={p.id||p.fecha} value={p.fecha}>
                  {p.fecha}  ·  {p.apertura}–{p.cierre}  ·  Ventas {p.ventas?.toLocaleString('es-CO')||0}
                </option>
              ))}
            </select>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button style={{...s.btn(),fontSize:12,padding:'7px 14px'}} onClick={()=>setShowResumenPicker(false)}>Cancelar</button>
              <button style={{...s.btn('primary'),fontSize:12,padding:'7px 16px',opacity:resumenFecha?1:0.5,cursor:resumenFecha?'pointer':'not-allowed'}}
                disabled={!resumenFecha}
                onClick={()=>{ const p=allPlanillas.find(x=>x.fecha===resumenFecha); if(p){printResumenDiario(p,neg.name);setShowResumenPicker(false);} }}>
                📄 Generar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Historial de cierres ───────────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:'0.75rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>Historial de Cierres — {neg.name}</span>
          <Badge color={C.indigo} small>{planillas.length} semanas</Badge>
        </div>

        {viewPlanilla&&(
          <div style={{...s.card,marginBottom:'1rem',borderColor:C.indigo+'40'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
              <div style={{fontWeight:700,fontSize:13}}>Cierre {viewPlanilla.fecha}</div>
              <div style={{display:'flex',gap:8}}>
                <button style={{...s.btn('primary'),padding:'3px 10px',fontSize:11}} onClick={()=>printPlanilla(viewPlanilla,neg.name)}>🖨 PDF</button>
                <button style={{...s.btn('primary'),padding:'3px 10px',fontSize:11,background:C.indigo,color:'#fff'}} onClick={()=>printResumenDiario(viewPlanilla,neg.name)}>📊 Resumen</button>
                <button style={{...s.btn(),padding:'3px 10px',fontSize:11}} onClick={()=>setViewPlanilla(null)}>✕</button>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:'0.75rem'}}>
              <Metric label="Ventas"   value={COP(viewPlanilla.ventas)}   color={C.green}/>
              <Metric label="Egresos"  value={COP((viewPlanilla.gastos||0)+(viewPlanilla.personal||0))} color={C.red}/>
              <Metric label="Bancos"   value={COP(viewPlanilla.bancos||0)} color={C.indigo}/>
              <Metric label="Utilidad" value={COP(viewPlanilla.neto)}     color={viewPlanilla.neto>=0?C.amber:C.red}/>
            </div>
            {(viewPlanilla.gastosDetalle||[]).length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:600,color:C.sub,marginBottom:4}}>Detalle de egresos:</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {viewPlanilla.gastosDetalle.map((g,i)=>(
                    <div key={i} style={{fontSize:11,padding:'3px 8px',background:C.surface,borderRadius:5,border:`1px solid ${C.border}`}}>
                      <span style={{color:C.text2}}>{g.desc||g.descripcion}</span>
                      <span style={{color:C.red,fontWeight:600,marginLeft:6}}>{COP(g.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {planillas.length===0
          ? <div style={{color:C.sub,fontSize:13,padding:'1rem',textAlign:'center'}}>Sin cierres en el período seleccionado.</div>
          : (
            <>
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>{['Semana','Ventas','Egresos','Utilidad','Margen',''].map(h=><th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {reportPage.pageItems.map((p,i)=>{
                    const egr = (p.gastos||0)+(p.personal||0);
                    const mg  = p.ventas ? Math.round((p.neto/p.ventas)*100) : 0;
                    return (
                      <tr key={p.id} style={{cursor:'pointer'}} onClick={()=>setViewPlanilla(viewPlanilla?.id===p.id?null:p)}>
                        <td style={{...s.td(i),fontWeight:600}}>{p.fecha}</td>
                        <td style={{...s.td(i),color:C.green,fontWeight:600}}>{COP(p.ventas)}</td>
                        <td style={{...s.td(i),color:C.red}}>{COP(egr)}</td>
                        <td style={{...s.td(i),color:p.neto>=0?C.amber:C.red,fontWeight:700}}>{COP(p.neto)}</td>
                        <td style={s.td(i)}><Badge color={mg>40?C.green:mg>20?C.amber:C.red} small>{mg}%</Badge></td>
                        <td style={s.td(i)} onClick={e=>e.stopPropagation()}>
                          <div style={{display:'flex',gap:4}}>
                            <button style={{...s.btn(),padding:'2px 8px',fontSize:10}} onClick={e=>{e.stopPropagation();setViewPlanilla(viewPlanilla?.id===p.id?null:p);}}>Ver</button>
                            <button style={{...s.btn(),padding:'2px 8px',fontSize:10}} onClick={e=>{e.stopPropagation();printPlanilla(p,neg.name);}}>🖨</button>
                            <button style={{...s.btn(),padding:'2px 8px',fontSize:10,color:C.indigo,border:`1px solid ${C.indigo}30`}} onClick={e=>{e.stopPropagation();printResumenDiario(p,neg.name);}}>📊</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <PaginationTabs totalItems={planillas.length} page={reportPage.page} onPageChange={reportPage.setPage} />
            </>
          )
        }
      </div>
    </div>
  );
}
