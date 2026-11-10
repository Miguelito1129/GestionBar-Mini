import { useEffect, useMemo, useState } from "react";
import { C, s, COP } from "../../constants/theme.js";
import { uid } from "../../utils/helpers.js";
import {
  localCreateInventoryProduct,
  localCreateInventoryPurchase,
  localFetchOrThrow,
  localInsertDetailed,
} from "../../lib/localApi.js";

const CATEGORIES = ["Insumos", "Nómina", "Mantenimiento", "Servicios", "Proveedores", "Arriendo", "Comisión", "CxC", "Otros"];
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const newItem = productId => ({ producto_id: productId, cantidad: "1", precio_unitario: "" });

export default function IngresoInventario({ negocio, onRegistered }) {
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([newItem("")]);
  const [category, setCategory] = useState("Insumos");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", cat: "", price: "", min: "0" });

  useEffect(() => {
    let active = true;
    setLoading(true);
    localFetchOrThrow("productos", `negocio_id=eq.${encodeURIComponent(negocio.id)}&select=*&order=sort_order.asc`)
      .then(result => {
        if (!Array.isArray(result)) throw new Error("El servidor devolvió un catálogo inválido.");
        if (!active) return;
        setProducts(result);
        setItems(current => current.map((item, index) => ({
          ...item,
          producto_id: item.producto_id || result[index]?.id || result[0]?.id || "",
        })));
      })
      .catch(loadError => {
        if (active) setError(loadError.message || "No fue posible cargar los productos del inventario.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [negocio.id]);

  const total = useMemo(() => items.reduce((sum, item) => {
    const quantity = Number(item.cantidad);
    const unitCost = Number(item.precio_unitario);
    const lineTotal = quantity * unitCost;
    return Number.isSafeInteger(quantity) && quantity > 0
      && Number.isSafeInteger(unitCost) && unitCost > 0
      && Number.isSafeInteger(lineTotal) ? sum + lineTotal : sum;
  }, 0), [items]);

  const updateItem = (index, changes) => {
    setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item));
  };

  const registerExpense = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (!date) throw new Error("Selecciona la fecha del gasto.");
      if (category === "Insumos") {
        const validItems = items.map(item => ({
          producto_id: item.producto_id,
          cantidad: Number(item.cantidad),
          precio_unitario: Number(item.precio_unitario),
        }));
        if (!validItems.length || validItems.some(item =>
          !item.producto_id || !Number.isSafeInteger(item.cantidad) || item.cantidad < 1
          || !Number.isSafeInteger(item.precio_unitario) || item.precio_unitario < 1
        )) {
          throw new Error("Selecciona un producto e indica cantidades y costos unitarios enteros mayores que cero.");
        }

        const result = await localCreateInventoryPurchase({
          negocio_id: negocio.id,
          fecha: date,
          descripcion: description.trim(),
          items: validItems,
        });
        if (!result?.gasto || !Array.isArray(result.productos)) {
          throw new Error("El servidor guardó una respuesta de compra inválida.");
        }
        const updatedProducts = products.map(product => {
          const updated = result.productos.find(item => item.id === product.id);
          return updated ? { ...product, stock: updated.stock } : product;
        });
        setProducts(updatedProducts);
        onRegistered?.(result.gasto, result.productos.map(stock => ({
          ...products.find(product => product.id === stock.id),
          ...stock,
        })));
        setItems([newItem(products[0]?.id || "")]);
        setDescription("");
        setDate(today());
        setMessage(`Ingreso de insumos guardado. Total: ${COP(result.gasto.monto)}. El precio de venta no cambió.`);
        return;
      }

      const expenseAmount = Number(amount);
      if (!description.trim() || !Number.isSafeInteger(expenseAmount) || expenseAmount <= 0) {
        throw new Error("Completa la descripción y un monto entero mayor que cero.");
      }
      const expense = {
        id: uid(),
        negocio_id: negocio.id,
        fecha: date,
        desc: description.trim(),
        monto: expenseAmount,
        cat: category,
        foto_url: null,
        procesado: false,
      };
      const result = await localInsertDetailed("gastos", expense);
      if (!result.ok) throw new Error(result.error || "El servidor no guardó el gasto.");
      setDescription("");
      setAmount("");
      setDate(today());
      onRegistered?.(expense, []);
      setMessage("Gasto guardado correctamente.");
    } catch (saveError) {
      setError(saveError.message || "No fue posible guardar el registro.");
    } finally {
      setSaving(false);
    }
  };

  const createProduct = async () => {
    if (creatingProduct) return;
    const name = newProduct.name.trim();
    const productCategory = newProduct.cat.trim();
    const price = Number(newProduct.price);
    const minimum = Number(newProduct.min);
    if (!name || !productCategory || !Number.isSafeInteger(price) || price < 0
      || !Number.isSafeInteger(minimum) || minimum < 0) {
      setError("Completa nombre y categoría; el precio y el mínimo deben ser números enteros válidos.");
      return;
    }
    setCreatingProduct(true);
    setError("");
    setMessage("");
    const product = {
      id: uid(),
      negocio_id: negocio.id,
      name,
      cat: productCategory,
      price,
      stock: 0,
      min: minimum,
    };
    try {
      const savedProduct = await localCreateInventoryProduct(product);
      if (!savedProduct?.id) throw new Error("El servidor devolvió un producto inválido.");
      setProducts(current => [...current, savedProduct]);
      setItems(current => {
        const emptyIndex = current.findIndex(item => !item.producto_id);
        return emptyIndex === -1
          ? [...current, newItem(savedProduct.id)]
          : current.map((item, index) => index === emptyIndex ? { ...item, producto_id: savedProduct.id } : item);
      });
      onRegistered?.(null, [savedProduct]);
      setNewProduct({ name: "", cat: "", price: "", min: "0" });
      setShowNewProduct(false);
      setMessage("Producto creado. Ahora puedes ingresar la cantidad y el costo de compra.");
    } catch (saveError) {
      setError(saveError.message || "No fue posible crear el producto.");
    } finally {
      setCreatingProduct(false);
    }
  };

  const isInventory = category === "Insumos";

  return (
    <section className="inventory-purchase inventory-purchase--compact expenses-panel">
      <div className="inventory-purchase__heading">
        <span className="expenses-panel__icon expenses-panel__icon--amber">＋</span>
        <div>
          <h2>Registro manual</h2>
          <p>Registra un gasto o actualiza existencias.</p>
        </div>
      </div>
      {error && <div role="alert" className="inventory-purchase__notice is-error">{error}</div>}
      {message && <div role="status" className="inventory-purchase__notice">{message}</div>}

      <form onSubmit={registerExpense}>
        <div className="inventory-purchase__section-label"><span>1</span> Tipo de registro</div>
        <div className="inventory-purchase__fields inventory-purchase__fields--setup">
          <label style={{ color: C.sub, fontSize: 12 }}>
            Categoría
            <select style={{ ...s.sel, display: "block", width: "100%", marginTop: 5 }} value={category} onChange={event => {
              setCategory(event.target.value);
              setError("");
              setMessage("");
            }}>
              {CATEGORIES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label style={{ color: C.sub, fontSize: 12 }}>
            Fecha
            <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 5 }} type="date" value={date} onChange={event => setDate(event.target.value)} required />
          </label>
        </div>

        {isInventory ? (
          <>
            <div className="inventory-purchase__section-label"><span>2</span> Productos y costos</div>
            <div className="inventory-purchase__inventory-info">
              El costo de los productos se registra como gasto y suma unidades al inventario.
            </div>
            <label className="inventory-purchase__reference" style={{ color: C.sub, fontSize: 11 }}>
              Referencia <span>(opcional)</span>
              <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 5 }} maxLength={160} value={description} placeholder="Factura o proveedor" onChange={event => setDescription(event.target.value)} />
            </label>
            <div className="inventory-purchase__products-heading">
              <strong>Detalle de productos</strong>
              <button type="button" onClick={() => {
                setShowNewProduct(value => !value);
                setError("");
              }}>
                {showNewProduct ? "Cancelar producto" : "＋ Agregar producto al inventario"}
              </button>
            </div>
            {showNewProduct && (
              <div className="inventory-purchase__new-product">
                <div className="inventory-purchase__new-product-title">Nuevo producto de inventario</div>
                <label style={{ color: C.sub, fontSize: 11 }}>
                  Nombre
                  <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 4 }} maxLength={120} value={newProduct.name} onChange={event => setNewProduct(current => ({ ...current, name: event.target.value }))} />
                </label>
                <label style={{ color: C.sub, fontSize: 11 }}>
                  Categoría del producto
                  <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 4 }} maxLength={60} placeholder="Ej. Bebidas" value={newProduct.cat} onChange={event => setNewProduct(current => ({ ...current, cat: event.target.value }))} />
                </label>
                <label style={{ color: C.sub, fontSize: 11 }}>
                  Precio de venta (COP)
                  <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 4 }} type="number" min="0" step="1" value={newProduct.price} onChange={event => setNewProduct(current => ({ ...current, price: event.target.value }))} />
                </label>
                <label style={{ color: C.sub, fontSize: 11 }}>
                  Stock mínimo
                  <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 4 }} type="number" min="0" step="1" value={newProduct.min} onChange={event => setNewProduct(current => ({ ...current, min: event.target.value }))} />
                </label>
                <button type="button" style={s.btn("primary")} disabled={creatingProduct} onClick={() => void createProduct()}>
                  {creatingProduct ? "Creando..." : "Guardar producto"}
                </button>
              </div>
            )}

            {loading ? <p style={{ color: C.sub }}>Cargando productos...</p> : products.length === 0 ? (
              <p style={{ color: C.sub, fontSize: 11, margin: "10px 0" }}>Agrega un producto al inventario para registrar sus existencias.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {items.map((item, index) => (
                  <div key={index} className="inventory-purchase__item">
                    <div className="inventory-purchase__item-heading">
                      <span>Producto {index + 1}</span>
                      <button type="button" disabled={items.length === 1} aria-label={`Quitar producto ${index + 1}`} onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button>
                    </div>
                    <label className="inventory-purchase__product" style={{ color: C.sub, fontSize: 12 }}>
                      Producto del catálogo
                      <select style={{ ...s.sel, display: "block", width: "100%", marginTop: 5 }} value={item.producto_id} onChange={event => updateItem(index, { producto_id: event.target.value })} required>
                        <option value="">Selecciona producto</option>
                        {products.map(product => <option key={product.id} value={product.id}>{product.name} — {product.cat} (stock: {product.stock})</option>)}
                      </select>
                    </label>
                    <div className="inventory-purchase__item-fields">
                      <label style={{ color: C.sub, fontSize: 12 }}>
                        Cantidad
                        <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 5 }} type="number" min="1" step="1" value={item.cantidad} onChange={event => updateItem(index, { cantidad: event.target.value })} required />
                      </label>
                      <label style={{ color: C.sub, fontSize: 12 }}>
                      Costo unitario (COP)
                      <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 5 }} type="number" min="1" step="1" value={item.precio_unitario} placeholder="0" onChange={event => updateItem(index, { precio_unitario: event.target.value })} required />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="inventory-purchase__actions">
              {products.length > 0 && <button type="button" className="inventory-purchase__add-line" onClick={() => setItems(current => [...current, newItem(products[0]?.id || "")])}>＋ Añadir otro producto</button>}
              <div className="inventory-purchase__total"><span>Total de compra</span><strong>{COP(total)}</strong></div>
              <button className="expenses-save-button" type="submit" disabled={saving || loading || !products.length}>
                {saving ? "Guardando..." : "Registrar ingreso"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="inventory-purchase__section-label"><span>2</span> Información del gasto</div>
            <div className="inventory-purchase__fields inventory-purchase__fields--expense">
              <label style={{ color: C.sub, fontSize: 12 }}>
                Descripción
                <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 5 }} value={description} maxLength={160} placeholder="Ej. Compra de hielo" onChange={event => setDescription(event.target.value)} required />
              </label>
              <label style={{ color: C.sub, fontSize: 12 }}>
                Monto (COP)
                <input style={{ ...s.inp, display: "block", width: "100%", marginTop: 5 }} type="number" min="1" step="1" value={amount} placeholder="0" onChange={event => setAmount(event.target.value)} required />
              </label>
            </div>
            <button className="expenses-save-button" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar gasto"}
            </button>
          </>
        )}
      </form>
    </section>
  );
}
