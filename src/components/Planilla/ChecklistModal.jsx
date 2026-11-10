import { useState } from "react";
import { C, s } from "../../constants/theme.js";
import { Modal } from "../common/index.jsx";

const CHECKLIST_ITEMS = [
  { id:'aseo_personal',     label:'Aseo personal correcto',          grupo:'Presentación', icon:'👔' },
  { id:'uniforme',          label:'Uniforme completo',               grupo:'Presentación', icon:'👕' },
  { id:'destapador',        label:'Tiene destapador',                grupo:'Herramientas', icon:'🔧' },
  { id:'trapo',             label:'Tiene trapo/paño de limpieza',    grupo:'Herramientas', icon:'🧹' },
  { id:'baños_limpios',     label:'Baños limpios',                   grupo:'Local',        icon:'🚽' },
  { id:'cervezas_frias',    label:'Cervezas surtidas y frías',       grupo:'Local',        icon:'🍺' },
  { id:'estanterias',       label:'Estanterías surtidas',            grupo:'Local',        icon:'📦' },
  { id:'sonido_luces',      label:'Sonido y luces funcionales',      grupo:'Equipos',      icon:'🎵' },
  { id:'camaras_humo',      label:'Cámaras de humo funcionando',     grupo:'Equipos',      icon:'💨' },
  { id:'computador_dj',     label:'Computador DJ y consola OK',      grupo:'Equipos',      icon:'💻' },
  { id:'camaras_seguridad', label:'Cámaras de seguridad activas',    grupo:'Equipos',      icon:'📷' },
];

export { CHECKLIST_ITEMS };

export default function ChecklistModal({ onClose, onConfirm }) {
  const [checks,            setChecks]            = useState(() => Object.fromEntries(CHECKLIST_ITEMS.map(i => [i.id, false])));
  const [novedadesApertura, setNovedadesApertura] = useState('');
  const grupos = [...new Set(CHECKLIST_ITEMS.map(i => i.grupo))];
  const total  = CHECKLIST_ITEMS.length;
  const done   = Object.values(checks).filter(Boolean).length;
  const pct    = Math.round((done / total) * 100);

  return (
    <Modal title="✓ Checklist de Apertura" onClose={onClose} width="min(580px,96vw)">
      <div style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <span style={{fontSize:12,color:C.sub}}>{done}/{total} items verificados</span>
          <span style={{fontWeight:700,color:pct===100?C.green:pct>60?C.amber:C.red,fontSize:14}}>{pct}%</span>
        </div>
        <div style={{height:6,background:C.border,borderRadius:4,overflow:'hidden'}}>
          <div style={{height:'100%',background:pct===100?C.green:pct>60?C.amber:C.red,width:`${pct}%`,transition:'width 0.3s',borderRadius:4}}/>
        </div>
      </div>

      {grupos.map(grupo=>(
        <div key={grupo} style={{marginBottom:'1rem'}}>
          <div style={{fontSize:10,fontWeight:600,color:C.sub,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>{grupo}</div>
          {CHECKLIST_ITEMS.filter(i=>i.grupo===grupo).map(item=>(
            <label key={item.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,cursor:'pointer',marginBottom:4,background:checks[item.id]?C.green+'12':C.surface,border:`1px solid ${checks[item.id]?C.green:C.border}40`,transition:'all 0.15s'}}>
              <input type="checkbox" checked={checks[item.id]} onChange={e=>setChecks(p=>({...p,[item.id]:e.target.checked}))} style={{accentColor:C.green,width:16,height:16}}/>
              <span style={{fontSize:16}}>{item.icon}</span>
              <span style={{fontSize:13,color:checks[item.id]?C.green:C.text,fontWeight:checks[item.id]?600:400}}>{item.label}</span>
              {checks[item.id]&&<span style={{marginLeft:'auto',color:C.green,fontSize:16}}>✓</span>}
            </label>
          ))}
        </div>
      ))}

      <div style={{marginBottom:'1rem'}}>
        <div style={{fontSize:10,fontWeight:600,color:C.sub,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Novedades de Apertura</div>
        <textarea
          style={{...s.inp,minHeight:80,resize:'vertical',fontSize:12,lineHeight:1.5}}
          placeholder="Ej: Nevera 1 sin enfriar, falta hielo, cámara de humo sin gas... (opcional)"
          value={novedadesApertura}
          onChange={e=>setNovedadesApertura(e.target.value)}
        />
      </div>

      {done < total && (
        <div style={{padding:'8px 12px',background:C.amber+'18',border:`1px solid ${C.amber}40`,borderRadius:8,fontSize:12,color:C.amber,marginBottom:'1rem'}}>
          ⚠ Quedan {total-done} items sin verificar. Quedarán como pendientes en el reporte.
        </div>
      )}

      <div style={{display:'flex',gap:8}}>
        <button style={{...s.btn('primary'),flex:1,padding:10,fontSize:13}} onClick={()=>onConfirm(checks, novedadesApertura)}>
          {pct===100?'✓ Todo OK — Abrir Turno':'Continuar con pendientes'}
        </button>
        <button style={s.btn()} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
