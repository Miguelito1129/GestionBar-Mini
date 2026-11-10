// Cliente HTTP de la API local. La base de datos nunca se expone al navegador.
export const LOCAL_API_URL = import.meta.env.VITE_LOCAL_API_URL || '/api';
const headers = () => {
  let token = '';
  try {
    token = JSON.parse(localStorage.getItem('gesbar_sess_v2') || 'null')?.token || '';
  } catch {}
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export async function localLogin(email, password) {
  const response = await fetch(`${LOCAL_API_URL}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `No fue posible iniciar sesión (${response.status}).`);
  return result;
}

export async function localLogout() {
  const response = await fetch(`${LOCAL_API_URL}/auth/logout`, {
    method: 'POST',
    headers: headers(),
  });
  if (!response.ok) throw new Error(`No fue posible cerrar la sesión (${response.status}).`);
}

async function userRequest(path, method, data) {
  const response = await fetch(`${LOCAL_API_URL}${path}`, {
    method,
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `No fue posible guardar el usuario (${response.status}).`);
  return result;
}

export const localCreateUser = user => userRequest('/users', 'POST', user);
export const localUpdateUser = (id, changes) =>
  userRequest(`/users/${encodeURIComponent(id)}`, 'PATCH', changes);

export async function localFetch(table, filter = '') {
  try {
    const r = await fetch(`${LOCAL_API_URL}/${table}?${filter}`, { headers: headers() });
    if (!r.ok) throw new Error(`GET ${table} failed: ${r.status}`);
    return await r.json();
  } catch (error) { console.error(error); return null; }
}

export async function localFetchOrThrow(table, filter = '') {
  const response = await fetch(`${LOCAL_API_URL}/${table}?${filter}`, { headers: headers() });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `GET ${table} failed: ${response.status}`);
  }
  return result;
}

export async function localQuickSale(data) {
  const response = await fetch(`${LOCAL_API_URL}/orders/quick-sale`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible registrar la venta (${response.status}).`);
  }
  return result;
}

export async function localCreateOrder(data) {
  const response = await fetch(`${LOCAL_API_URL}/orders`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible guardar el pedido (${response.status}).`);
  }
  return result;
}

export async function localFetchTableAccounts(turnoId) {
  const params = new URLSearchParams({ turno_id: turnoId });
  const response = await fetch(`${LOCAL_API_URL}/table-accounts?${params}`, { headers: headers() });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar las cuentas abiertas (${response.status}).`);
  }
  return result;
}

export async function localFetchTableAccountOrders(accountId) {
  const response = await fetch(
    `${LOCAL_API_URL}/table-accounts/${encodeURIComponent(accountId)}/orders`,
    { headers: headers() },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar los pedidos de la cuenta (${response.status}).`);
  }
  return result;
}

export async function localCloseTableAccount(accountId, medioPago) {
  const response = await fetch(`${LOCAL_API_URL}/table-accounts/${encodeURIComponent(accountId)}/close`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ medio_pago: medioPago }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cerrar la cuenta (${response.status}).`);
  }
  return result;
}

export async function localFetchStoreSales(businessId, date) {
  const params = new URLSearchParams({ negocio_id: businessId, fecha: date });
  const response = await fetch(`${LOCAL_API_URL}/store/sales?${params}`, { headers: headers() });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar las ventas (${response.status}).`);
  }
  return result;
}

export async function localFetchStoreSalesRange(businessId, from, to) {
  const params = new URLSearchParams({ negocio_id: businessId, desde: from, hasta: to });
  const response = await fetch(`${LOCAL_API_URL}/store/sales/range?${params}`, { headers: headers() });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar las ventas del período (${response.status}).`);
  }
  return result;
}

export async function localConfigureStoreAppointments(businessId, enabled) {
  const response = await fetch(`${LOCAL_API_URL}/store/appointments/settings`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ negocio_id: businessId, habilitadas: enabled }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible configurar las citas (${response.status}).`);
  }
  return result;
}

export async function localFetchStoreAppointments(businessId, from = '', to = '') {
  const params = new URLSearchParams({ negocio_id: businessId });
  if (from) params.set('desde', from);
  if (to) params.set('hasta', to);
  const response = await fetch(`${LOCAL_API_URL}/store/appointments?${params}`, { headers: headers() });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar las citas (${response.status}).`);
  }
  return result;
}

export async function localFetchStorePersonnel(businessId) {
  const params = new URLSearchParams({ negocio_id: businessId });
  const response = await fetch(`${LOCAL_API_URL}/store/personnel?${params}`, { headers: headers() });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar el personal (${response.status}).`);
  }
  return result;
}

export async function localCreateStorePerson(data) {
  const response = await fetch(`${LOCAL_API_URL}/store/personnel`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible agregar a la persona (${response.status}).`);
  }
  return result;
}

export async function localSetStorePersonActive(personId, activo) {
  const response = await fetch(`${LOCAL_API_URL}/store/personnel/${encodeURIComponent(personId)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ activo }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible actualizar a la persona (${response.status}).`);
  }
  return result;
}

