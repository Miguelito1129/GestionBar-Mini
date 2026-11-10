import { useEffect, useMemo, useState } from "react";
import { C, s } from "../../constants/theme.js";
import { localDelete, localFetch, localInsert, localUpdate } from "../../lib/localApi.js";
import { uid } from "../../utils/helpers.js";
import { Badge, PaginationTabs, useListPagination } from "../common/index.jsx";

const EMPTY_FORM = {
  nombre: "",
  tipo: "2x1",
  producto_principal_id: "",
  producto_cortesia_id: "",
  cantidad_compra: "2",
  cantidad_cortesia: "1",
  precio_promocional: "",
};
const COURTESY_NAMES = ["agua", "gatorade", "gaseosa"];
const PROMOTION_TYPES = {
  "2x1": { label: "2 × 1", icon: "✦", className: "two-for-one" },
  cortesia: { label: "Producto + cortesía", icon: "🎁", className: "courtesy" },
  combo: { label: "Combo", icon: "🍸", className: "combo" },
  precio_especial: { label: "Precio especial", icon: "◈", className: "special-price" },
};

const promotionDescription = (promotion, names) => {
  const main = names.get(promotion.producto_principal_id) || "Producto eliminado";
  if (promotion.tipo === "2x1") return `Lleva ${promotion.cantidad_compra || 2} de ${main} y paga 1.`;
  if (promotion.tipo === "precio_especial") return `${main} por precio especial de $${Number(promotion.precio_promocional || 0).toLocaleString("es-CO")}.`;
  if (promotion.tipo === "combo") {
    const comboItems = Array.isArray(promotion.productos_combo)
      ? promotion.productos_combo
      : (() => {
        try { return JSON.parse(promotion.productos_combo || "[]"); } catch { return []; }
      })();
    return comboItems.map(item => `${item.cantidad} × ${names.get(item.producto_id) || "Producto eliminado"}`).join(" + ");
  }
  const gift = names.get(promotion.producto_cortesia_id) || "producto de cortesía";
  return `Por cada ${main}, entrega ${promotion.cantidad_cortesia || 1} ${gift}.`;
};

