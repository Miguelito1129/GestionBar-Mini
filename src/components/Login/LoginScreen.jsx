import { useState } from "react";
import { useAuth } from "../../hooks/useAuth.jsx";
import { C, s } from "../../constants/theme.js";
import { Badge } from "../common/index.jsx";

export default function LoginScreen() {
  const { login, authError, setupRequired, setupMaster } = useAuth();
  const [email,   setEmail]   = useState('');
  const [pwd,     setPwd]     = useState('');
  const [name,    setName]    = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [err,     setErr]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const isLocalMachine = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  const submit = async e => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await login(email, pwd);
      if (res.error) setErr(res.error);
    } catch (error) {
      setErr(error.message || 'No fue posible iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const setupOwner = async e => {
    e.preventDefault();
    setErr('');
    if (!isLocalMachine) {
      setErr('Configura la cuenta maestra desde el navegador del computador servidor, usando http://localhost:3000.');
      return;
    }
    if (pwd.length < 12) {
      setErr('La contraseña debe tener al menos 12 caracteres.');
      return;
    }
    if (pwd !== confirmPwd) {
      setErr('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await setupMaster(name, pwd);
    } catch (error) {
      setErr(error.message || 'No fue posible configurar la cuenta maestra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem'}}>
      <div style={{width:'min(400px,100%)',background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:'2rem'}}>
        <div style={{textAlign:'center',marginBottom:'1.5rem'}}>
          <img src="/gestionbar-logo.png" alt="GestiónBar" style={{display:'block',width:96,height:90,objectFit:'contain',margin:'0 auto 8px'}}/>
          <div style={{fontSize:24,fontWeight:900,color:C.amber,letterSpacing:'-0.5px'}}>GestiónBar</div>
          <div style={{fontSize:12,color:C.sub,marginTop:4}}>Plataforma de gestión de negocios</div>
        </div>

        {setupRequired ? (
          <form onSubmit={setupOwner}>
            <div style={{padding:'10px 12px',borderRadius:8,background:C.amber+'18',color:C.amber,fontSize:12,lineHeight:1.5,marginBottom:14}}>
              Configuración inicial del único administrador maestro: <strong>mdmm1100@gmail.com</strong>. Esta cuenta no se puede eliminar ni convertir en gerente.
            </div>
            {!isLocalMachine&&<div style={{color:C.sub,fontSize:12,marginBottom:12}}>Abre GestiónBar en el computador servidor con <strong>http://localhost:3000</strong> para crear la cuenta.</div>}
            <div style={{marginBottom:12}}>
              <div style={s.label}>Nombre del administrador</div>
              <input style={s.inp} value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required disabled={!isLocalMachine}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={s.label}>Contraseña maestra (mínimo 12 caracteres)</div>
              <input style={s.inp} type="password" value={pwd} onChange={e=>setPwd(e.target.value)} autoComplete="new-password" required minLength={12} disabled={!isLocalMachine}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={s.label}>Confirmar contraseña</div>
              <input style={s.inp} type="password" value={confirmPwd} onChange={e=>setConfirmPwd(e.target.value)} autoComplete="new-password" required minLength={12} disabled={!isLocalMachine}/>
            </div>
            {err&&<div role="alert" style={{background:C.red+'20',border:`1px solid ${C.red}40`,borderRadius:8,padding:'8px 12px',fontSize:12,color:C.red,marginBottom:12}}>{err}</div>}
            {authError&&<div role="alert" style={{background:C.red+'20',border:`1px solid ${C.red}40`,borderRadius:8,padding:'8px 12px',fontSize:12,color:C.red,marginBottom:12}}>{authError}</div>}
            <button type="submit" disabled={loading||!isLocalMachine} style={{...s.btn('primary'),width:'100%',padding:'10px',fontSize:14,opacity:loading||!isLocalMachine?0.7:1}}>
              {loading?'Configurando...':'Crear administrador maestro'}
            </button>
          </form>
        ) : <form onSubmit={submit}>
          <div style={{marginBottom:12}}>
            <div style={s.label}>Correo electrónico</div>
            <input style={s.inp} type="email" placeholder="usuario@gesbar.co" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/>
          </div>
          <div style={{marginBottom:16}}>
            <div style={s.label}>Contraseña</div>
            <div style={{position:'relative'}}>
              <input
                style={{...s.inp,paddingRight:40}}
                type={showPwd?"text":"password"}
                placeholder="••••••••"
                value={pwd}
                onChange={e=>setPwd(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={()=>setShowPwd(p=>!p)} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:C.sub,fontSize:14}}>
                {showPwd?'🙈':'👁'}
              </button>
            </div>
          </div>

          {(err || authError) && (
            <div style={{background:C.red+'20',border:`1px solid ${C.red}40`,borderRadius:8,padding:'8px 12px',fontSize:12,color:C.red,marginBottom:12}}>
              {err || authError}
            </div>
          )}

          <button type="submit" disabled={loading} style={{...s.btn('primary'),width:'100%',padding:'10px',fontSize:14,opacity:loading?0.7:1}}>
            {loading?'Verificando...':'Ingresar'}
          </button>
        </form>}

        <div style={{marginTop:'1.5rem',textAlign:'center',fontSize:10,color:C.muted}}>
          Sesión de 8 horas · Contraseñas protegidas
        </div>
      </div>
    </div>
  );
}
