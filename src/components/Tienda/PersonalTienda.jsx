import { useCallback, useEffect, useState } from "react";
import { C, s } from "../../constants/theme.js";
import {
  localCreateStorePerson,
  localFetchStorePersonnel,
  localSetStorePersonActive,
} from "../../lib/localApi.js";
import { SectionTitle } from "../common/index.jsx";

export default function PersonalTienda({ negocio }) {
  const [people, setPeople] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await localFetchStorePersonnel(negocio.id);
      if (!Array.isArray(result)) throw new Error("El servidor devolvió una lista de personal inválida.");
      setPeople(result);
    } catch (loadError) {
      setError(loadError.message || "No fue posible cargar el personal.");
    } finally {
      setLoading(false);
    }
  }, [negocio.id]);

  useEffect(() => { void loadPeople(); }, [loadPeople]);

  const addPerson = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const person = await localCreateStorePerson({
        negocio_id: negocio.id,
        nombre: name.trim(),
        telefono: phone.trim(),
      });
      setPeople(current => [...current, person].sort((first, second) => first.nombre.localeCompare(second.nombre, "es")));
      setName("");
      setPhone("");
      setMessage(`${person.nombre} quedó agregado al personal y ya se puede asignar a citas.`);
    } catch (saveError) {
      setError(saveError.message || "No fue posible agregar a la persona.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async person => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await localSetStorePersonActive(person.id, !person.activo);
      setPeople(current => current.map(item => item.id === updated.id ? updated : item));
      setMessage(updated.activo ? `${updated.nombre} está activo para nuevas citas.` : `${updated.nombre} quedó inactivo.`);
    } catch (saveError) {
      setError(saveError.message || "No fue posible actualizar a la persona.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 12px 36px" }}>
      <SectionTitle>👥 Personal — {negocio.name}</SectionTitle>
      <p style={{ marginTop: -8, marginBottom: 18, color: C.sub, fontSize: 13, lineHeight: 1.5 }}>
        Agrega a las personas que trabajan en el negocio sin crearles un usuario. El personal activo aparecerá como profesional al programar citas.
      </p>

      {(error || message) && (
        <div role={error ? "alert" : "status"} style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: error ? `${C.red}12` : `${C.green}12`, color: error ? C.red : C.green, fontSize: 13 }}>
          {error || message}
        </div>
      )}

      <section style={{ ...s.card, marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Agregar persona</h2>
        <form onSubmit={event => void addPerson(event)} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <label style={{ display: "grid", gap: 6, color: C.sub, fontSize: 12 }}>
            Nombre
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              maxLength={120}
              placeholder="Ej. Camila"
              autoComplete="off"
              required
              style={s.inp}
            />
          </label>
          <label style={{ display: "grid", gap: 6, color: C.sub, fontSize: 12 }}>
            Teléfono <span>(opcional)</span>
            <input
              type="tel"
              value={phone}
              onChange={event => setPhone(event.target.value)}
              maxLength={40}
              placeholder="Número de contacto"
              autoComplete="tel"
              style={s.inp}
            />
          </label>
          <button type="submit" disabled={busy || !name.trim()} style={{ ...s.btn("primary"), gridColumn: "1 / -1", minHeight: 42 }}>
            {busy ? "Guardando..." : "＋ Agregar"}
          </button>
        </form>
      </section>

      <section style={{ ...s.card, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Personas del negocio</h2>
          <span style={{ color: C.sub, fontSize: 12 }}>{people.filter(person => person.activo).length} activas</span>
        </div>
        {loading ? (
          <div style={{ padding: 20, color: C.sub, textAlign: "center" }}>Cargando personal...</div>
        ) : people.length === 0 ? (
          <div style={{ padding: 24, color: C.sub, textAlign: "center" }}>Aún no agregas personas.</div>
        ) : (
          <div>
            {people.map(person => (
              <div key={person.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.border}70` }}>
                <div>
                  <strong style={{ display: "block", color: person.activo ? C.text : C.sub }}>{person.nombre}</strong>
                  <span style={{ color: person.activo ? C.green : C.sub, fontSize: 11 }}>{person.activo ? "Activa para nuevas citas" : "Inactiva"}</span>
                  {person.telefono && <span style={{ display: "block", color: C.sub, fontSize: 12, marginTop: 3 }}>Tel. {person.telefono}</span>}
                </div>
                <button type="button" disabled={busy} onClick={() => void toggleActive(person)} style={{ ...s.btn(person.activo ? "ghost" : "success"), minHeight: 34, fontSize: 11 }}>
                  {person.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
