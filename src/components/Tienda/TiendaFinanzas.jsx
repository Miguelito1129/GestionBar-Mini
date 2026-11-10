import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { C, s, COP } from "../../constants/theme.js";
import { localFetchOrThrow, localFetchStoreAppointmentPayments, localFetchStoreSalesRange } from "../../lib/localApi.js";
import { Metric, PaginationTabs, SectionTitle, useListPagination } from "../common/index.jsx";

const CHART_COLORS = ["#34d399", "#818cf8", "#fb7185", "#fbbf24", "#38bdf8", "#c084fc", "#fb923c", "#2dd4bf"];
const chartTooltip = {
  contentStyle: { background: "#1a1a2e", border: "1px solid #2a2a4a", borderRadius: 8, fontSize: 11 },
  labelStyle: { color: "#e2e8f0" },
  itemStyle: { color: "#e2e8f0" },
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const weekStart = () => {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const STORE_CLOSURES_KEY = "gesbar_cierres_tienda_v1";

function savedClosures() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_CLOSURES_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) {
    console.error("No fue posible leer los cierres de tiendas guardados:", error);
    return {};
  }
}

export default function TiendaFinanzas({ negocio, mode }) {
  const [from, setFrom] = useState(weekStart);
  const [to, setTo] = useState(today);
  const [sales, setSales] = useState([]);
  const [appointmentPayments, setAppointmentPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [closures, setClosures] = useState(() => savedClosures()[negocio.id] || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const isClosure = mode === "cierres";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      localFetchStoreSalesRange(negocio.id, from, to),
      Number(negocio.citas_habilitadas) === 1
        ? localFetchStoreAppointmentPayments(negocio.id, from, to)
        : Promise.resolve([]),
      localFetchOrThrow(
        "gastos",
        `negocio_id=eq.${encodeURIComponent(negocio.id)}&fecha=gte.${from}&fecha=lte.${to}&select=*&order=fecha.desc`,
      ),
      !isClosure
        ? localFetchOrThrow("productos", `negocio_id=eq.${encodeURIComponent(negocio.id)}&select=id,name,stock,cat`)
        : Promise.resolve([]),
    ]).then(([rangeSales, rangeAppointmentPayments, rangeExpenses, catalog]) => {
      if (!active) return;
      if (!Array.isArray(rangeSales) || !Array.isArray(rangeAppointmentPayments)
        || !Array.isArray(rangeExpenses) || !Array.isArray(catalog)) {
        throw new Error("La respuesta del servidor contiene datos financieros inválidos.");
      }
      setSales(rangeSales);
      setAppointmentPayments(rangeAppointmentPayments);
      setExpenses(rangeExpenses);
      setProducts(catalog);
    }).catch(loadError => {
      if (active) setError(loadError.message || "No fue posible cargar la información financiera.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [negocio.id, negocio.citas_habilitadas, from, to, isClosure]);

  useEffect(() => {
    setClosures(savedClosures()[negocio.id] || []);
    setMessage("");
  }, [negocio.id]);

  const totalSales = useMemo(() => sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0), [sales]);
  const totalAppointmentPayments = useMemo(
    () => appointmentPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0),
    [appointmentPayments],
  );
  const totalIncome = totalSales + totalAppointmentPayments;
  const totalExpenses = useMemo(() => expenses.reduce((sum, expense) => sum + Number(expense.monto || 0), 0), [expenses]);
  const balance = totalIncome - totalExpenses;
  const salesByDate = useMemo(() => {
    const grouped = new Map();
    for (const sale of sales) {
      const day = grouped.get(sale.fecha) || { date: sale.fecha, sales: 0, appointments: 0, expenses: 0 };
      day.sales += Number(sale.total || 0);
      grouped.set(sale.fecha, day);
    }
    for (const payment of appointmentPayments) {
      const day = grouped.get(payment.fecha) || { date: payment.fecha, sales: 0, appointments: 0, expenses: 0 };
      day.appointments += Number(payment.monto || 0);
      grouped.set(payment.fecha, day);
    }
    for (const expense of expenses) {
      const day = grouped.get(expense.fecha) || { date: expense.fecha, sales: 0, appointments: 0, expenses: 0 };
      day.expenses += Number(expense.monto || 0);
      grouped.set(expense.fecha, day);
    }
    return [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, appointmentPayments, expenses]);
  const chartSalesExpenses = useMemo(() => {
    const rangeDays = Math.max(1, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1);
    const interval = rangeDays > 90 ? "month" : rangeDays > 31 ? "week" : "day";
    const bucketKey = value => {
      if (interval === "month") return value.slice(0, 7);
      if (interval === "day") return value;
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    const buckets = new Map();
    const ensureBucket = value => {
      const key = bucketKey(value);
      if (!buckets.has(key)) buckets.set(key, { key, label: key, sales: 0, appointments: 0, expenses: 0 });
      return buckets.get(key);
    };
    for (const sale of sales) ensureBucket(sale.fecha).sales += Number(sale.total || 0);
    for (const payment of appointmentPayments) ensureBucket(payment.fecha).appointments += Number(payment.monto || 0);
    for (const expense of expenses) ensureBucket(expense.fecha).expenses += Number(expense.monto || 0);
    return [...buckets.values()].sort((first, second) => first.key.localeCompare(second.key)).map(bucket => ({
      ...bucket,
      label: interval === "month"
        ? new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit" }).format(new Date(`${bucket.key}-02T12:00:00`))
        : new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(`${bucket.key}T12:00:00`)),
    }));
  }, [sales, appointmentPayments, expenses, from, to]);
  const productStats = useMemo(() => {
    const totals = new Map();
    for (const sale of sales) {
      for (const item of sale.items || []) {
        const id = String(item.producto_id);
        const current = totals.get(id) || {
          id,
          name: item.producto_nombre || "Producto",
          units: 0,
          revenue: 0,
        };
        current.units += Number(item.cantidad || 0);
        current.revenue += Number(item.total || 0);
        totals.set(id, current);
      }
    }
    const catalogById = new Map(products.map(product => [String(product.id), product]));
    return [...new Set([...products.map(product => String(product.id)), ...totals.keys()])].map(id => {
      const product = catalogById.get(id);
      return totals.get(id) || {
        id,
        name: product?.name || "Producto",
        units: 0,
        revenue: 0,
      };
    }).map(stat => ({
      ...stat,
      name: catalogById.get(stat.id)?.name || stat.name,
    }));
  }, [sales, products]);
  const bestSellingProducts = useMemo(
    () => productStats.filter(product => product.units > 0)
      .sort((first, second) => second.units - first.units || second.revenue - first.revenue)
      .slice(0, 8),
    [productStats],
  );
  const slowMovingProducts = useMemo(
    () => [...productStats].sort((first, second) => first.units - second.units || first.name.localeCompare(second.name, "es")).slice(0, 8),
    [productStats],
  );
  const expenseCategories = useMemo(() => {
    const totals = new Map();
    for (const expense of expenses) {
      const category = String(expense.cat || "Otros");
      totals.set(category, (totals.get(category) || 0) + Number(expense.monto || 0));
    }
    return [...totals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((first, second) => second.total - first.total)
      .slice(0, 8);
  }, [expenses]);
  const unitsSold = productStats.reduce((sum, product) => sum + product.units, 0);
  const dailyPage = useListPagination(salesByDate);
  const closurePage = useListPagination(closures);

  const saveClosure = () => {
    const closure = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      from,
      to,
      savedAt: new Date().toISOString(),
      salesCount: sales.length,
      salesTotal: totalSales,
      appointmentPaymentsCount: appointmentPayments.length,
      appointmentPaymentsTotal: totalAppointmentPayments,
      incomeTotal: totalIncome,
      expensesTotal: totalExpenses,
      balance,
    };
    const allClosures = savedClosures();
    const updated = [closure, ...(allClosures[negocio.id] || [])];
    try {
      localStorage.setItem(STORE_CLOSURES_KEY, JSON.stringify({ ...allClosures, [negocio.id]: updated }));
      setClosures(updated);
      setMessage("Cierre de tienda guardado.");
      setError("");
    } catch (saveError) {
      console.error("No fue posible guardar el cierre de tienda:", saveError);
      setError("No fue posible guardar el cierre en este dispositivo.");
      setMessage("");
    }
  };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 28 }}>
      <SectionTitle>{isClosure ? `📅 Cierres — ${negocio.name}` : `📊 Reportes — ${negocio.name}`}</SectionTitle>
      <p style={{ color: C.sub, fontSize: 13, marginTop: -10, marginBottom: 18 }}>
        Consulta ventas de productos, abonos de servicios y gastos. Cada abono cuenta como ingreso en su fecha de recepción, sin marcar el servicio como pagado por completo.
      </p>
      <section style={{ ...s.card, marginBottom: 16, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ color: C.sub, fontSize: 12 }}>
          Desde
          <input style={{ ...s.inp, display: "block", marginTop: 5, width: 180 }} type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} />
        </label>
        <label style={{ color: C.sub, fontSize: 12 }}>
          Hasta
          <input style={{ ...s.inp, display: "block", marginTop: 5, width: 180 }} type="date" value={to} min={from} max={today()} onChange={event => setTo(event.target.value)} />
        </label>
        {isClosure && <button type="button" style={s.btn("primary")} disabled={loading || !sales.length && !appointmentPayments.length && !expenses.length} onClick={saveClosure}>Guardar cierre</button>}
      </section>
      {error && <div role="alert" style={{ ...s.card, color: C.red, marginBottom: 14 }}>{error}</div>}
      {message && <div role="status" style={{ ...s.card, color: C.green, marginBottom: 14 }}>{message}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
        <Metric label="Ventas de productos" value={COP(totalSales)} color={C.green} icon="🛍️" />
        {!isClosure && <Metric label="Unidades vendidas" value={unitsSold.toLocaleString("es-CO")} color={C.indigo} icon="📦" />}
        <Metric label="Abonos de servicios" value={COP(totalAppointmentPayments)} color={C.amber} icon="🗓️" />
        <Metric label="Ingresos totales" value={COP(totalIncome)} color={C.indigo} icon="💵" />
        <Metric label="Gastos" value={COP(totalExpenses)} color={C.red} icon="💸" />
        <Metric label="Saldo del período" value={COP(balance)} color={balance >= 0 ? C.green : C.red} icon="📊" />
      </div>
      {!isClosure && !loading && (
        <>
          <section style={{ ...s.card, marginBottom: 14 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Ventas y gastos en el período</h2>
            <p style={{ margin: "0 0 14px", color: C.sub, fontSize: 12 }}>
              {chartSalesExpenses.length > 0
                ? `Evolución ${Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 90 * 86400000 ? "mensual" : Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 31 * 86400000 ? "semanal" : "diaria"}`
                : "No hay movimientos para graficar en este período."}
            </p>
            {chartSalesExpenses.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartSalesExpenses} margin={{ top: 8, right: 14, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.sub }} />
                  <YAxis tick={{ fontSize: 10, fill: C.sub }} tickFormatter={value => `$${(value / 1000).toFixed(0)}k`} />
                  <Tooltip {...chartTooltip} formatter={value => COP(value)} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.sub }} />
                  <Bar dataKey="sales" name="Ventas productos" fill="#34d399" radius={[4, 4, 0, 0]} />
                  {Number(negocio.citas_habilitadas) === 1 && (
                    <Bar dataKey="appointments" name="Abonos citas" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  )}
                  <Bar dataKey="expenses" name="Gastos" fill="#fb7185" radius={[4, 4, 0, 0]} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 390px), 1fr))", gap: 14, marginBottom: 14 }}>
            <section style={s.card}>
              <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Productos más vendidos</h2>
              <p style={{ margin: "0 0 12px", color: C.sub, fontSize: 12 }}>Unidades vendidas dentro de las fechas seleccionadas.</p>
              {!bestSellingProducts.length ? <p style={{ color: C.sub, textAlign: "center" }}>No se vendieron productos en este período.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(210, bestSellingProducts.length * 34)}>
                  <BarChart data={bestSellingProducts} layout="vertical" margin={{ top: 4, right: 18, left: 6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: C.sub }} />
                    <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 10, fill: C.text }} />
                    <Tooltip {...chartTooltip} formatter={(value, name, item) => [
                      `${Number(value).toLocaleString("es-CO")} unidades · ${COP(item.payload.revenue)}`,
                      "Vendido",
                    ]} />
                    <Bar dataKey="units" name="Unidades" fill="#34d399" radius={[0, 5, 5, 0]}>
                      {bestSellingProducts.map((product, index) => <Cell key={product.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>

            <section style={s.card}>
              <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Gastos por categoría</h2>
              <p style={{ margin: "0 0 12px", color: C.sub, fontSize: 12 }}>Categorías con mayor monto en el período.</p>
              {!expenseCategories.length ? <p style={{ color: C.sub, textAlign: "center" }}>No hay gastos registrados en este período.</p> : (
                <ResponsiveContainer width="100%" height={Math.max(210, expenseCategories.length * 34)}>
                  <BarChart data={expenseCategories} layout="vertical" margin={{ top: 4, right: 18, left: 6, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: C.sub }} tickFormatter={value => `$${(value / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 10, fill: C.text }} />
                    <Tooltip {...chartTooltip} formatter={value => COP(value)} />
                    <Bar dataKey="total" name="Gastos" radius={[0, 5, 5, 0]}>
                      {expenseCategories.map((category, index) => <Cell key={category.name} fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </section>
          </div>

          <section style={{ ...s.card, marginBottom: 14 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Productos con poco o ningún movimiento</h2>
            <p style={{ margin: "0 0 12px", color: C.sub, fontSize: 12 }}>
              Productos con menos unidades vendidas durante las fechas seleccionadas, incluyendo los que no tuvieron ventas.
            </p>
            {!slowMovingProducts.length ? <p style={{ color: C.sub, textAlign: "center" }}>No hay productos en el catálogo para comparar.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
                  <thead><tr>
                    <th style={s.th}>Producto</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Unidades vendidas</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Ingresos por producto</th>
                    <th style={{ ...s.th, textAlign: "right" }}>Existencias</th>
                    <th style={s.th}>Movimiento</th>
                  </tr></thead>
                  <tbody>{slowMovingProducts.map((product, index) => (
                    <tr key={product.id}>
                      <td style={s.td(index)}>{product.name}</td>
                      <td style={{ ...s.td(index), textAlign: "right" }}>{product.units.toLocaleString("es-CO")}</td>
                      <td style={{ ...s.td(index), textAlign: "right" }}>{COP(product.revenue)}</td>
                      <td style={{ ...s.td(index), textAlign: "right" }}>{Number(products.find(item => String(item.id) === product.id)?.stock || 0).toLocaleString("es-CO")}</td>
                      <td style={{ ...s.td(index), color: product.units === 0 ? C.red : C.amber, fontWeight: 700 }}>
                        {product.units === 0 ? "Sin ventas" : "Poco movimiento"}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      {loading ? <div style={s.card}>Cargando datos del período...</div> : (
        <section style={{ ...s.card, marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{isClosure ? "Resumen del cierre" : "Ingresos y gastos por día"}</h2>
          {!salesByDate.length ? <p style={{ color: C.sub, textAlign: "center" }}>No hay ventas, abonos ni gastos en este período.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead><tr>
                  <th style={s.th}>Fecha</th><th style={{ ...s.th, textAlign: "right" }}>Productos</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Abonos</th><th style={{ ...s.th, textAlign: "right" }}>Gastos</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Saldo</th>
                </tr></thead>
                <tbody>{dailyPage.pageItems.map((day, index) => {
                  return (
                    <tr key={day.date}>
                      <td style={s.td(index)}>{day.date}</td>
                      <td style={{ ...s.td(index), textAlign: "right", color: C.green }}>{COP(day.sales)}</td>
                      <td style={{ ...s.td(index), textAlign: "right", color: C.amber }}>{COP(day.appointments)}</td>
                      <td style={{ ...s.td(index), textAlign: "right", color: C.red }}>{COP(day.expenses)}</td>
                      <td style={{ ...s.td(index), textAlign: "right", fontWeight: 700 }}>{COP(day.sales + day.appointments - day.expenses)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <PaginationTabs totalItems={salesByDate.length} page={dailyPage.page} onPageChange={dailyPage.setPage} />
            </div>
          )}
        </section>
      )}
      {isClosure && (
        <section style={s.card}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Cierres guardados en este dispositivo</h2>
          {!closures.length ? <p style={{ color: C.sub }}>Todavía no hay cierres guardados.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 440 }}>
                <thead><tr>
                  <th style={s.th}>Período</th><th style={s.th}>Guardado</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Ingresos</th><th style={{ ...s.th, textAlign: "right" }}>Gastos</th>
                  <th style={{ ...s.th, textAlign: "right" }}>Saldo</th>
                </tr></thead>
                <tbody>{closurePage.pageItems.map((closure, index) => (
                  <tr key={closure.id}>
                    <td style={s.td(index)}>{closure.from} — {closure.to}</td>
                    <td style={s.td(index)}>{new Date(closure.savedAt).toLocaleDateString("es-CO")}</td>
                    <td style={{ ...s.td(index), textAlign: "right" }}>{COP(closure.incomeTotal ?? (Number(closure.salesTotal || 0) + Number(closure.appointmentPaymentsTotal || 0)))}</td>
                    <td style={{ ...s.td(index), textAlign: "right" }}>{COP(closure.expensesTotal)}</td>
                    <td style={{ ...s.td(index), textAlign: "right", fontWeight: 700 }}>{COP(closure.balance)}</td>
                  </tr>
                ))}</tbody>
              </table>
              <PaginationTabs totalItems={closures.length} page={closurePage.page} onPageChange={closurePage.setPage} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
