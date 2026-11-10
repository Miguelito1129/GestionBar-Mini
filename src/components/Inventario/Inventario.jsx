import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { C, s, COP } from "../../constants/theme.js";
import { CAT_COLORS } from "../../constants/roles.js";
import { uid } from "../../utils/helpers.js";
import { localDeleteProductos, localInsert } from "../../lib/localApi.js";
import { Badge } from "../common/index.jsx";

export default function Inventario({ negocio, onUpdateNegocio, readOnly }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('Todos');
  const [stockFilter, setStockFilter] = useState('Todos');
  const [showAdd, setShowAdd] = useState(false);
  const [f, setF] = useState({name:'',cat:'Cerveza',price:'',stock:'',min:''});
  const [importMsg, setImportMsg] = useState('');
  const [showConfirmBorrar, setShowConfirmBorrar] = useState(false);
  const fileRef = useRef(null);
  const dragTimerRef = useRef(null);
  const dragRef = useRef(null);
  const dropRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const productos = useMemo(
    () => (negocio.productos || [])
      .map((product, index) => ({ ...product, _originalIndex: index }))
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a._originalIndex - b._originalIndex)
      .map(({ _originalIndex, ...product }) => product),
    [negocio.productos]
  );
  const setProductos = useCallback(fn => onUpdateNegocio({...negocio, productos: typeof fn==='function'?fn(negocio.productos):fn}), [negocio, onUpdateNegocio]);
  const canReorder = !readOnly && !search && catFilter === 'Todos' && stockFilter === 'Todos';
  useEffect(() => () => window.clearTimeout(dragTimerRef.current), []);
  const startProductDrag = (event, productId) => {
    if (!canReorder || event.button !== 0) return;
    event.preventDefault();
    window.clearTimeout(dragTimerRef.current);
    dragRef.current = { productId, pointerId: event.pointerId };
    dropRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragTimerRef.current = window.setTimeout(() => {
      setDraggingId(productId);
    }, 180);
  };
  const trackProductDrag = event => {
    if (dragRef.current?.pointerId !== event.pointerId || draggingId !== dragRef.current.productId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-inventory-product-id]');
    const targetId = target?.getAttribute('data-inventory-product-id');
    if (!targetId || targetId === dragRef.current.productId) {
      dropRef.current = null;
      setDropTarget(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    dropRef.current = { targetId, before };
    setDropTarget({ targetId, before });
  };
  const finishProductDrag = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    window.clearTimeout(dragTimerRef.current);
    const sourceId = dragRef.current.productId;
    const destination = dropRef.current;
    if (destination && destination.targetId !== sourceId && draggingId === sourceId) {
      const current = [...productos];
      const sourceIndex = current.findIndex(product => product.id === sourceId);
      const [moved] = current.splice(sourceIndex, 1);
      const targetIndex = current.findIndex(product => product.id === destination.targetId);
      const insertIndex = targetIndex + (destination.before ? 0 : 1);
      current.splice(insertIndex, 0, moved);
      setProductos(current.map((product, sort_order) => ({ ...product, sort_order })));
    }
    dragRef.current = null;
    dropRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };
  const cancelProductDrag = event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    window.clearTimeout(dragTimerRef.current);
    dragRef.current = null;
    dropRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };
  const cats = ['Todos', ...new Set(productos.map(p=>p.cat))];
  const low = productos.filter(p=>Number(p.stock)<=Number(p.min)&&Number(p.min)>0);
  const outOfStock = productos.filter(p=>Number(p.stock)<=0&&Number(p.min)>0);
  const filtered = productos.filter(p=>{
    const stock = Number(p.stock)||0;
    const minimum = Number(p.min)||0;
    const isOut = stock<=0&&minimum>0;
    const isLow = stock>0&&stock<=minimum&&minimum>0;
    const matchesStock = stockFilter==='Todos'||(stockFilter==='Agotados'&&isOut)||(stockFilter==='Bajo stock'&&isLow)||(stockFilter==='En orden'&&!isOut&&!isLow);
    return (catFilter==='Todos'||p.cat===catFilter)
      && String(p.name||'').toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))
      && matchesStock;
  });

  const loadXLSX = () => new Promise((res,rej)=>{
    if(window.XLSX){res(window.XLSX);return;}
    const sc=document.createElement('script');
    sc.src='https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
    sc.onload=()=>setTimeout(()=>res(window.XLSX),300);
    sc.onerror=rej;
    document.head.appendChild(sc);
  });

  const downloadTemplate = async () => {
    const XLSX = await loadXLSX();
    const data = [
      {nombre:'Buchannas Master 750',categoria:'Whisky',     precio:380000,stock:5,  minimo:2,  cortesia:'gatorade'},
      {nombre:'Amarillo Botella',    categoria:'Aguardiente',precio:140000,stock:20, minimo:6,  cortesia:'agua'},
      {nombre:'Ron Caldas Botella',  categoria:'Ron',        precio:140000,stock:10, minimo:4,  cortesia:'gaseosa'},
      {nombre:'Don Julio 70',        categoria:'Tequila',    precio:700000,stock:4,  minimo:2,  cortesia:'agua'},
      {nombre:'Corona',              categoria:'Cerveza',    precio:10000, stock:100,minimo:24, cortesia:''},
      {nombre:'Gatorade',            categoria:'Cortesía',   precio:10000, stock:50, minimo:24, cortesia:''},
      {nombre:'Agua Cristal',        categoria:'Cortesía',   precio:5000,  stock:200,minimo:48, cortesia:''},
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{wch:28},{wch:15},{wch:12},{wch:8},{wch:8},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Plantilla_Inventario_${negocio.name.replace(/\s/g,'_')}.xlsx`);
    setImportMsg('✓ Plantilla descargada. Llénala y usa "Importar Excel" para subirla.');
  };

  const downloadInventario = async () => {
    if (!productos.length){setImportMsg('⚠ No hay productos para exportar.');return;}
    const XLSX = await loadXLSX();
    const data = productos.map(p=>({nombre:p.name,categoria:p.cat,precio:p.price,stock:p.stock,minimo:p.min}));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{wch:28},{wch:15},{wch:12},{wch:8},{wch:8},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Inventario_${negocio.name.replace(/\s/g,'_')}_${new Date().toLocaleDateString('es-CO').replace(/\//g,'-')}.xlsx`);
    setImportMsg(`✓ Inventario exportado (${productos.length} productos).`);
  };

  const handleImport = async e => {
    const file = e.target.files[0]; if(!file) return;
    setImportMsg('Cargando archivo...');
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf,{type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws,{defval:''});
      if(!rows.length){setImportMsg('⚠ El archivo está vacío. Usa la Plantilla para ver el formato.');return;}
      const g = (row,...keys) => {
        for(const k of keys){
          for(const rk of Object.keys(row)){
            if(rk.trim().toLowerCase()===k.toLowerCase()){
              const v=row[rk]; if(v!==null&&v!==undefined&&v!=='')return v;
            }
          }
        }
        return '';
      };
      const newP = rows.map((row,i)=>({
        id:uid(),
        sort_order:i,
        name:String(g(row,'nombre','Nombre','producto','Producto','name','Name','NOMBRE','PRODUCTO')||'').trim(),
        cat:String(g(row,'categoria','Categoria','CATEGORIA','cat','Cat','categoría','Categoría')||'Otro').trim(),
        price:parseInt(g(row,'precio','Precio','PRECIO','price','Price','valor','Valor'))||0,
        stock:parseInt(g(row,'stock','Stock','STOCK','existencia','Existencia','cantidad','Cantidad'))||0,
        min:parseInt(g(row,'minimo','Minimo','MINIMO','mínimo','Mínimo','min','Min','stock_minimo','StockMinimo','minimum'))||0,
      })).filter(p=>p.name.length>0);
      if(!newP.length){
        const cols=Object.keys(rows[0]||{}).join(', ');
        setImportMsg(`⚠ Sin productos válidos. Columnas detectadas: ${cols}. Descarga la Plantilla para ver el formato correcto.`);
        return;
      }
      if(window.confirm(`Se encontraron ${newP.length} productos.\n\nAceptar = Reemplazar inventario completo\nCancelar = Agregar a los existentes`)){
        if (negocio.tipo !== 'tienda') await localDeleteProductos(negocio.id);
        setProductos(newP);
      } else {
        setProductos(prev=>[...prev,...newP.map((p,i)=>({...p,sort_order:prev.length+i}))]);
      }
      setImportMsg(`✓ ${newP.length} productos importados correctamente.`);
    } catch(err) {
      console.error(err);
      setImportMsg('⚠ Error al leer el archivo. Asegúrate de que sea .xlsx o .xls y usa la Plantilla de ejemplo.');
    }
    e.target.value='';
  };

  return (
    <div className="inventory-page">
      <header className="inventory-hero">
        <div>
          <span className="inventory-hero__eyebrow">CONTROL DE PRODUCTOS</span>
          <div className="inventory-hero__title-row">
            <h1>Inventario</h1>
            {readOnly&&<Badge color={C.sub} small>Solo lectura</Badge>}
          </div>
          <p>{negocio.name} · Revisa existencias, precios y alertas de stock en un solo lugar.</p>
        </div>
        {!readOnly&&<button className="inventory-primary-action" type="button" onClick={()=>setShowAdd(!showAdd)}>
          <span aria-hidden="true">{showAdd?'×':'＋'}</span>{showAdd?'Cerrar':'Agregar producto'}
        </button>}
      </header>

      <div className="inventory-summary">
        <div className="inventory-summary__item">
          <span className="inventory-summary__icon">▦</span>
          <div><span>Productos registrados</span><strong>{productos.length}</strong></div>
        </div>
        <button className={`inventory-summary__item inventory-summary__item--warning${stockFilter==='Bajo stock'?' is-selected':''}`} type="button" onClick={()=>setStockFilter(stockFilter==='Bajo stock'?'Todos':'Bajo stock')}>
          <span className="inventory-summary__icon">!</span>
          <div><span>Por debajo del mínimo</span><strong>{low.filter(p=>Number(p.stock)>0).length}</strong></div>
        </button>
        <button className={`inventory-summary__item inventory-summary__item--danger${stockFilter==='Agotados'?' is-selected':''}`} type="button" onClick={()=>setStockFilter(stockFilter==='Agotados'?'Todos':'Agotados')}>
          <span className="inventory-summary__icon">↓</span>
          <div><span>Agotados</span><strong>{outOfStock.length}</strong></div>
        </button>
        <button className={`inventory-summary__item inventory-summary__item--healthy${stockFilter==='En orden'?' is-selected':''}`} type="button" onClick={()=>setStockFilter(stockFilter==='En orden'?'Todos':'En orden')}>
          <span className="inventory-summary__icon">✓</span>
          <div><span>Con stock suficiente</span><strong>{productos.filter(p=>Number(p.stock)>Number(p.min)||Number(p.min)<=0&&Number(p.stock)>0).length}</strong></div>
        </button>
      </div>

      <div className="inventory-toolbar">
        <label className="inventory-search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Buscar productos" placeholder="Buscar por nombre..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {search&&<button type="button" onClick={()=>setSearch('')} aria-label="Limpiar búsqueda">×</button>}
        </label>
        <label className="inventory-category-select">
          <span>Categoría</span>
          <select style={s.sel} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select>
        </label>
        {!readOnly&&<div className="inventory-tools">
          <button type="button" onClick={()=>fileRef.current?.click()} title="Importar productos desde Excel">↥ <span>Importar</span></button>
          <button type="button" onClick={downloadInventario} title="Descargar inventario actual en Excel">↧ <span>Exportar</span></button>
          <button type="button" onClick={downloadTemplate} title="Descargar plantilla de Excel">▤ <span>Plantilla</span></button>
          <button type="button" className="inventory-tools__danger" onClick={()=>setShowConfirmBorrar(true)} title="Borrar todo el inventario">× <span>Borrar todo</span></button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={handleImport}/>
        </div>}
      </div>

      <div className="inventory-filter-row" role="group" aria-label="Filtrar productos por existencias">
        {['Todos','Bajo stock','Agotados','En orden'].map(status=>(
          <button key={status} type="button" className={`inventory-filter${stockFilter===status?' is-active':''}${status==='Agotados'?' is-danger':status==='Bajo stock'?' is-warning':status==='En orden'?' is-healthy':''}`} onClick={()=>setStockFilter(status)}>
            {status}<span>{status==='Todos'?productos.length:status==='Agotados'?outOfStock.length:status==='Bajo stock'?low.filter(p=>Number(p.stock)>0).length:productos.filter(p=>Number(p.stock)>Number(p.min)||Number(p.min)<=0&&Number(p.stock)>0).length}</span>
          </button>
        ))}
        <span className="inventory-result-count">Mostrando <strong>{filtered.length}</strong> de {productos.length}</span>
      </div>
      {!readOnly && (
        <div className="inventory-order-hint">
          {canReorder
            ? "Mantén presionada el asa ⋮⋮ y arrastra cada producto hasta la posición deseada."
            : "Limpia la búsqueda y los filtros para poder reordenar los productos."}
        </div>
      )}

      {importMsg&&(
        <div className={`inventory-message${importMsg.startsWith('✓')?' is-success':' is-warning'}`}>
          <span style={{color:importMsg.startsWith('✓')?C.green:C.amber}}>{importMsg}</span>
          <button type="button" onClick={()=>setImportMsg('')} aria-label="Cerrar mensaje">✕</button>
        </div>
      )}

      {productos.filter(p=>p.stock<0).length>0&&(
        <div style={{padding:'10px 14px',background:C.red+'18',border:`2px solid ${C.red}60`,borderRadius:8,fontSize:12,marginBottom:'1rem'}}>
          <div style={{fontWeight:800,color:C.red,marginBottom:4}}>⚠ Productos con stock negativo — esto no debería ocurrir:</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {productos.filter(p=>p.stock<0).map(p=><span key={p.id} style={{background:C.red+'22',color:C.red,padding:'2px 8px',borderRadius:6,fontWeight:700}}>{p.name}: {p.stock}</span>)}
          </div>
          <div style={{fontSize:11,color:C.red,marginTop:6}}>Corrige las existencias del producto para normalizar el inventario.</div>
        </div>
      )}

      {showConfirmBorrar&&(
        <div style={{...s.card,borderColor:C.red+'60',marginBottom:'1rem',padding:'1rem'}}>
          <div style={{fontWeight:700,color:C.red,marginBottom:8}}>⚠ ¿Borrar todo el inventario ({productos.length} productos)?</div>
          <div style={{fontSize:12,color:C.sub,marginBottom:12}}>Borrará todos los productos de este negocio en SQLite. No se puede deshacer.</div>
          <div style={{display:'flex',gap:8}}>
            <button style={s.btn('danger')} onClick={async()=>{
             if (negocio.tipo !== 'tienda') await localDeleteProductos(negocio.id);
              setProductos([]);
              setShowConfirmBorrar(false);
              setImportMsg('✓ Inventario borrado completamente.');
            }}>Sí, borrar todo</button>
            <button style={s.btn()} onClick={()=>setShowConfirmBorrar(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {!readOnly&&<div style={{marginBottom:'0.75rem',padding:'7px 12px',background:C.surface,borderRadius:8,fontSize:11,color:C.sub,border:`1px solid ${C.border}`}}>📋 <strong style={{color:C.text}}>Formato Excel:</strong> columnas <code style={{background:C.border,padding:'1px 5px',borderRadius:4}}>nombre</code>, <code style={{background:C.border,padding:'1px 5px',borderRadius:4}}>categoria</code>, <code style={{background:C.border,padding:'1px 5px',borderRadius:4}}>precio</code>, <code style={{background:C.border,padding:'1px 5px',borderRadius:4}}>stock</code>, <code style={{background:C.border,padding:'1px 5px',borderRadius:4}}>minimo</code></div>}

      {showAdd&&!readOnly&&(
        <div className="inventory-add-panel">
          <div className="inventory-add-panel__heading"><span>＋</span><div><strong>Nuevo producto</strong><p>Agrega un producto y define su nivel de inventario.</p></div></div>
          <div className="inventory-add-panel__fields">
            <div><div style={s.label}>Nombre</div><input style={s.inp} value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></div>
            <div><div style={s.label}>Categoría</div>
              <select style={s.sel} value={f.cat} onChange={e=>setF(p=>({...p,cat:e.target.value}))}>
                {Object.keys(CAT_COLORS).map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div><div style={s.label}>Precio</div><input style={s.inp} type="number" value={f.price} onChange={e=>setF(p=>({...p,price:e.target.value}))}/></div>
            <div><div style={s.label}>Stock</div><input style={s.inp} type="number" value={f.stock} onChange={e=>setF(p=>({...p,stock:e.target.value}))}/></div>
            <div><div style={s.label}>Mínimo</div><input style={s.inp} type="number" value={f.min} onChange={e=>setF(p=>({...p,min:e.target.value}))}/></div>
          </div>
          <div className="inventory-add-panel__actions">
            <button type="button" style={s.btn('primary')} onClick={()=>{
              if(!f.name) return;
              setProductos(p=>[...p,{...f,id:uid(),sort_order:p.length,price:parseInt(f.price)||0,stock:parseInt(f.stock)||0,min:parseInt(f.min)||0}]);
              setF({name:'',cat:'Cerveza',price:'',stock:'',min:''});
              setShowAdd(false);
            }}>Guardar</button>
            <button type="button" style={s.btn('ghost')} onClick={()=>setShowAdd(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="inventory-table-panel">
        {filtered.length===0?(
          <div className="inventory-empty">
            <span>⌕</span><strong>{productos.length?'No hay productos con estos filtros':'Aún no hay productos'}</strong>
            <p>{productos.length?'Prueba con otra búsqueda o limpia los filtros.':'Agrega productos o importa tu inventario desde Excel.'}</p>
            {(search||catFilter!=='Todos'||stockFilter!=='Todos')&&<button type="button" onClick={()=>{setSearch('');setCatFilter('Todos');setStockFilter('Todos');}}>Limpiar filtros</button>}
          </div>
        ):(
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead><tr>{['Producto','Categoría','Precio de venta','Existencias','Mínimo','Estado',...(!readOnly?['Orden']:[]),''].map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map((p,i)=>{
                  const productIndex = productos.findIndex(product => product.id === p.id);
                  const stock=Number(p.stock)||0;
                  const minimum=Number(p.min)||0;
                  const out=stock<=0&&minimum>0;
                  const lowS=stock>0&&stock<=minimum&&minimum>0;
                  const status=out?'Agotado':lowS?'Reponer':'Disponible';
                  const color=out?C.red:lowS?C.amber:C.green;
                  const progress=minimum>0?Math.min(100,Math.max(5,stock/minimum*50)):100;
                  return(
                    <tr
                      key={p.id}
                      data-inventory-product-id={p.id}
                      className={`${out?'is-out':lowS?'is-low':''}${draggingId===p.id?' is-dragging':''}${dropTarget?.targetId===p.id?dropTarget.before?' is-drop-before':' is-drop-after':''}`}
                      onPointerMove={trackProductDrag}
                      onPointerUp={finishProductDrag}
                      onPointerCancel={cancelProductDrag}
                    >
                      <td className="inventory-table__product">
                        <span className="inventory-product-mark" style={{'--product-color':CAT_COLORS[p.cat]||C.indigo}} aria-hidden="true">{String(p.name||'?').trim().slice(0,1).toUpperCase()}</span>
                        <div><strong>{p.name}</strong><span>{status}</span></div>
                      </td>
                      <td><Badge color={CAT_COLORS[p.cat]||C.muted} small>{p.cat}</Badge></td>
                      <td>
                        {readOnly
                          ? <strong className="inventory-price">{p.price>0?COP(p.price):'—'}</strong>
                          : <label className="inventory-inline-field"><span className="inventory-inline-field__prefix">$</span><input aria-label={`Precio de ${p.name}`} type="number" min="0" value={p.price} onChange={e=>setProductos(prev=>prev.map(x=>x.id===p.id?{...x,price:Math.max(0,parseInt(e.target.value)||0)}:x))}/></label>
                        }
                      </td>
                      <td>
                        <div className="inventory-stock-cell">
                          {readOnly?<strong className="inventory-stock-value" style={{color}}>{stock}</strong>:<label className={`inventory-inline-field inventory-inline-field--stock${out?' is-out':lowS?' is-low':''}`}><input aria-label={`Existencias de ${p.name}`} type="number" min="0" value={p.stock} onChange={e=>setProductos(prev=>prev.map(x=>x.id===p.id?{...x,stock:Math.max(0,parseInt(e.target.value)||0)}:x))}/><span>uds.</span></label>}
                          <span className="inventory-stock-track"><i style={{width:`${progress}%`,backgroundColor:color}}/></span>
                        </div>
                      </td>
                      <td><span className="inventory-minimum">{minimum} uds.</span></td>
                      <td><span className={`inventory-status${out?' is-out':lowS?' is-low':' is-good'}`}><i/>{status}</span></td>
                      {!readOnly&&<td>
                        <div className="inventory-order-controls">
                          <button
                            type="button"
                            className="inventory-drag-handle"
                            onPointerDown={event=>startProductDrag(event,p.id)}
                            aria-label={`Mantener presionado y arrastrar ${p.name} para cambiar su orden`}
                            title="Mantén presionado y arrastra para ordenar"
                            disabled={!canReorder}
                          >
                            ⠿
                          </button>
                          <span>{productIndex+1}</span>
                        </div>
                      </td>}
                      <td>{!readOnly&&<button className="inventory-delete" type="button" onClick={()=>setProductos(prev=>prev.filter(x=>x.id!==p.id))} aria-label={`Eliminar ${p.name}`} title="Eliminar producto">×</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
