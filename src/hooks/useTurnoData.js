import { useEffect, useState } from "react";
import { localFetch } from "../lib/localApi.js";

export function useTurnoData(negocioId, meseroId, filterByMesero = false, requireMeseroAuthorization = false, enabled = true) {
  const [turno, setTurno] = useState(null);
  const [comandas, setComandas] = useState([]);
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    if (!enabled || !negocioId) return undefined;
    let active = true;
    let poll;
    const waiterFilter = filterByMesero
      ? `&mesero_id=eq.${meseroId || ""}`
      : meseroId
        ? `&mesero_id=eq.${meseroId}`
        : "";
    setTurno(null);
    setComandas([]);
    setProductos([]);

    const refreshTurnoData = async () => {
      const turnos = await localFetch(
        "turnos",
        `negocio_id=eq.${negocioId}&estado=eq.abierto&select=*&order=fecha_apertura.desc&limit=1`,
      );
      if (!active) return;
      if (!turnos?.[0]) {
        setTurno(null);
        setComandas([]);
        setProductos([]);
        poll = window.setTimeout(refreshTurnoData, 1000);
        return;
      }
      const currentTurno = turnos[0];
      setTurno(currentTurno);
      const authorizedWaiters = currentTurno.meseros_ids;
      if (requireMeseroAuthorization && (
        !Array.isArray(authorizedWaiters)
        || !authorizedWaiters.some(id => String(id) === String(meseroId))
      )) {
        setComandas([]);
        setProductos([]);
        poll = window.setTimeout(refreshTurnoData, 1000);
        return;
      }

      const [products, rows] = await Promise.all([
        localFetch("productos", `negocio_id=eq.${negocioId}&select=*&order=sort_order.asc`),
        localFetch("comandas", `turno_id=eq.${currentTurno.id}${waiterFilter}&select=*&order=creado_en.desc`),
      ]);
      if (active) {
        setProductos(products || []);
        setComandas(rows || []);
        poll = window.setTimeout(refreshTurnoData, 1000);
      }
    };

    void refreshTurnoData();

    return () => {
      active = false;
      if (poll) window.clearTimeout(poll);
    };
  }, [negocioId, meseroId, filterByMesero, requireMeseroAuthorization, enabled]);

  return { turno, setTurno, comandas, setComandas, productos, setProductos };
}
