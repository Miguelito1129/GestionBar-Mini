import { useEffect, useMemo, useState } from "react";
import { C, s, COP } from "../../constants/theme.js";
import { localCreateStoreSale, localFetchStoreAppointmentPayments, localFetchStoreSales, localFetchOrThrow } from "../../lib/localApi.js";
import { Metric, PaginationTabs, SectionTitle, useListPagination } from "../common/index.jsx";

const todayInBogota = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const timeOf = value => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Hora no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export default function TiendaWorkspace({ negocio, userId, canSell, canManage, onOpenAppointments, onEnableAppointments }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [sales, setSales] = useState([]);
  const [appointmentPayments, setAppointmentPayments] = useState([]);
  const [saleDate, setSaleDate] = useState(todayInBogota);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [appointmentSetupBusy, setAppointmentSetupBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      localFetchOrThrow("productos", `negocio_id=eq.${encodeURIComponent(negocio.id)}&select=*&order=sort_order.asc`),
      localFetchStoreSales(negocio.id, saleDate),
      Number(negocio.citas_habilitadas) === 1
        ? localFetchStoreAppointmentPayments(negocio.id, saleDate, saleDate)
        : Promise.resolve([]),
    ]).then(([catalog, dailySales, dailyAppointmentPayments]) => {
      if (!active) return;
      if (!Array.isArray(catalog) || !Array.isArray(dailySales)
        || dailySales.some(sale => !Array.isArray(sale.items))
        || !Array.isArray(dailyAppointmentPayments)) {
        throw new Error("La respuesta del servidor contiene datos de tienda inválidos.");
      }
      setProducts(catalog);
      setSales(dailySales);
      setAppointmentPayments(dailyAppointmentPayments);
      setError("");
    }).catch(loadError => {
      if (active) setError(loadError.message || "No fue posible cargar la tienda.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [negocio.id, negocio.citas_habilitadas, saleDate]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    return products.filter(product =>
      Number(product.stock || 0) > 0
      && String(product.name || "").toLocaleLowerCase("es").includes(normalizedSearch)
    );
  }, [products, search]);
  const productPage = useListPagination(filteredProducts);
  const dayTransactions = useMemo(() => [
    ...sales.map(sale => ({
      id: sale.id,
      kind: "sale",
      timestamp: sale.creado_en,
      sale,
    })),
    ...appointmentPayments.map(payment => ({
      id: payment.id,
      kind: "appointment-payment",
      timestamp: payment.creado_en,
      payment,
    })),
  ].sort((first, second) => String(second.timestamp).localeCompare(String(first.timestamp))), [sales, appointmentPayments]);
  const salePage = useListPagination(dayTransactions);

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const productSalesTotal = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const appointmentPaymentsTotal = appointmentPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
  const dayTotal = productSalesTotal + appointmentPaymentsTotal;
  const appointmentsEnabled = Number(negocio.citas_habilitadas) === 1;

  const enableAppointments = async () => {
    if (appointmentSetupBusy) return;
    setAppointmentSetupBusy(true);
    setError("");
    try {
      await onEnableAppointments?.();
    } catch (setupError) {
      setError(setupError.message || "No fue posible activar el módulo de citas.");
    } finally {
      setAppointmentSetupBusy(false);
    }
  };

  const addProduct = product => {
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= Number(product.stock || 0)) return current;
        return current.map(item => item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item);
      }
      return [...current, {
        id: product.id,
        name: product.name,
        price: Number(product.price || 0),
        quantity: 1,
      }];
    });
    setMessage("");
  };

  const changeQuantity = (productId, delta) => {
    setCart(current => current
      .map(item => item.id === productId ? { ...item, quantity: item.quantity + delta } : item)
      .filter(item => item.quantity > 0));
  };

  const registerSale = async () => {
    if (!canSell || !userId || !cart.length || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sale = await localCreateStoreSale({
        negocio_id: negocio.id,
        medio_pago: paymentMethod,
        items: cart.map(item => ({ producto_id: item.id, cantidad: item.quantity })),
      });
      setProducts(current => current.map(product => {
        const sold = sale.items.find(item => item.producto_id === product.id);
        return sold ? { ...product, stock: Number(product.stock) - sold.cantidad } : product;
      }));
      if (saleDate === todayInBogota()) setSales(current => [sale, ...current]);
      setCart([]);
      setMessage(`Venta #${sale.consecutivo} registrada correctamente.`);
    } catch (saleError) {
      console.error("No fue posible registrar la venta de tienda:", saleError);
      setError(saleError.message || "No fue posible registrar la venta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 28 }}>
      <SectionTitle>🏪 Ventas de tienda — {negocio.name}</SectionTitle>
      <p style={{ color: C.sub, fontSize: 13, marginTop: -10, marginBottom: 18 }}>
        {canSell
          ? "Registra cada venta y descuenta automáticamente los productos del inventario. No requiere abrir turno."
          : "Consulta las ventas diarias y administra el inventario desde su sección. La caja está habilitada para la cuenta de Barra."}
      </p>
      {canManage && (
        <section className="store-appointments-promo">
          <span aria-hidden="true">◷</span>
          <div>
            <strong>{appointmentsEnabled ? "Agenda de citas activa" : "¿Tu tienda también ofrece servicios?"}</strong>
            <p>{appointmentsEnabled
              ? "Administra citas, precios acordados y abonos en un espacio separado de la venta de productos."
              : "Activa un espacio opcional para agendar clientes y registrar servicios con precio variable y abonos."}</p>
          </div>
          <button type="button" disabled={appointmentSetupBusy} onClick={() => appointmentsEnabled ? onOpenAppointments?.() : void enableAppointments()}>
            {appointmentSetupBusy ? "Activando..." : appointmentsEnabled ? "Abrir agenda" : "Activar citas"}
          </button>
        </section>
      )}
      {error && <div role="alert" style={{ ...s.card, color: C.red, marginBottom: 14 }}>{error}</div>}
      <>
        {canSell && (
          <div className="store-sale-layout">
            <section className="store-products-panel" style={s.card}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 }}>
                <strong style={{ fontSize: 16 }}>Productos disponibles</strong>
                <input
                  style={{ ...s.inp, width: "min(100%, 280px)" }}
                  aria-label="Buscar producto"
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
              </div>
              {loading ? <p style={{ color: C.sub }}>Cargando catálogo...</p> : (
                filteredProducts.length ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 9 }}>
                      {productPage.pageItems.map(product => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addProduct(product)}
                          style={{ ...s.card, padding: 12, textAlign: "left", cursor: "pointer" }}
                        >
                          <strong style={{ display: "block", marginBottom: 6 }}>{product.name}</strong>
                          <span style={{ color: C.green, fontWeight: 750 }}>{COP(product.price)}</span>
                          <span style={{ display: "block", color: C.sub, fontSize: 11, marginTop: 5 }}>
                            Existencias: {product.stock}
                          </span>
                        </button>
                      ))}
                    </div>
                    <PaginationTabs totalItems={filteredProducts.length} page={productPage.page} onPageChange={productPage.setPage} />
                  </>
                ) : <p style={{ color: C.sub }}>No hay productos disponibles con existencias.</p>
              )}
            </section>

            <section className="store-current-sale">
              <div className="store-current-sale__heading">
                <div className="store-current-sale__title">
                  <span aria-hidden="true">🛒</span>
                  <div>
                    <h2>Venta actual</h2>
                    <p>{cart.length ? `${cart.length} ${cart.length === 1 ? "producto" : "productos"} seleccionados` : "Agrega productos a la venta"}</p>
                  </div>
                </div>
                {!!cart.length && <button className="store-current-sale__clear" type="button" disabled={busy} onClick={() => setCart([])}>Vaciar</button>}
              </div>
              {!cart.length ? (
                <div className="store-current-sale__empty">
                  <span aria-hidden="true">＋</span>
                  <strong>Tu venta está vacía</strong>
                  <p>Selecciona un producto del catálogo para comenzar.</p>
                </div>
              ) : (
                <div className="store-current-sale__items" aria-label="Productos seleccionados">
                  {cart.map(item => {
                    const stock = Number(products.find(product => product.id === item.id)?.stock || 0);
                    return (
                      <article className="store-current-sale__item" key={item.id}>
                        <div className="store-current-sale__item-info">
                          <strong title={item.name}>{item.name}</strong>
                          <span>{COP(item.price)} <small>c/u · stock {stock}</small></span>
                          <div className="store-current-sale__quantity" aria-label={`Cantidad de ${item.name}`}>
                            <button type="button" aria-label={`Quitar uno de ${item.name}`} disabled={busy} onClick={() => changeQuantity(item.id, -1)}>−</button>
                            <b aria-live="polite">{item.quantity}</b>
                            <button type="button" aria-label={`Agregar uno de ${item.name}`} disabled={busy || item.quantity >= stock} onClick={() => changeQuantity(item.id, 1)}>+</button>
                          </div>
                        </div>
                        <strong className="store-current-sale__line-total">{COP(item.price * item.quantity)}</strong>
                      </article>
                    );
                  })}
                </div>
              )}
              <div className="store-current-sale__summary">
                <label>
                  <span>Medio de pago</span>
                  <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} disabled={busy}>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </label>
                <div className="store-current-sale__total">
                  <span>Total de la venta <small>{cartQuantity} {cartQuantity === 1 ? "unidad" : "unidades"}</small></span>
                  <strong>{COP(cartTotal)}</strong>
                </div>
              </div>
              <button className="store-current-sale__submit" type="button" disabled={!cart.length || busy || loading} onClick={registerSale}>
                {busy ? "Registrando..." : "Registrar venta"}
              </button>
              {message && <div className="store-current-sale__message" role="status">✓ {message}</div>}
            </section>
          </div>
        )}

          <section style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <h2 style={{ margin: 0 }}>Ventas del día</h2>
                <p style={{ color: C.sub, fontSize: 12, margin: "4px 0 0" }}>Historial separado por fecha; hora local de Colombia.</p>
              </div>
              <label style={{ color: C.sub, fontSize: 12 }}>
                Consultar fecha
                <input style={{ ...s.inp, display: "block", marginTop: 5 }} type="date" value={saleDate} max={todayInBogota()} onChange={event => setSaleDate(event.target.value)} />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
              <Metric label="Ventas de productos" value={sales.length} color={C.amber} icon="🧾" />
              {appointmentsEnabled && <Metric label="Abonos de citas" value={appointmentPayments.length} color={C.indigo} icon="🗓️" />}
              <Metric label="Ingresos del día" value={COP(dayTotal)} color={C.green} icon="💰" />
            </div>
            <div style={s.card}>
              {!dayTransactions.length ? <p style={{ color: C.sub, textAlign: "center" }}>No hay ventas ni abonos registrados para esta fecha.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                    <thead><tr>
                      <th style={s.th}>Tipo</th><th style={s.th}>Hora</th><th style={s.th}>Detalle</th>
                      <th style={s.th}>Pago</th><th style={{ ...s.th, textAlign: "right" }}>Total</th>
                    </tr></thead>
                    <tbody>{salePage.pageItems.map((transaction, index) => (
                      <tr key={`${transaction.kind}-${transaction.id}`}>
                        {transaction.kind === "sale" ? (
                          <>
                            <td style={s.td(index)}>Venta #{transaction.sale.consecutivo}</td>
                            <td style={s.td(index)}>{timeOf(transaction.timestamp)}</td>
                            <td style={s.td(index)}>{transaction.sale.items.map(item => `${item.cantidad} × ${item.producto_nombre}`).join(", ")}</td>
                            <td style={s.td(index)}>{transaction.sale.medio_pago}</td>
                            <td style={{ ...s.td(index), textAlign: "right", color: C.green, fontWeight: 700 }}>{COP(transaction.sale.total)}</td>
                          </>
                        ) : (
                          <>
                            <td style={s.td(index)}>Abono de cita</td>
                            <td style={s.td(index)}>{timeOf(transaction.timestamp)}</td>
                            <td style={s.td(index)}>{transaction.payment.cliente_nombre} · {transaction.payment.servicio}</td>
                            <td style={s.td(index)}>{transaction.payment.medio_pago}</td>
                            <td style={{ ...s.td(index), textAlign: "right", color: C.indigo, fontWeight: 700 }}>{COP(transaction.payment.monto)}</td>
                          </>
                        )}
                      </tr>
                    ))}</tbody>
                  </table>
                  <PaginationTabs totalItems={dayTransactions.length} page={salePage.page} onPageChange={salePage.setPage} />
                </div>
              )}
            </div>
          </section>
      </>
    </div>
  );
}
