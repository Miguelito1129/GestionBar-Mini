import { useState } from "react";
import { useAuth } from "../../hooks/useAuth.jsx";
import { C, s } from "../../constants/theme.js";
import { Badge, Modal, PaginationTabs, TabBar, useListPagination } from "../common/index.jsx";
import { OWNER_EMAIL } from "../../constants/roles.js";

export default function UserMgmt({ negocios, onClose }) {
  const { users, createUser, updateUser, deleteUser, user:me } = useAuth();
  const [tab,    setTab]    = useState('list');
  const [f,      setF]      = useState({ name:'', email:'', role:'mesero', negocios:'all', password:'', negArr:[] });
  const [editId, setEditId] = useState(null);
  const [msg,    setMsg]    = useState('');
  const [saving, setSaving] = useState(false);
  const ROL_OPTS  = [['gerente','Gerente'],['barra','Barra'],['mesero','Mesero'],['dueño','Dueño']];
  const ROLE_BADGE = { admin:C.amber, administrador:C.amber, gerente:C.amber, auxiliar:C.indigo, jefe:C.green, dueño:C.green, barra:C.amber, mesero:C.indigo };
  const editingMaster = editId !== null
    && users.find(account => account.id === editId)?.email.trim().toLowerCase() === OWNER_EMAIL;
  const userPage = useListPagination(users);

  const resetForm = () => setF({ name:'', email:'', role:'mesero', negocios:'all', password:'', negArr:[] });

  const submit = async () => {
    setMsg('');
    const negVal = f.role==='dueño' ? 'all' : (f.negArr.length ? f.negArr : 'all');
    setSaving(true);
    try {
      if (editId) {
        const changes = { name:f.name, email:f.email, role:f.role, negocios:negVal };
        if (f.password) changes.password = f.password;
        await updateUser(editId, changes);
        setMsg('✓ Usuario actualizado');
        setEditId(null);
      } else {
        const res = await createUser({ name:f.name, email:f.email, role:f.role, negocios:negVal, password:f.password });
        if (res.error) { setMsg('⚠ '+res.error); return; }
        setMsg('✓ Usuario creado');
      }
      resetForm();
      setTab('list');
    } catch (error) {
      setMsg(`⚠ ${error.message || 'No fue posible guardar el usuario.'}`);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = u => {
    setF({ name:u.name, email:u.email, role:u.role, negocios:u.negocios, password:'', negArr:Array.isArray(u.negocios)?u.negocios:[] });
    setEditId(u.id);
    setTab('form');
  };

  return (
    <Modal title="Gestión de Usuarios" onClose={onClose} width="min(640px,96vw)">
      <TabBar
        tabs={[{id:'list',label:`Usuarios (${users.length})`},{id:'form',label:editId?'Editar Usuario':'Nuevo Usuario'}]}
        active={tab}
        onChange={t=>{ setTab(t); if(t==='form'&&!editId) resetForm(); }}
      />

      {msg && (
        <div style={{padding:'7px 12px',background:msg.startsWith('✓')?C.green+'18':C.red+'18',border:`1px solid ${msg.startsWith('✓')?C.green:C.red}40`,borderRadius:8,fontSize:12,color:msg.startsWith('✓')?C.green:C.red,marginBottom:12}}>
          {msg}
        </div>
      )}

      {tab==='list' && (
        <div>
          {userPage.pageItems.map(u => {
            const isMaster = u.email.trim().toLowerCase() === OWNER_EMAIL;
            return (
            <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:`1px solid ${C.border}40`}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:(ROLE_BADGE[u.role]||C.muted)+'22',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13,color:ROLE_BADGE[u.role]||C.muted,flexShrink:0}}>
                {u.name.slice(0,2).toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13}}>{u.name} {u.id===me?.id&&<Badge color={C.amber} small>yo</Badge>} {isMaster&&<Badge color={C.amber} small>maestro protegido</Badge>}</div>
                <div style={{fontSize:11,color:C.sub}}>{u.email} · negocios: {u.negocios==='all'?'todos':Array.isArray(u.negocios)?u.negocios.join(', '):u.negocios}</div>
              </div>
              <Badge color={ROLE_BADGE[u.role]||C.muted} small>{u.role}</Badge>
              <button style={{...s.btn(),padding:'3px 10px',fontSize:11}} onClick={()=>startEdit(u)}>{isMaster?'Editar perfil':'Editar'}</button>
              {!isMaster&&u.id!==me?.id && (
                <button style={{...s.btn('danger'),padding:'3px 10px',fontSize:11}} onClick={()=>{ if(window.confirm(`¿Eliminar a ${u.name}?`)) deleteUser(u.id); }}>✕</button>
              )}
            </div>
          );})}
          <PaginationTabs totalItems={users.length} page={userPage.page} onPageChange={userPage.setPage} />
          <button style={{...s.btn('primary'),marginTop:'1rem'}} onClick={()=>{ setEditId(null); resetForm(); setTab('form'); }}>+ Nuevo Usuario</button>
        </div>
      )}

      {tab==='form' && (
        <div>
          {editingMaster&&(
            <div style={{padding:'8px 10px',marginBottom:12,borderRadius:8,background:C.amber+'15',color:C.amber,fontSize:11}}>
              El correo, el rol y los permisos de la única cuenta maestra están protegidos. Aquí solo puedes cambiar el nombre o la contraseña.
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div><div style={s.label}>Nombre</div><input style={s.inp} value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></div>
            <div><div style={s.label}>Email</div><input style={s.inp} type="email" value={f.email} onChange={e=>setF(p=>({...p,email:e.target.value}))} disabled={editingMaster}/></div>
            <div>
              <div style={s.label}>Rol</div>
              {editingMaster
                ? <div style={{...s.inp,color:C.amber}}>Administrador maestro</div>
                : <select style={s.sel} value={f.role} onChange={e=>setF(p=>({...p,role:e.target.value}))}>
                    {ROL_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                  </select>}
            </div>
            <div>
              <div style={s.label}>Contraseña {editId&&'(vacío = sin cambiar)'}</div>
              <input style={s.inp} type="password" value={f.password} onChange={e=>setF(p=>({...p,password:e.target.value}))} placeholder={editId?'••• (opcional)':'mínimo 8 caracteres'}/>
            </div>
          </div>

          {(f.role==='barra'||f.role==='mesero') && (
            <div style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <div style={s.label}>Negocios asignados</div>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,cursor:'pointer',color:C.sub}}>
                  <input type="checkbox" checked={f.negArr.length===0} onChange={()=>setF(p=>({...p,negArr:[]}))} style={{accentColor:C.amber}}/>
                  Todos los negocios
                </label>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:4}}>
                {negocios.map(n=>(
                  <label key={n.id} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12,background:f.negArr.includes(n.id)?n.color+'22':C.surface,padding:'5px 10px',borderRadius:8,border:`1px solid ${f.negArr.includes(n.id)?n.color:C.border}`}}>
                    <input type="checkbox" checked={f.negArr.includes(n.id)} onChange={e=>setF(p=>({...p,negArr:e.target.checked?[...p.negArr,n.id]:p.negArr.filter(x=>x!==n.id)}))}/>
                    {n.emoji} {n.name}
                  </label>
                ))}
              </div>
              <div style={{fontSize:11,color:C.sub,marginTop:6}}>
                {f.role==='mesero'?'El mesero registrará comandas en los negocios seleccionados.':'Barra confirmará pagos, despachos y gastos del turno.'}
              </div>
            </div>
          )}

          <div style={{display:'flex',gap:8,marginTop:'1rem'}}>
            <button style={s.btn('primary')} onClick={submit} disabled={saving}>{saving?'Guardando...':editId?'Guardar Cambios':'Crear Usuario'}</button>
            <button style={s.btn()} onClick={()=>{ setTab('list'); setEditId(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