export async function localFetchStoreAppointmentPayments(businessId, from, to) {
  const params = new URLSearchParams({ negocio_id: businessId, desde: from, hasta: to });
  const response = await fetch(`${LOCAL_API_URL}/store/appointment-payments/range?${params}`, { headers: headers() });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar los abonos (${response.status}).`);
  }
  return result;
}

export async function localCreateStoreAppointment(data) {
  const response = await fetch(`${LOCAL_API_URL}/store/appointments`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible guardar la cita (${response.status}).`);
  }
  return result;
}

export async function localRegisterStoreAppointmentPayment(appointmentId, data) {
  const response = await fetch(`${LOCAL_API_URL}/store/appointments/${encodeURIComponent(appointmentId)}/payments`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible registrar el abono (${response.status}).`);
  }
  return result;
}

export async function localUpdateStoreAppointment(appointmentId, status) {
  const response = await fetch(`${LOCAL_API_URL}/store/appointments/${encodeURIComponent(appointmentId)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ estado: status }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible actualizar la cita (${response.status}).`);
  }
  return result;
}

export async function localUpdateStoreInventory(businessId, products) {
  const response = await fetch(`${LOCAL_API_URL}/store/${encodeURIComponent(businessId)}/inventory`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ products }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible guardar el inventario (${response.status}).`);
  }
  return result;
}

export async function localCreateStoreSale(data) {
  const response = await fetch(`${LOCAL_API_URL}/store/sales`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible registrar la venta (${response.status}).`);
  }
  return result;
}

export async function localCreateInventoryPurchase(data) {
  const response = await fetch(`${LOCAL_API_URL}/inventory/purchases`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('El servidor abierto no tiene la ruta nueva de inventario. Cierra el ejecutable anterior y genera uno actualizado con npm run build:portable.');
    }
    throw new Error(result?.error || `No fue posible registrar el ingreso de inventario (${response.status}).`);
  }
  return result;
}

export async function localCreateInventoryProduct(data) {
  const response = await fetch(`${LOCAL_API_URL}/inventory/products`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('El servidor abierto no tiene la ruta nueva de inventario. Cierra el ejecutable anterior y genera uno actualizado con npm run build:portable.');
    }
    throw new Error(result?.error || `No fue posible crear el producto (${response.status}).`);
  }
  return result;
}

export async function localFetchTables(businessId) {
  const response = await fetch(`${LOCAL_API_URL}/businesses/${encodeURIComponent(businessId)}/tables`, {
    headers: headers(),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible cargar las mesas (${response.status}).`);
  }
  return result;
}

export async function localSetTableCount(businessId, cantidad, confirmarReduccion = false) {
  const response = await fetch(`${LOCAL_API_URL}/businesses/${encodeURIComponent(businessId)}/tables`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ cantidad, confirmar_reduccion: confirmarReduccion }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `No fue posible actualizar la cantidad de mesas (${response.status}).`);
  }
  return result;
}

export async function createMasterAccount(name, password) {
  const response = await fetch(`${LOCAL_API_URL}/setup/master`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, password }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || `No fue posible configurar el administrador maestro (${response.status}).`);
  return result;
}

export async function localInsertDetailed(table, data) {
  try {
    const r = await fetch(`${LOCAL_API_URL}/${table}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const details = await r.json().catch(() => null);
      throw new Error(details?.error || `POST ${table} failed: ${r.status}`);
    }
    return { ok: true, error: '' };
  } catch (error) {
    console.error(error);
    return { ok: false, error: error.message || `No fue posible guardar en ${table}.` };
  }
}

export async function localInsert(table, data) {
  const result = await localInsertDetailed(table, data);
  return result.ok;
}

export async function localUpsert(table, data) {
  try {
    const r = await fetch(`${LOCAL_API_URL}/${table}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const details = await r.json().catch(() => null);
      throw new Error(details?.error || `UPSERT ${table} failed: ${r.status}`);
    }
    return true;
  } catch (error) { console.error(error); return false; }
}

export async function localUpdate(table, match, data) {
  try {
    const params = Object.entries(match).map(([k,v]) => `${k}=eq.${v}`).join('&');
    const r = await fetch(`${LOCAL_API_URL}/${table}?${params}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`PATCH ${table} failed: ${r.status}`);
    return true;
  } catch (error) { console.error(error); return false; }
}

export async function localDelete(table, match) {
  try {
    const params = Object.entries(match).map(([k,v]) => `${k}=eq.${v}`).join('&');
    const r = await fetch(`${LOCAL_API_URL}/${table}?${params}`, {
      method: 'DELETE',
      headers: headers(),
    });
    if (!r.ok) throw new Error(`DELETE ${table} failed: ${r.status}`);
    return true;
  } catch (error) { console.error(error); return false; }
}

export async function localDeleteNegocio(negocioId) {
  const response = await fetch(`${LOCAL_API_URL}/negocios/${encodeURIComponent(negocioId)}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error || `DELETE negocio failed: ${response.status}`);
  }
  return true;
}

