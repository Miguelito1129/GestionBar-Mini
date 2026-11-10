import { useState } from "react";
import { C, s, COP } from "../../constants/theme.js";
import { uid } from "../../utils/helpers.js";
import { localFetch, localInsert } from "../../lib/localApi.js";

export default function UploadTransfer({ negocio, onRegistered }) {
  const [amount, setAmount] = useState("");
  const [platform, setPlatform] = useState("nequi");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const register = async () => {
    const monto = Number(amount);
    if (!Number.isFinite(monto) || monto <= 0 || busy) {
      setMessage("Ingresa un monto válido.");
      return;
    }
    setBusy(true);
    const shifts = await localFetch("planillas", `negocio_id=eq.${negocio.id}&estado=eq.abierta&order=created_at.desc&limit=1`);
    const ok = await localInsert("transferencias", {
      id: uid(), negocio_id: negocio.id, planilla_id: shifts?.[0]?.id || null,
      plataforma: platform, monto, verificada: false,
    });
    setMessage(ok ? "✓ Transferencia registrada." : "No fue posible registrar la transferencia.");
    if (ok) {
      setAmount("");
      if (onRegistered) onRegistered();
    }
    setBusy(false);
  };

  return (
    <div style={s.card}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Registrar transferencia</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
        <select style={s.sel} value={platform} onChange={event => setPlatform(event.target.value)}>
          <option value="nequi">Nequi</option><option value="bancolombia">Bancolombia</option>
          <option value="datafono">Datáfono</option><option value="daviplata">Daviplata</option>
        </select>
        <input style={s.inp} type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder={COP(0)} />
        <button style={s.btn("primary")} type="button" disabled={busy} onClick={register}>{busy ? "..." : "Guardar"}</button>
      </div>
      {message && <div style={{ color: message.startsWith("✓") ? C.green : C.red, fontSize: 12, marginTop: 8 }}>{message}</div>}
    </div>
  );
}
