import { useState } from "react";
import { s } from "../../constants/theme.js";
import { ROLES_LIST } from "../../constants/roles.js";
import { uid } from "../../utils/helpers.js";
import { Modal } from "../common/index.jsx";

const PAY_DEFAULT = { barra:'3%', dj:133000, mesero:'5%', patin:70000, seguridad:80000, aseo:40000, barra_fija:70000, mesero_fijo:50000, otro:0 };
const ROL_LABEL   = { barra:'barra', dj:'DJ', mesero:'mesero', patin:'patín', seguridad:'seguridad', aseo:'aseo', barra_fija:'barra fija', mesero_fijo:'mesero fijo', otro:'otro' };

export default function NuevoStaffModal({ onClose, onAgregar }) {
  const [f, setF] = useState({ name:'', rol:'mesero', pay:'' });

  return (
    <Modal title="Agregar Personal al Turno" onClose={onClose}>
      <div style={{fontSize:12,color:'#64748b',marginBottom:'1rem'}}>
        Este personal solo aplica para este turno. Para guardarlo permanentemente, usa "Gestionar Personal".
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <div>
          <div style={s.label}>Nombre</div>
          <input style={s.inp} placeholder="Nombre completo" value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))} autoFocus/>
        </div>
        <div>
          <div style={s.label}>Rol</div>
          <select style={s.sel} value={f.rol} onChange={e=>setF(p=>({...p,rol:e.target.value,pay:String(PAY_DEFAULT[e.target.value]||'')}))}>
            {ROLES_LIST.map(r=><option key={r} value={r}>{ROL_LABEL[r]||r}</option>)}
          </select>
        </div>
        <div style={{gridColumn:'span 2'}}>
          <div style={s.label}>Pago (número = fijo, "5%" = porcentaje)</div>
          <input style={s.inp} placeholder={`ej: ${PAY_DEFAULT[f.rol]||80000}`} value={f.pay} onChange={e=>setF(p=>({...p,pay:e.target.value}))}/>
        </div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button style={{...s.btn('primary'),flex:1}} onClick={()=>{
          if(!f.name.trim()) return;
          const pay = f.pay==='' ? PAY_DEFAULT[f.rol] : isNaN(Number(f.pay)) ? f.pay : Number(f.pay);
          onAgregar({ id:`tmp_${uid()}`, name:f.name.trim(), rol:f.rol, pay, activo:true, temporal:true });
          onClose();
        }}>Agregar al Turno</button>
        <button style={s.btn()} onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