export async function localPrintInvoice(comandaId, userId) {
  const response = await fetch(`${LOCAL_API_URL}/print/invoice`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ comanda_id: comandaId, user_id: userId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (result?.error) throw new Error(result.error);
    if (response.status === 404) {
      throw new Error("El servidor activo no tiene habilitada la impresión. Reinicia el backend desde la carpeta de esta versión.");
    }
    if (response.status === 503) {
      throw new Error("Impresora sin conexión o puerto Bluetooth no disponible. Revisa Printer001 y vuelve a intentarlo.");
    }
    throw new Error(`No fue posible imprimir el comprobante (HTTP ${response.status}).`);
  }
  return result;
}

export async function localPrintOrder(comandaId, userId) {
  const response = await fetch(`${LOCAL_API_URL}/print/order`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ comanda_id: comandaId, user_id: userId }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (result?.error) throw new Error(result.error);
    if (response.status === 404) {
      throw new Error("El servidor activo no tiene habilitada la impresión de pedidos. Reinicia el backend desde la carpeta de esta versión.");
    }
    if (response.status === 503) {
      throw new Error("Impresora sin conexión o puerto Bluetooth no disponible. Revisa Printer001 y vuelve a intentarlo.");
    }
    throw new Error(`No fue posible imprimir el pedido (HTTP ${response.status}).`);
  }
  return result;
}

// ── Helpers de dominio ─────────────────────────────────────────────────────────
export const localDeleteProductos = negocioId => localDelete('productos', { negocio_id: negocioId });
export const localDeleteStaff     = negocioId => localDelete('staff',     { negocio_id: negocioId });

// Detecta fechas con día/mes invertidos (yyyy-DD-MM en vez de yyyy-MM-DD).
// Ocurre cuando una versión anterior del código usaba toLocaleDateString y se
// convirtió incorrectamente. Si la fecha es futura e intercambiar mm↔dd da una
// fecha pasada válida, la corrige en Supabase automáticamente (fire-and-forget).
const corregirFechaSwap = (fecha, planillaId) => {
  if (!fecha || !fecha.includes('-')) return fecha;
  const hoy = new Date(); hoy.setHours(23, 59, 59, 999);
  if (new Date(fecha) <= hoy) return fecha; // fecha válida, no tocar
  const [yyyy, mm, dd] = fecha.split('-');
  if (parseInt(dd, 10) <= 12) {
    const fix = `${yyyy}-${dd}-${mm}`;
    if (new Date(fix) <= hoy) {
      // Corregir en Supabase (async, sin bloquear la carga)
      localUpdate('planillas', { id: planillaId }, { fecha: fix });
      return fix;
    }
  }
  return fecha;
};

export async function loadNegociosFromLocal() {
  const negocios = await localFetch('negocios', 'select=*');
  if (!negocios) return null;
  if (!negocios.length) return [];

  const result = await Promise.all(negocios.map(async neg => {
    const [productos, planillas, gastosFijos, cxc, staff] = await Promise.all([
      localFetch('productos',    `negocio_id=eq.${neg.id}&select=*&order=sort_order.asc`),
      localFetch('planillas',    `negocio_id=eq.${neg.id}&select=*&order=fecha.desc`),
      localFetch('gastos_fijos', `negocio_id=eq.${neg.id}&select=*`),
      localFetch('cxc',          `negocio_id=eq.${neg.id}&pagado=eq.false&select=*`),
      localFetch('staff',        `negocio_id=eq.${neg.id}&select=*`),
    ]);
    return {
      ...neg,
      productos:   (productos  ||[]).map((p,i) => ({ id:p.id, sort_order:p.sort_order??i, name:p.name, cat:p.cat, price:p.price||0, stock:p.stock||0, min:p.min||0, courtesy:p.courtesy||null })),
      planillas:   (planillas  ||[]).map(p => ({ id:p.id, fecha:corregirFechaSwap(p.fecha, p.id), apertura:p.apertura, cierre:p.cierre, ventas:p.ventas||0, bancos:p.bancos||0, gastos:p.gastos||0, personal:p.personal||0, extras:p.extras||0, pendientes:p.pendientes||0, neto:p.neto||0, novedades:p.novedades||'', personalDetalle:p.personal_detalle||[], gastosDetalle:p.gastos_detalle||[], movimientos:p.movimientos||[], bancoDetalle:p.banco_detalle||{} })),
      gastosFijos: (gastosFijos||[]).map(g => ({ id:g.id, desc:g.descripcion, monto:g.monto, dia:g.dia||0 })),
      cxc:         (cxc        ||[]).map(c => ({ id:c.id, deudor:c.deudor, monto:c.monto, fecha:c.fecha, concepto:c.concepto||'' })),
      staff:       (staff      ||[]).map(s => ({ id:s.id, name:s.name, rol:s.rol, pay:isNaN(Number(s.pay))?s.pay:Number(s.pay) })),
    };
  }));
  return result;
}

export const fetchLocal = localFetch;
export const insertLocal = localInsert;
export const upsertLocal = localUpsert;
export const updateLocal = localUpdate;
export const deleteLocal = localDelete;