export default function Promociones({ negocio }) {
  const [promociones, setPromociones] = useState([]);
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [comboItems, setComboItems] = useState([{ producto_id: "", cantidad: "1" }, { producto_id: "", cantidad: "1" }]);
  const promotionPage = useListPagination(promociones);

  const productNames = useMemo(() => new Map(productos.map(product => [product.id, product.name])), [productos]);

  const load = async () => {
    setLoading(true);
    const [promoRows, productRows] = await Promise.all([
      localFetch("promociones", `negocio_id=eq.${negocio.id}&select=*&order=created_at.desc`),
      localFetch("productos", `negocio_id=eq.${negocio.id}&select=id,name,stock&order=name.asc`),
    ]);
    setPromociones(promoRows || []);
    setProductos(productRows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [negocio.id]);

  const save = async event => {
    event.preventDefault();
    const requiredGift = form.tipo === "cortesia";
    const normalizedCombo = comboItems
      .filter(item => item.producto_id)
      .map(item => ({ producto_id: item.producto_id, cantidad: Math.max(1, Number(item.cantidad) || 1) }));
    const mainProduct = form.tipo === "combo" ? normalizedCombo[0]?.producto_id : form.producto_principal_id;
    const comboHasDuplicate = new Set(normalizedCombo.map(item => item.producto_id)).size !== normalizedCombo.length;
    const comboPrice = Number(form.precio_promocional);
    if (!form.nombre.trim() || !mainProduct || (requiredGift && !form.producto_cortesia_id) || (form.tipo === "combo" && (normalizedCombo.length < 2 || comboHasDuplicate || !Number.isFinite(comboPrice) || comboPrice < 0)) || (form.tipo === "precio_especial" && (!Number.isFinite(comboPrice) || comboPrice < 0))) {
      setMessage(form.tipo === "combo" && comboHasDuplicate
        ? "Un combo debe tener productos diferentes."
        : "Completa el nombre, selecciona al menos dos productos diferentes y define el precio del combo.");
      return;
    }
    const quantity = Math.max(2, Number(form.cantidad_compra) || 2);
    const giftQuantity = Math.max(1, Number(form.cantidad_cortesia) || 1);
    const payload = {
      id: uid(), negocio_id: negocio.id, nombre: form.nombre.trim(), tipo: form.tipo,
      producto_principal_id: mainProduct,
      producto_cortesia_id: requiredGift ? form.producto_cortesia_id : null,
      cantidad_compra: quantity, cantidad_cortesia: giftQuantity, activo: true,
    };
    if (form.tipo === "combo") payload.productos_combo = normalizedCombo;
    if (["combo", "precio_especial"].includes(form.tipo)) payload.precio_promocional = Math.max(0, Number(form.precio_promocional) || 0);
    const saved = await localInsert("promociones", payload);
    if (!saved) { setMessage("No fue posible crear la promoción."); return; }
    setForm(EMPTY_FORM);
    setComboItems([{ producto_id: "", cantidad: "1" }, { producto_id: "", cantidad: "1" }]);
    setShowForm(false);
    setMessage("✓ Promoción creada y activa.");
    load();
  };

  const toggle = async promotion => {
    const activo = !promotion.activo;
    const saved = await localUpdate("promociones", { id: promotion.id }, { activo });
    if (!saved) { setMessage("No fue posible actualizar la promoción."); return; }
    setPromociones(current => current.map(item => item.id === promotion.id ? { ...item, activo } : item));
  };

  const remove = async promotion => {
    if (!window.confirm(`¿Eliminar la promoción “${promotion.nombre}”? Esta acción no se puede deshacer.`)) return;
    const deleted = await localDelete("promociones", { id: promotion.id });
    if (!deleted) { setMessage("No fue posible eliminar la promoción."); return; }
    setPromociones(current => current.filter(item => item.id !== promotion.id));
  };

  return (
    <div className="promotion-page">
      <header className="promotion-page__hero">
        <div>
          <div className="promotion-page__eyebrow"><span>✦</span> OFERTAS DEL LOCAL</div>
          <h1>Promociones</h1>
          <p>Arma beneficios claros para tus clientes. Las promociones activas se aplican al despachar la comanda.</p>
        </div>
        <button
          type="button"
          className={`promotion-create-button${showForm ? " is-cancel" : ""}`}
          onClick={() => { setShowForm(value => !value); setMessage(""); }}
        >
          <span aria-hidden="true">{showForm ? "×" : "+"}</span>
          {showForm ? "Cerrar formulario" : "Nueva promoción"}
        </button>
      </header>

      <div className="promotion-overview">
        <div className="promotion-overview__stat promotion-overview__stat--active">
          <span className="promotion-overview__icon" aria-hidden="true">✦</span>
          <div><strong>{promociones.filter(item => item.activo).length}</strong><span>Promociones activas</span></div>
        </div>
        <div className="promotion-overview__stat">
          <span className="promotion-overview__icon" aria-hidden="true">◈</span>
          <div><strong>{promociones.length}</strong><span>En total</span></div>
        </div>
        <div className="promotion-overview__hint">
          <span aria-hidden="true">ⓘ</span>
          <p>Los descuentos se reflejan en el pedido y el inventario se ajusta al entregar.</p>
        </div>
      </div>

      <div className="promotion-guide">
        <div className="promotion-guide__heading">
          <strong>Tipos de promoción disponibles</strong>
          <span>Una guía rápida de cómo se aplica cada oferta</span>
        </div>
        <div className="promotion-guide__grid">
          <article className="promotion-guide__item promotion-guide__item--amber">
            <span>2×1</span><div><strong>2 × 1</strong><p>Entrega varias unidades y cobra una.</p></div>
          </article>
          <article className="promotion-guide__item promotion-guide__item--violet">
            <span>🎁</span><div><strong>Producto + cortesía</strong><p>Incluye agua, Gatorade o gaseosa.</p></div>
          </article>
          <article className="promotion-guide__item promotion-guide__item--mint">
            <span>🍸</span><div><strong>Combo</strong><p>Varios productos por un precio único.</p></div>
          </article>
          <article className="promotion-guide__item promotion-guide__item--blue">
            <span>◈</span><div><strong>Precio especial</strong><p>Un producto con precio promocional.</p></div>
          </article>
        </div>
      </div>

      {showForm && (
        <form className="promotion-form" onSubmit={save}>
          <div className="promotion-form__heading">
            <span aria-hidden="true">✦</span>
            <div><strong>Crear una promoción</strong><p>Completa los datos para activar una nueva oferta.</p></div>
          </div>
          <div>
            <label style={s.label}>Nombre visible</label>
            <input style={s.inp} value={form.nombre} placeholder="Ej.: 2×1 Cervezas viernes" onChange={event => setForm(current => ({ ...current, nombre: event.target.value }))} />
          </div>
          <div>
            <label style={s.label}>Tipo</label>
            <select style={s.sel} value={form.tipo} onChange={event => setForm(current => ({ ...current, tipo: event.target.value }))}>
              <option value="2x1">2 × 1</option>
              <option value="cortesia">Producto + cortesía</option>
              <option value="precio_especial">Precio especial</option>
              <option value="combo">Combo</option>
            </select>
          </div>
          {form.tipo !== "combo" && <div>
            <label style={s.label}>Producto principal</label>
            <select style={s.sel} value={form.producto_principal_id} onChange={event => setForm(current => ({ ...current, producto_principal_id: event.target.value }))}>
              <option value="">Seleccionar producto</option>
              {productos.map(product => <option key={product.id} value={product.id}>{product.name} · stock {product.stock}</option>)}
            </select>
          </div>}
          {form.tipo === "2x1" ? (
            <div>
              <label style={s.label}>Unidades que salen</label>
              <input style={s.inp} type="number" min="2" value={form.cantidad_compra} onChange={event => setForm(current => ({ ...current, cantidad_compra: event.target.value }))} />
            </div>
          ) : form.tipo === "cortesia" ? <>
            <div>
              <label style={s.label}>Producto de cortesía</label>
              <select style={s.sel} value={form.producto_cortesia_id} onChange={event => setForm(current => ({ ...current, producto_cortesia_id: event.target.value }))}>
                <option value="">Seleccionar cortesía</option>
                {productos.filter(product => product.id !== form.producto_principal_id && COURTESY_NAMES.some(name => product.name.toLowerCase().includes(name))).map(product => <option key={product.id} value={product.id}>{product.name} · stock {product.stock}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Unidades de cortesía</label>
              <input style={s.inp} type="number" min="1" value={form.cantidad_cortesia} onChange={event => setForm(current => ({ ...current, cantidad_cortesia: event.target.value }))} />
            </div>
          </> : form.tipo === "precio_especial" ? <div>
            <label style={s.label}>Precio promocional</label>
            <input style={s.inp} type="number" min="0" value={form.precio_promocional} onChange={event => setForm(current => ({ ...current, precio_promocional: event.target.value }))} />
          </div> : <div className="promotion-combo-builder">
            <div style={s.label}>Productos y cantidades del combo</div>
            {comboItems.map((item, index) => <div key={index} className="promotion-combo-row">
              <select style={s.sel} value={item.producto_id} onChange={event => setComboItems(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, producto_id: event.target.value } : row))}>
                <option value="">Producto</option>{productos.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
              <input style={s.inp} type="number" min="1" value={item.cantidad} onChange={event => setComboItems(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, cantidad: event.target.value } : row))} />
              {comboItems.length > 2 && <button type="button" onClick={() => setComboItems(current => current.filter((_, rowIndex) => rowIndex !== index))}>×</button>}
            </div>)}
            <button type="button" className="promotion-add-row" onClick={() => setComboItems(current => [...current, { producto_id: "", cantidad: "1" }])}>+ Agregar producto</button>
          </div>}
          {form.tipo === "combo" && <div>
            <label style={s.label}>Precio del combo</label>
            <input style={s.inp} type="number" min="0" value={form.precio_promocional} onChange={event => setForm(current => ({ ...current, precio_promocional: event.target.value }))} />
          </div>}
          <button className="promotion-submit" style={{ ...s.btn("success"), alignSelf: "end" }} type="submit">
            <span aria-hidden="true">✓</span> Guardar promoción
          </button>
        </form>
      )}

      {message && <div className={`promotion-message${message.startsWith("✓") ? " is-success" : " is-error"}`} role="status">{message}</div>}
      <div className="promotion-list-heading">
        <div><strong>Tus promociones</strong><span>Administra su disponibilidad y revisa sus condiciones.</span></div>
        <Badge color={C.green} small>{promociones.filter(item => item.activo).length} activas</Badge>
      </div>
      {loading ? <div className="promotion-empty"><span>✦</span><strong>Cargando promociones...</strong></div> : promociones.length === 0 ? (
        <div className="promotion-empty">
          <span>◇</span>
          <strong>Aún no hay promociones</strong>
          <p>Crea tu primera oferta para empezar a atraer clientes.</p>
          {!showForm&&<button type="button" className="promotion-empty__action" onClick={() => { setShowForm(true); setMessage(""); }}>＋ Crear promoción</button>}
        </div>
      ) : <div className="promotion-list">
        {promotionPage.pageItems.map(promotion => (
          <article key={promotion.id} className={`promotion-card promotion-card--${PROMOTION_TYPES[promotion.tipo]?.className||"special-price"} ${promotion.activo ? "is-active" : ""}`}>
            <div className="promotion-card__top">
              <div className="promotion-card__identity">
                <span className="promotion-card__icon" aria-hidden="true">{PROMOTION_TYPES[promotion.tipo]?.icon||"◈"}</span>
                <div><strong>{PROMOTION_TYPES[promotion.tipo]?.label||"Precio especial"}</strong><h3>{promotion.nombre}</h3></div>
              </div>
              <Badge color={promotion.activo ? C.green : C.muted} small>{promotion.activo ? "Activa" : "Pausada"}</Badge>
            </div>
            <div className="promotion-card__details">
              <p>{promotionDescription(promotion, productNames)}</p>
              {["combo", "precio_especial"].includes(promotion.tipo) && (
                <div className="promotion-card__price"><span>Precio promocional</span><strong>${Number(promotion.precio_promocional || 0).toLocaleString("es-CO")}</strong></div>
              )}
            </div>
            <div className="promotion-card__actions">
              <button type="button" className={promotion.activo ? "is-pause" : "is-activate"} onClick={() => toggle(promotion)}>
                <span aria-hidden="true">{promotion.activo ? "Ⅱ" : "▶"}</span>{promotion.activo ? "Pausar oferta" : "Activar oferta"}
              </button>
              <button type="button" className="is-danger" onClick={() => remove(promotion)}>
                <span aria-hidden="true">×</span>Eliminar
              </button>
            </div>
          </article>
        ))}
        <PaginationTabs totalItems={promociones.length} page={promotionPage.page} onPageChange={promotionPage.setPage} />
      </div>}
    </div>
  );
}
