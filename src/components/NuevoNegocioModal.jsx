import { useState } from "react";
import { C, s, PALETTE } from "../constants/theme.js";
import { uid } from "../utils/helpers.js";
import { Modal } from "./common/index.jsx";

export default function NuevoNegocioModal({ onClose, onCrear }) {
  const [f, setF] = useState({name:'',emoji:'🏢',color:PALETTE[4],tipo:'bar'});
  const tipos = [['bar','Bar'],['discoteca','Discoteca'],['restaurante','Restaurante'],['cantina','Cantina'],['tienda','Tienda'],['bodega','Bodega'],['panaderia','Panadería']];

  return (
    <Modal title="Crear Nuevo Negocio" onClose={onClose}>
      <div style={{marginBottom:12}}>
        <div style={s.label}>Nombre</div>
        <input style={s.inp} placeholder="ej: Cantina Don Pedro" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
        <div>
          <div style={s.label}>Tipo</div>
          <select style={s.sel} value={f.tipo} onChange={e=>setF(p=>({...p,tipo:e.target.value}))}>
            {tipos.map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          {f.tipo==='tienda'&&<div style={{fontSize:11,color:C.sub,marginTop:6}}>La tienda tendrá punto de venta e inventario; no utilizará turnos, comandas ni meseros.</div>}
        </div>
        <div>
          <div style={s.label}>Emoji</div>
          <input style={s.inp} value={f.emoji} onChange={e=>setF(p=>({...p,emoji:e.target.value}))} maxLength={2}/>
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <div style={s.label}>Color</div>
        <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap'}}>
          {PALETTE.map(c=>(
            <div key={c} onClick={()=>setF(p=>({...p,color:c}))}
              style={{width:26,height:26,borderRadius:'50%',background:c,cursor:'pointer',border:f.color===c?'3px solid white':'3px solid transparent'}}/>
          ))}
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'10px',background:f.color+'20',borderRadius:10,marginBottom:'1.25rem'}}>
        <span style={{fontSize:28}}>{f.emoji||'🏢'}</span>
        <div>
          <div style={{fontWeight:700,fontSize:15,color:f.color}}>{f.name||'Nombre del negocio'}</div>
          <div style={{fontSize:12,color:C.sub,textTransform:'capitalize'}}>{f.tipo}</div>
        </div>
      </div>
      <button style={{...s.btn('primary'),width:'100%',padding:10}} onClick={()=>{
        if(!f.name.trim()) return;
        onCrear({id:uid(),name:f.name.trim(),emoji:f.emoji||'🏢',color:f.color,tipo:f.tipo,staff:[],gastosFijos:[],cxc:[],productos:[],planillas:[]});
        onClose();
      }}>Crear Negocio</button>
    </Modal>
  );
}
