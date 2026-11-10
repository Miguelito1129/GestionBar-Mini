import { C, s } from "../../constants/theme.js";

export const Badge = ({ color=C.muted, children, small }) =>
  <span style={{ background:color+"22", color, padding:small?"1px 7px":"2px 9px", borderRadius:20, fontSize:small?10:11, fontWeight:700, whiteSpace:"nowrap" }}>{children}</span>;

export const Metric = ({ label, value, color=C.text, sub, icon, compact }) =>
  <div style={{...s.metric,...(compact?{padding:'0.4rem 0.6rem'}:{})}}>
    <div style={{...s.label,...(compact?{fontSize:9,marginBottom:2}:{})}}>{icon&&<span className="ui-metric__icon" style={{marginRight:4}}>{icon}</span>}{label}</div>
    <div style={{...s.big,color,...(compact?{fontSize:14}:{})}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:C.sub,marginTop:2}}>{sub}</div>}
  </div>;

export const SectionTitle = ({ children, action }) =>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
    <div style={{fontSize:19,fontWeight:800,letterSpacing:"-0.3px"}}>{children}</div>
    {action}
  </div>;

export const TabBar = ({ tabs, active, onChange, color }) =>
  <div style={{display:"flex",gap:2,background:C.surface,padding:3,borderRadius:10,width:"fit-content",marginBottom:"1.25rem",border:`1px solid ${C.border}`,flexWrap:"wrap"}}>
    {tabs.map(t => {
      const a = active === t.id;
      return <button key={t.id} style={{padding:"5px 13px",borderRadius:8,border:"none",cursor:"pointer",background:a?(color||"#f59e0b"):"transparent",color:a?"#0b0b14":C.sub,fontWeight:a?700:400,fontSize:12}} onClick={()=>onChange(t.id)}>{t.label}</button>;
    })}
  </div>;

export { PaginationTabs, useListPagination, LIST_PAGE_SIZE } from "./Pagination.jsx";

export const Modal = ({ title, onClose, children, width }) =>
  <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{...s.modal,width:width||"min(560px,96vw)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
        <div style={{fontWeight:800,fontSize:16}}>{title}</div>
        <button onClick={onClose} style={{...s.btn("ghost"),fontSize:18,padding:"2px 8px",color:C.sub}}>✕</button>
      </div>
      {children}
    </div>
  </div>;

// s.btn debe estar disponible en este scope — lo re-exportamos para uso inline
export { s, C };
