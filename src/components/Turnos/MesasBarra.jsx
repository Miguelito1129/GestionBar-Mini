import { useEffect, useState } from "react";
import { C, s } from "../../constants/theme.js";
import { localFetchTables, localSetTableCount } from "../../lib/localApi.js";

const sortTables = tables => [...tables].sort((a, b) => {
  const numberA = Number(String(a.nombre).match(/^Mesa\s+(\d+)$/i)?.[1]);
  const numberB = Number(String(b.nombre).match(/^Mesa\s+(\d+)$/i)?.[1]);
  if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) {
    return numberA - numberB;
  }
  return a.nombre.localeCompare(b.nombre, "es");
});

export default function MesasBarra({ negocio }) {
  const [tables, setTables] = useState([]);
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    localFetchTables(negocio.id).then(result => {
      if (!Array.isArray(result)) throw new Error("El servidor devolvió una lista de mesas inválida.");
      if (active) {
        setTables(sortTables(result));
        const numbers = result.map(table => Number(String(table.nombre).match(/^Mesa\s+(\d+)$/i)?.[1] || 0));
        setQuantity(String(Math.max(0, ...numbers)));
      }
    }).catch(loadError => {
      if (active) setError(loadError.message || "No fue posible cargar las mesas.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [negocio.id]);

  const setTableCount = async event => {
    event.preventDefault();
    const count = Number(quantity);
    if (!Number.isSafeInteger(count) || count < 1 || count > 50 || saving) {
      setError("Indica una cantidad entre 1 y 50.");
      return;
    }
    const currentCount = tables.length;
    const currentMaximum = Math.max(0, ...tables.map(table =>
      Number(String(table.nombre).match(/^Mesa\s+(\d+)$/i)?.[1] || 0)
    ));
    const willReduce = count < currentMaximum;
    let confirmedReduction = false;
    if (count !== currentMaximum || currentCount !== count) {
      const removedCount = tables.filter(table =>
        Number(String(table.nombre).match(/^Mesa\s+(\d+)$/i)?.[1] || 0) > count
      ).length;
      const confirmation = willReduce
        ? `Vas a cambiar de ${currentCount} a ${count} mesas. Se retirarán ${removedCount} mesa(s) con número mayor a ${count}. Las comandas históricas conservarán su número. ¿Confirmas?`
        : `Vas a dejar el local con ${count} mesas numeradas. ¿Confirmas el cambio?`;
      if (!window.confirm(confirmation)) return;
      confirmedReduction = willReduce;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await localSetTableCount(negocio.id, count, confirmedReduction);
      if (!Array.isArray(result?.mesas) || result.cantidad !== count || result.total !== count) {
        throw new Error("El servidor devolvió una cantidad de mesas inesperada.");
      }
      setTables(sortTables(result.mesas));
      setMessage(count > currentCount
        ? `Cantidad actualizada: ahora tienes ${count} mesas numeradas de Mesa 1 a Mesa ${count}.`
        : count < currentCount
          ? `Cantidad actualizada: ahora tienes ${count} mesas.`
          : `La cantidad se mantiene en ${count} mesas.`);
    } catch (saveError) {
      setError(saveError.message || "No fue posible actualizar la cantidad de mesas.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1040 }}>
      <header style={{ ...s.card, padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", borderColor: `${C.amber}35` }}>
        <div>
          <div style={{ ...s.label, color: C.amber, marginBottom: 7 }}>Organización del local</div>
          <h2 style={{ margin: 0, fontSize: 23, letterSpacing: "-.4px" }}>Mesas de {negocio.name}</h2>
          <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.5, margin: "7px 0 0" }}>
            Define cuántas mesas tiene el local. Al reducir la cantidad, se retiran las de número más alto con una sola confirmación.
          </p>
        </div>
        <div style={{ minWidth: 92, padding: "11px 16px", textAlign: "center", borderRadius: 14, background: "rgba(255,196,92,.08)", border: `1px solid ${C.amber}35` }}>
          <div style={{ fontSize: 23, lineHeight: 1.1, fontWeight: 850, color: C.amber }}>{loading ? "—" : tables.length}</div>
          <div style={{ fontSize: 10, color: C.sub, marginTop: 5, textTransform: "uppercase", letterSpacing: ".08em" }}>registradas</div>
        </div>
      </header>

      {(error || message) && (
        <div
          role={error ? "alert" : "status"}
          style={{
            padding: "11px 14px",
            borderRadius: 11,
            color: error ? C.red : C.green,
            background: error ? `${C.red}12` : `${C.green}12`,
            border: `1px solid ${error ? C.red : C.green}35`,
            fontSize: 12,
          }}
        >
          {error || message}
        </div>
      )}

      <form onSubmit={setTableCount} style={{ ...s.card, display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap", padding: 18 }}>
        <div style={{ flex: "1 1 220px" }}>
          <label htmlFor="table-quantity" style={{ display: "block", color: C.text2, fontSize: 12, fontWeight: 700, marginBottom: 7 }}>
            Cantidad total de mesas
          </label>
          <input
            id="table-quantity"
            style={{ ...s.inp, maxWidth: 280, height: 42 }}
            type="number"
            min="1"
            max="50"
            step="1"
            value={quantity}
            aria-label="Cantidad total de mesas"
            onChange={event => setQuantity(event.target.value)}
            required
          />
        </div>
        <button type="submit" style={{ ...s.btn("primary"), minHeight: 42, paddingInline: 20 }} disabled={saving || !quantity}>
          {saving ? "Guardando..." : "Guardar cantidad"}
        </button>
        <div style={{ flexBasis: "100%", color: C.muted, fontSize: 11, marginTop: -4 }}>
          Se numeran automáticamente desde Mesa 1. Si una mesa que se retiraría tiene comandas abiertas, el sistema bloquea la reducción. Máximo 50 mesas.
        </div>
      </form>

      <div style={{ ...s.card, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, margin: 0 }}>Tus mesas</h3>
            <p style={{ color: C.sub, fontSize: 11, margin: "5px 0 0" }}>
              {tables.length
                    ? "Cambia la cantidad completa desde el campo superior. Las mesas se numeran automáticamente."
                : "Cuando las agregues, aparecerán aquí para que puedas administrarlas."}
            </p>
          </div>
          {!loading && tables.length > 0 && (
            <span style={{ color: C.sub, fontSize: 11 }}>{tables.length} {tables.length === 1 ? "mesa" : "mesas"}</span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "28px 12px", textAlign: "center", color: C.sub, fontSize: 13 }}>Cargando mesas...</div>
        ) : !tables.length ? (
          <div style={{ padding: "28px 16px", textAlign: "center", border: `1px dashed ${C.border2}`, borderRadius: 14, background: "rgba(255,255,255,.015)" }}>
            <div style={{ width: 46, height: 46, margin: "0 auto 11px", display: "grid", placeItems: "center", borderRadius: 14, color: C.amber, background: "rgba(255,196,92,.09)", fontSize: 23, fontWeight: 800 }}>+</div>
            <strong style={{ display: "block", fontSize: 13 }}>Aún no hay mesas</strong>
            <span style={{ display: "block", color: C.sub, fontSize: 11, marginTop: 5 }}>Indica la cantidad arriba para crear la numeración.</span>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))", gap: 12 }}>
              {tables.map(table => {
                const number = String(table.nombre).match(/^Mesa\s+(\d+)$/i)?.[1];
                return (
                  <article
                    key={table.id}
                    style={{
                      minHeight: 94,
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      padding: "13px 10px 10px",
                      borderRadius: 14,
                      border: `1px solid ${C.border}`,
                      background: "linear-gradient(155deg, rgba(255,196,92,.07), rgba(255,255,255,.015) 65%)",
                      boxShadow: "0 8px 20px rgba(0,0,0,.12)",
                    }}
                  >
                    <span style={{ color: C.muted, fontSize: 9, fontWeight: 750, textTransform: "uppercase", letterSpacing: ".12em" }}>Mesa</span>
                    <strong style={{ color: C.amber, fontSize: 30, lineHeight: 1, letterSpacing: "-1px" }}>{number || table.nombre}</strong>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
