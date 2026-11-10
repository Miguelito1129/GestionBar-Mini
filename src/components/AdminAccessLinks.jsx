import { useEffect, useState } from "react";
import { C, s } from "../constants/theme.js";
import { localFetch } from "../lib/localApi.js";
import { Modal } from "./common/index.jsx";

export default function AdminAccessLinks({ onClose }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadAddresses = async () => {
    setLoading(true);
    setError("");
    const result = await localFetch("network/addresses");
    if (!Array.isArray(result)) {
      setError("No se pudieron obtener las direcciones de red. Comprueba que el equipo servidor esté conectado a la red local.");
    } else {
      setAddresses(result.filter(item => item && typeof item.url === "string"));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAddresses();
  }, []);

  const shareLink = async (label, url) => {
    setError("");
    setMessage("");
    try {
      if (navigator.share) {
        await navigator.share({ title: `GestiónBar · Acceso ${label}`, text: `Abre este enlace para ingresar a GestiónBar como ${label}:`, url });
        setMessage(`Enlace de ${label} compartido.`);
        return;
      }
      if (!navigator.clipboard?.writeText) throw new Error("Este navegador no permite copiar automáticamente. Selecciona y copia el enlace.");
      await navigator.clipboard.writeText(url);
      setMessage(`Enlace de ${label} copiado. Envíalo al personal.`);
    } catch (shareError) {
      if (shareError.name === "AbortError") return;
      setError(shareError.message || "No fue posible compartir el enlace.");
    }
  };

  return (
    <Modal title="Compartir acceso al equipo" onClose={onClose} width="min(560px,96vw)">
      <p style={{ margin: "0 0 14px", color: C.sub, fontSize: 12, lineHeight: 1.6 }}>
        Comparte el enlace con meseros y personal de barra. Deben conectarse a la misma red Wi-Fi que el equipo donde está abierto GestiónBar e iniciar sesión con su propia cuenta.
      </p>
      {loading && <div style={{ color: C.sub, fontSize: 12 }}>Buscando direcciones de esta red…</div>}
      {!loading && !addresses.length && !error && (
        <div style={{ color: C.amber, fontSize: 12 }}>No se encontraron direcciones de red. Conecta el equipo servidor a la Wi-Fi o red local y vuelve a intentar.</div>
      )}
      {addresses.map(({ address, url }) => (
        <div key={url} style={{ display: "grid", gap: 8, padding: 12, marginBottom: 10, border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface }}>
          <div style={{ color: C.sub, fontSize: 11 }}>IP del equipo: <strong style={{ color: C.text }}>{address}</strong></div>
          <a href={url} target="_blank" rel="noreferrer" style={{ color: C.indigo, fontSize: 13, fontWeight: 700, overflowWrap: "anywhere" }}>{url}</a>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" style={s.btn("primary")} onClick={() => shareLink("meseros", url)}>Compartir con meseros</button>
            <button type="button" style={s.btn()} onClick={() => shareLink("barra", url)}>Compartir con barra</button>
          </div>
        </div>
      ))}
      {error && <div role="alert" style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{error}</div>}
      {message && <div role="status" style={{ color: C.green, fontSize: 12, marginTop: 10 }}>{message}</div>}
      {!loading && <button type="button" style={{ ...s.btn(), marginTop: 6 }} onClick={loadAddresses}>Actualizar direcciones</button>}
      <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: `${C.amber}12`, color: C.sub, fontSize: 11, lineHeight: 1.5 }}>
        El enlace es el mismo para ambos roles; después de iniciar sesión, la aplicación abre el espacio que corresponde a la cuenta. El equipo servidor debe permanecer encendido.
      </div>
    </Modal>
  );
}
