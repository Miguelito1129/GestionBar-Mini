import { useEffect, useMemo, useState } from "react";
import { C, s, COP } from "../../constants/theme.js";
import {
  localDelete,
  localCreateOrder,
  localFetch,
  localInsert,
  localPrintOrder,
  localQuickSale,
  localFetchTables,
  localFetchTableAccounts,
  localFetchTableAccountOrders,
  localCloseTableAccount,
  localUpdate,
} from "../../lib/localApi.js";
import { uid } from "../../utils/helpers.js";
import { formatLocalTime } from "../../utils/dateTime.js";
import { Badge, Metric, PaginationTabs, SectionTitle, useListPagination } from "../common/index.jsx";
import { useTurnoData } from "../../hooks/useTurnoData.js";

const STATUS_LABEL = {
  enviada: "Esperando autorización",
  entregada_falta_pago: "Despachado · cuenta abierta",
  pagada: "Pagado",
  cancelada: "Cancelado",
};

const STATUS_COLOR = {
  enviada: C.amber,
  entregada_falta_pago: C.amber,
  pagada: C.green,
  cancelada: C.red,
};
const ORDER_STATUS_GROUPS = [
  { id: "enviada", title: "En espera de Barra" },
  { id: "entregada_falta_pago", title: "En cuenta abierta" },
  { id: "pagada", title: "Pagados" },
  { id: "otros", title: "Otros estados" },
];
const SOLO_ORDER_STATUS_GROUPS = [
  { id: "entregada_falta_pago", title: "Cuentas abiertas" },
  { id: "pagada", title: "Ventas cobradas" },
  { id: "otros", title: "Otros estados" },
];
const promotionTypesOf = value => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export default function MeseroWorkspace({ negocio, userName, userId, singleOperator = false, barOrderMode = false, sharedTurnoData, view = "operacion" }) {
  const ownTurnoData = useTurnoData(
    negocio.id,
    singleOperator ? null : userId,
    !singleOperator,
    !singleOperator,
    !sharedTurnoData,
  );
  const { turno, comandas, setComandas, productos, setProductos } = sharedTurnoData || ownTurnoData;

  const [productSearch, setProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [mesa, setMesa] = useState("");
  const [tablesError, setTablesError] = useState("");
  const [tableAccounts, setTableAccounts] = useState([]);
  const [accountsError, setAccountsError] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedAccountOrders, setSelectedAccountOrders] = useState([]);
  const [accountOrdersLoading, setAccountOrdersLoading] = useState(false);
  const [accountOrdersError, setAccountOrdersError] = useState("");
  const [accountPaymentMethod, setAccountPaymentMethod] = useState("efectivo");
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [promociones, setPromociones] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [itemDetails, setItemDetails] = useState({});
  const [activeOrderStatus, setActiveOrderStatus] = useState(singleOperator ? "pagada" : "entregada_falta_pago");
  const refreshTableAccounts = async turnoId => {
    if (!turnoId) {
      setTableAccounts([]);
      setAccountsError("");
      return;
    }
    const result = await localFetchTableAccounts(turnoId);
    if (!Array.isArray(result)) throw new Error("El servidor devolvió una lista de cuentas inválida.");
    setTableAccounts(result);
    setAccountsError("");
  };

  useEffect(() => {
    let active = true;
    setTablesLoading(true);
    localFetchTables(negocio.id).then(result => {
      if (!Array.isArray(result)) throw new Error("El servidor devolvió una lista de mesas inválida.");
      if (active) {
        setTables(result);
        setTablesError("");
      }
    }).catch(error => {
      if (active) setTablesError(error.message || "No fue posible cargar las mesas.");
    }).finally(() => {
      if (active) setTablesLoading(false);
    });
    return () => { active = false; };
  }, [negocio.id]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!turno?.id) {
        if (active) {
          setTableAccounts([]);
          setAccountsError("");
        }
        return;
      }
      try {
        const result = await localFetchTableAccounts(turno.id);
        if (!Array.isArray(result)) throw new Error("El servidor devolvió una lista de cuentas inválida.");
        if (active) {
          setTableAccounts(result);
          setAccountsError("");
        }
      } catch (error) {
        if (active) setAccountsError(error.message || "No fue posible cargar las cuentas abiertas.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [turno?.id]);
  useEffect(() => {
    if (!selectedAccountId) {
      setSelectedAccountOrders([]);
      setAccountOrdersError("");
      return undefined;
    }
    let active = true;
    const refresh = async () => {
      try {
        const result = await localFetchTableAccountOrders(selectedAccountId);
        if (!Array.isArray(result?.pedidos)) throw new Error("El servidor devolvió una lista de pedidos inválida.");
        if (active) {
          setSelectedAccountOrders(result.pedidos);
          setAccountOrdersError("");
        }
      } catch (error) {
        if (active) setAccountOrdersError(error.message || "No fue posible cargar los pedidos de esta mesa.");
      } finally {
        if (active) setAccountOrdersLoading(false);
      }
    };
    setAccountOrdersLoading(true);
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selectedAccountId]);

  useEffect(() => {
    let active = true;
    localFetch("promociones", `negocio_id=eq.${negocio.id}&activo=eq.true&select=*`).then(rows => {
      if (active) setPromociones(rows || []);
    });
    return () => { active = false; };
  }, [negocio.id]);

  const categories = useMemo(
    () => [
      "Todos",
      ...new Set(
        productos.map(product => product.cat).filter(Boolean)
      ),
    ],
    [productos]
  );

  const visibleProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();

    return productos.filter(product => {
      const name = String(product.name || "").toLowerCase();

      const matchesSearch =
        !search || name.includes(search);

      const matchesCategory =
        selectedCategory === "Todos" ||
        product.cat === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [productos, productSearch, selectedCategory]);

  const getPromotion = productId => promociones.find(promotion =>
    ["2x1", "precio_especial"].includes(promotion.tipo) && promotion.producto_principal_id === productId
  );

  const itemDiscount = item => {
    const promotion = getPromotion(item.producto_id);
    if (!promotion) return Number(item.comboDiscount || 0);
    const unitPrice = Number(item.precio_unitario || 0);
    if (promotion.tipo === "precio_especial") return Math.max(0, unitPrice - Number(promotion.precio_promocional || 0)) * Number(item.cantidad || 0) + Number(item.comboDiscount || 0);
    const groupSize = Math.max(2, Number(promotion.cantidad_compra) || 2);
    return Math.floor(Number(item.cantidad || 0) / groupSize) * (groupSize - 1) * unitPrice + Number(item.comboDiscount || 0);
  };

  const itemTotal = item => Number(item.precio_unitario || 0) * Number(item.cantidad || 0) - itemDiscount(item);

  const cartTotal = items.reduce((sum, item) => sum + itemTotal(item), 0);

  const itemsCount = items.reduce(
    (sum, item) => sum + Number(item.cantidad || 0),
    0
  );

  const ventasTotal = comandas.reduce(
    (sum, comanda) =>
      sum + (comanda.estado === "cancelada" ? 0 : Number(comanda.total || 0)),
    0
  );

  const pendingOrders = comandas.filter(
    comanda => comanda.estado === "enviada"
  ).length;
  const activeComandas = comandas.filter(comanda => comanda.estado !== "cancelada");
  const orderStatusGroups = singleOperator ? SOLO_ORDER_STATUS_GROUPS : ORDER_STATUS_GROUPS;
  const ordersForStatus = statusId => activeComandas.filter(comanda =>
    statusId === "otros"
      ? comanda.estado !== "cancelada"
        && !orderStatusGroups.some(group => group.id !== "otros" && group.id === comanda.estado)
      : comanda.estado === statusId
  );
  const isOpenAccountsTab = activeOrderStatus === "entregada_falta_pago";
  const visibleOrders = isOpenAccountsTab && selectedAccountId
    ? selectedAccountOrders
    : ordersForStatus(activeOrderStatus);
  const orderPage = useListPagination(visibleOrders, 6);

  const availableProducts = visibleProducts.filter(
    product => Number(product.stock || 0) > 0
  ).length;
  const tableOrderMode = view === "mesas"
    || ((barOrderMode || singleOperator) && view === "nueva-comanda");
  const showTablePicker = tableOrderMode && !mesa;
  const showComposer = singleOperator
    ? view !== "operacion" && (!tableOrderMode || Boolean(mesa))
    : barOrderMode
      ? Boolean(mesa)
      : (view === "mesas" && Boolean(mesa)) || (view === "operacion" && Boolean(editingId));

  const startOrderAtTable = tableName => {
    setItems([]);
    setEditingId(null);
    setMesa(tableName);
    setMessage("");
  };

  const addItem = product => {
    if (Number(product.stock || 0) < 1 || busy) return;
    const promotion = getPromotion(product.id);

    setItems(current => {
      const existing = current.find(
        item => item.producto_id === product.id
      );

      if (existing) {
        if (
          existing.cantidad >= Number(product.stock || 0)
        ) {
          return current;
        }

        return current.map(item =>
          item.producto_id === product.id
            ? {
                ...item,
                cantidad: item.cantidad + 1,
                promocionesAplicadas: [...new Set([
                  ...promotionTypesOf(item.promocionesAplicadas),
                  ...(promotion ? [promotion.tipo] : []),
                ])],
              }
            : item
        );
      }

      return [
        ...current,
        {
          producto_id: product.id,
          nombre: product.name,
          cantidad: 1,
          precio_unitario: Number(product.price || 0),
          promocionesAplicadas: promotion ? [promotion.tipo] : [],
        },
      ];
    });

    setMessage("");
  };

  const changeQty = (productId, delta) => {
    setItems(current =>
      current
        .map(item =>
          item.producto_id === productId
            ? {
                ...item,
                cantidad: item.cantidad + delta,
              }
            : item
        )
        .filter(item => item.cantidad > 0)
    );
  };

  const removeItem = productId => {
    setItems(current =>
      current.filter(item => item.producto_id !== productId)
    );
  };

  const promotionItems = promotion => {
    if (Array.isArray(promotion.productos_combo)) return promotion.productos_combo;
    try { return JSON.parse(promotion.productos_combo || "[]"); } catch { return []; }
  };

  const addPromotion = promotion => {
    const components = promotion.tipo === "combo"
      ? promotionItems(promotion)
      : [
        { producto_id: promotion.producto_principal_id, cantidad: promotion.cantidad_compra || 1 },
        ...(promotion.tipo === "cortesia" && promotion.producto_cortesia_id
          ? [{ producto_id: promotion.producto_cortesia_id, cantidad: promotion.cantidad_cortesia || 1, cortesia: true }]
          : []),
      ];
    if (busy || !components.length || (promotion.tipo === "combo" && components.length < 2)) return;
    const valid = components.every(component => {
      const product = productos.find(item => item.id === component.producto_id);
      const alreadyInCart = items.find(item => item.producto_id === component.producto_id)?.cantidad || 0;
      return product && Number(product.stock || 0) >= alreadyInCart + Number(component.cantidad || 0);
    });
    if (!valid) { setMessage("No hay existencias suficientes para agregar este combo."); return; }
    const regularTotal = components.reduce((sum, component) => sum + Number(component.cantidad || 0) * Number(productos.find(item => item.id === component.producto_id)?.price || 0), 0);
    const discount = promotion.tipo === "combo"
      ? Math.max(0, regularTotal - Number(promotion.precio_promocional || 0))
      : 0;
    setItems(current => {
      const next = current.map(item => ({ ...item }));
      components.forEach((component, index) => {
        const product = productos.find(item => item.id === component.producto_id);
        const componentPromotionType = component.cortesia
          ? "cortesia"
          : promotion.tipo === "cortesia"
            ? "producto_mas_cortesia"
            : promotion.tipo;
        const existing = next.find(item => item.producto_id === component.producto_id);
        if (existing) {
          existing.cantidad += Number(component.cantidad || 0);
          existing.promocionesAplicadas = [...new Set([
            ...promotionTypesOf(existing.promocionesAplicadas),
            componentPromotionType,
          ])];
          if (index === 0) existing.comboDiscount = Number(existing.comboDiscount || 0) + discount;
          if (component.cortesia) existing.comboDiscount = Number(existing.comboDiscount || 0) + Number(component.cantidad || 0) * Number(product.price || 0);
        } else next.push({ producto_id: product.id, nombre: product.name, cantidad: Number(component.cantidad || 0), precio_unitario: Number(product.price || 0), comboDiscount: index === 0 ? discount : component.cortesia ? Number(component.cantidad || 0) * Number(product.price || 0) : 0, promocionesAplicadas: [componentPromotionType] });
      });
      return next;
    });
    setMessage(`✓ ${promotion.nombre} agregado al pedido.`);
  };

  const clearComposer = () => {
    setItems([]);
    setEditingId(null);
    setMesa("");
    setMessage("");
  };

  const startEdit = async comanda => {
    if (comanda.estado !== "enviada" || busy) return;

    const confirmed = window.confirm(
      `Vas a modificar la comanda #${comanda.consecutivo || "?"}.\n\n` +
        "Barra recibirá nuevamente el pedido con los cambios realizados.\n\n" +
        "¿Deseas continuar?"
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    const details = await localFetch(
      "comanda_items",
      `comanda_id=eq.${comanda.id}&select=*`
    );

    if (!details) {
      setMessage(
        "No fue posible cargar los productos de esta comanda."
      );
      setBusy(false);
      return;
    }

    const productById = new Map(
      productos.map(product => [product.id, product])
    );

    setItems(
      details
        .map(item => ({
          id: item.id,
          producto_id: item.producto_id,
          nombre:
            productById.get(item.producto_id)?.name ||
            "Producto no disponible",
          cantidad: Number(item.cantidad || 0),
          precio_unitario: Number(
            item.precio_unitario || 0
          ),
          promocionesAplicadas: promotionTypesOf(item.promociones_aplicadas),
        }))
        .filter(item => item.cantidad > 0)
    );

    setMesa(comanda.mesa || "");
    setEditingId(comanda.id);

    setMessage(
      `Editando la comanda #${comanda.consecutivo || "?"}. Revisa los productos antes de guardar.`
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    setBusy(false);
  };

  const saveItems = async comandaId => {
    const previous = await localFetch(
      "comanda_items",
      `comanda_id=eq.${comandaId}&select=*`
    );

    if (!previous) return false;

    const currentIds = new Set(
      items.map(item => item.id).filter(Boolean)
    );

    const removed = previous.filter(
      item => !currentIds.has(item.id)
    );

    for (const item of removed) {
      if (
        !(await localDelete("comanda_items", {
          id: item.id,
        }))
      ) {
        return false;
      }
    }

    for (const item of items) {
      const payload = {
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        descuento: itemDiscount(item),
        promociones_aplicadas: promotionTypesOf(item.promocionesAplicadas),
      };

      const ok = item.id
        ? await localUpdate(
            "comanda_items",
            { id: item.id },
            payload
          )
        : await localInsert("comanda_items", {
            id: uid(),
            comanda_id: comandaId,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            descuento: itemDiscount(item),
            promociones_aplicadas: promotionTypesOf(item.promocionesAplicadas),
          });

      if (!ok) return false;
    }

    return true;
  };

  const printOrderForBar = async comandaId => {
    try {
      const result = await localPrintOrder(comandaId, userId);
      return result?.message || "Pedido enviado a imprimir en Printer001.";
    } catch (error) {
      console.error("El pedido se guardó, pero no se pudo imprimir para barra:", error);
      return `No se pudo imprimir en Printer001: ${error.message || "revisa la conexión Bluetooth."}`;
    }
  };

  const submit = async () => {
    if (
      !turno ||
      !items.length ||
      busy
    ) {
      return;
    }

    if (editingId) {
      const confirmed = window.confirm(
        `¿Guardar cambios en la comanda #${comandas.find(row => row.id === editingId)?.consecutivo || "?"}?\n\n` +
          "Barra será notificada de que el pedido fue modificado."
      );

      if (!confirmed) return;
    }

    setBusy(true);
    setMessage("");

    if (singleOperator) {
      try {
        const result = await localQuickSale({
          turno_id: turno.id,
          mesa,
          items: items.map(item => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            descuento: Math.round(itemDiscount(item)),
            promociones_aplicadas: promotionTypesOf(item.promocionesAplicadas),
          })),
        });
        if (!result?.comanda || !Array.isArray(result.existencias)) {
          throw new Error("El servidor no devolvió la venta registrada.");
        }
        setComandas(current => [result.comanda, ...current]);
        setProductos(current => current.map(product => {
          const updated = result.existencias.find(row => row.producto_id === product.id);
          return updated ? { ...product, stock: updated.stock } : product;
        }));
        clearComposer();
        setMessage(`✓ Pedido #${result.comanda.consecutivo} agregado a la cuenta de ${result.comanda.mesa}.`);
      } catch (error) {
        console.error("No fue posible registrar la venta rápida:", error);
        setMessage(error.message || "No fue posible registrar la venta.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (editingId) {
      const detailsUpdated = await saveItems(editingId);
      const updatedAt = new Date().toISOString();
      const updated = detailsUpdated && await localUpdate(
        "comandas",
        { id: editingId },
        {
          subtotal: cartTotal,
          total: cartTotal,
          mesa,
          actualizada_en: updatedAt,
        }
      );

      if (!detailsUpdated || !updated) {
        setMessage(
          "No fue posible guardar todos los cambios de la comanda."
        );
      } else {
        const editedComandaId = editingId;
        setComandas(current =>
          current.map(row =>
            row.id === editedComandaId
              ? {
                  ...row,
                  subtotal: cartTotal,
                  total: cartTotal,
                  mesa,
                  actualizada_en: updatedAt,
                }
              : row
          )
        );

        clearComposer();
        const printMessage = await printOrderForBar(editedComandaId);
        setMessage(`✓ Comanda modificada y enviada nuevamente a barra. ${printMessage}`);
      }

      setBusy(false);
      return;
    }

    if (!userId) {
      setMessage("No se pudo identificar la cuenta del usuario. Cierra sesión e ingresa nuevamente.");
      setBusy(false);
      return;
    }

    try {
      const createdOrder = await localCreateOrder({
        turno_id: turno.id,
        mesa,
        items: items.map(item => ({
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento: Math.round(itemDiscount(item)),
          promociones_aplicadas: promotionTypesOf(item.promocionesAplicadas),
        })),
      });
      if (!createdOrder?.id || !createdOrder.consecutivo) {
        throw new Error("El servidor no devolvió el pedido guardado.");
      }
      setComandas(current => [createdOrder, ...current]);
      clearComposer();
      const printMessage = await printOrderForBar(createdOrder.id);
      setMessage(`✓ Pedido #${createdOrder.consecutivo} guardado y enviado a barra. ${printMessage}`);
    } catch (error) {
      console.error("No fue posible guardar y enviar el pedido:", error);
      setMessage(error.message || "No fue posible guardar el pedido.");
    }

    setBusy(false);
  };

  const cancel = async comanda => {
    if (
      busy ||
      comanda.estado !== "enviada"
    ) {
      return;
    }

    const confirmed = window.confirm(
      `¿Cancelar la comanda #${comanda.consecutivo || "?"}?\n\n` +
        "Barra será notificada de la cancelación."
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    const ok = await localUpdate(
      "comandas",
      { id: comanda.id },
      {
        estado: "cancelada",
        actualizada_en: new Date().toISOString(),
      }
    );

    if (ok) {
      setComandas(current =>
        current.map(row =>
          row.id === comanda.id
            ? {
                ...row,
                estado: "cancelada",
              }
            : row
        )
      );

      if (editingId === comanda.id) {
        clearComposer();
      }

      setMessage("Pedido cancelado correctamente.");
    } else {
      setMessage(
        "No fue posible cancelar el pedido."
      );
    }

    setBusy(false);
  };

  const toggleDetails = async comanda => {
    if (expandedId === comanda.id) {
      setExpandedId(null);
      return;
    }
    if (!itemDetails[comanda.id]) {
      const rows = await localFetch("comanda_items", `comanda_id=eq.${comanda.id}&select=*`);
      if (!rows) {
        setMessage("No fue posible cargar los productos de la comanda.");
        return;
      }
      const names = new Map(productos.map(product => [product.id, product.name]));
      setItemDetails(current => ({
        ...current,
        [comanda.id]: rows.map(row => ({
          ...row,
          nombre: names.get(row.producto_id) || "Producto no disponible",
        })),
      }));
    }
    setExpandedId(comanda.id);
  };

  const closeTableAccount = async account => {
    if (busy || account.pedidos_pendientes > 0) return;
    const confirmed = window.confirm(
      account.total > 0
        ? `¿Cerrar la cuenta de ${account.mesa} por ${COP(account.total)}?\n\nSe registrará un único pago por el total acumulado de todos sus pedidos.`
        : `¿Cerrar la cuenta vacía de ${account.mesa}?\n\nNo hay pedidos activos ni se registrará un pago.`
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await localCloseTableAccount(account.id, accountPaymentMethod);
      const closedOrderIds = new Set(result.pedidos || []);
      setComandas(current => current.map(row => closedOrderIds.has(row.id)
        ? {
            ...row,
            estado: "pagada",
            modo_pago: result.medio_pago,
            pago_confirmado: 1,
            pago_registrado_por: userId || userName || null,
            pago_registrado_en: result.cerrada_en,
            pagado_en: result.cerrada_en,
          }
        : row));
      setMessage(`✓ Cuenta de ${result.mesa} cerrada y cobrada por ${COP(result.total)}.`);
      try {
        await refreshTableAccounts(turno?.id);
      } catch (error) {
        setAccountsError(error.message || "La cuenta se cerró, pero no fue posible actualizar la lista.");
      }
    } catch (error) {
      console.error("No fue posible cerrar la cuenta de mesa:", error);
      setMessage(error.message || "No fue posible cerrar la cuenta.");
    } finally {
      setBusy(false);
    }
  };

  const turnoWaiters = Array.isArray(turno?.meseros_ids) ? turno.meseros_ids : [];
  const authorizedForTurn = singleOperator || barOrderMode
    || turnoWaiters.some(id => String(id) === String(userId));
  if (!turno) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 12px" }}>
        <SectionTitle>{barOrderMode ? "🧾 Nueva comanda" : "🧾 Mi turno"} — {negocio.name}</SectionTitle>
        <div style={{ ...s.card, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏱</div>
          <strong>No hay una planilla abierta</strong>
          <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.5 }}>
            Podrás registrar pedidos cuando el gerente abra el turno.
          </p>
        </div>
      </div>
    );
  }
  if (turno && !authorizedForTurn) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 12px" }}>
        <SectionTitle>{barOrderMode ? "🧾 Nueva comanda" : "🧾 Mi turno"} — {negocio.name}</SectionTitle>
        <div style={{ ...s.card, borderColor: `${C.red}50`, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <strong style={{ color: C.red }}>No estás autorizado para este turno</strong>
          <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.5 }}>
            El gerente debe incluir tu cuenta en la lista de meseros autorizados al abrir la planilla.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        paddingBottom: 30,
      }}
    >
      <SectionTitle>
      {barOrderMode
        ? "🧾 Nueva comanda"
        : singleOperator
          ? view === "operacion" ? "🧾 Ventas del turno" : "🧾 Nueva venta"
          : view === "mesas" ? "▦ Tomar pedido" : "🧾 Mi turno"} — {negocio.name}
      </SectionTitle>

      <p
        style={{
          color: C.sub,
          fontSize: 13,
          marginTop: -10,
          marginBottom: 16,
        }}
      >
        {barOrderMode
          ? "Registra un pedido aquí; aparecerá en la cola para autorizarlo y despacharlo."
          : singleOperator
            ? view === "operacion"
              ? "Consulta las ventas cobradas durante este turno."
              : "Elige una mesa y agrega pedidos a su cuenta. Cobra el total acumulado al cerrar la cuenta."
          : view === "mesas"
            ? "Elige la mesa del cliente para comenzar su comanda."
            : "Consulta tus pedidos y cierra cada cuenta desde la vista Mesas cuando el cliente termine."}
      </p>
      <div style={{ color: C.amber, fontSize: 12, fontWeight: 700, marginTop: -8, marginBottom: 16 }}>
        Cuenta activa: {userName}{singleOperator ? " · turno individual" : barOrderMode ? " · Barra" : ""}
      </div>

      {/* RESUMEN DEL TURNO */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(145px,1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Metric
          label="Turno"
          value={
            turno ? "Abierto" : "Sin turno"
          }
          color={
            turno ? C.green : C.red
          }
          icon="⏱"
        />

        <Metric
          label={singleOperator ? "Ventas del turno" : "Mis pedidos"}
          value={activeComandas.length}
          color={C.amber}
          icon="🧾"
        />

        {!singleOperator && (
          <Metric
            label="Pendientes"
            value={pendingOrders}
            color={C.amber}
            icon="⏳"
          />
        )}

        <Metric
          label="Ventas"
          value={COP(ventasTotal)}
          color={C.green}
          icon="💰"
        />
      </div>

      {showTablePicker && (
        <section style={{ ...s.card, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>Selecciona una mesa</h2>
              <p style={{ margin: "5px 0 0", color: C.sub, fontSize: 12 }}>Los nuevos pedidos se suman a la cuenta abierta; el pago se registra una sola vez al cerrarla.</p>
            </div>
            <strong style={{ color: C.amber, fontSize: 12 }}>{tables.length} {tables.length === 1 ? "mesa" : "mesas"}</strong>
          </div>
          {accountsError && <div role="alert" style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{accountsError}</div>}
          {tablesError ? (
            <div role="alert" style={{ color: C.red, fontSize: 13 }}>{tablesError}</div>
          ) : tablesLoading ? (
            <div style={{ padding: 18, color: C.sub, textAlign: "center", fontSize: 13 }}>Cargando mesas...</div>
          ) : tables.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(135px,1fr))", gap: 10 }}>
              {tables.map(table => {
                const account = tableAccounts.find(row => row.mesa === table.nombre);
                return (
                  <div
                    key={table.id}
                    style={{
                      ...s.card,
                      minHeight: 126,
                      padding: 10,
                      display: "grid",
                      alignContent: "center",
                      gap: 7,
                      borderColor: account ? `${C.amber}70` : C.border,
                      background: account ? `${C.amber}10` : C.surface,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => startOrderAtTable(table.nombre)}
                      disabled={busy || !turno}
                      style={{ border: 0, background: "transparent", color: C.text, cursor: busy || !turno ? "not-allowed" : "pointer", display: "grid", justifyItems: "center", gap: 5 }}
                    >
                      <span style={{ fontSize: 11, color: C.sub, textTransform: "uppercase", letterSpacing: ".08em" }}>Mesa</span>
                      <strong style={{ fontSize: 24, color: C.amber }}>{String(table.nombre).replace(/^Mesa\s*/i, "")}</strong>
                      <span style={{ fontSize: 11, color: account ? C.amber : C.sub }}>
                        {account ? `${account.pedidos} pedido${account.pedidos === 1 ? "" : "s"} · ${COP(account.total)}` : "Sin cuenta abierta"}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 18, border: `1px dashed ${C.border}`, borderRadius: 10, color: C.sub, textAlign: "center", fontSize: 13 }}>
              No hay mesas configuradas. Pide a Barra que las agregue en el módulo Mesas.
            </div>
          )}
        </section>
      )}

      {showComposer && promociones.length > 0 && (
        <div className="waiter-promotions">
          <div className="waiter-promotions__header">
            <div>
              <span className="waiter-promotions__eyebrow">OFERTAS DISPONIBLES</span>
              <div className="waiter-promotions__title">Promociones para este pedido</div>
              <p>Agrega una oferta y se aplicará automáticamente al carrito.</p>
            </div>
            <span className="waiter-promotions__count">{promociones.length} activas</span>
          </div>
          <div className="waiter-promotions__list">
            {promociones.map(promotion => {
              const main = productos.find(product => product.id === promotion.producto_principal_id)?.name || "Producto";
              const combo = promotion.tipo === "combo" ? promotionItems(promotion).map(item => `${item.cantidad}× ${productos.find(product => product.id === item.producto_id)?.name || "Producto"}`).join(" + ") : "";
              const text = promotion.tipo === "2x1" ? `${main}: lleva ${promotion.cantidad_compra || 2}, paga 1` : promotion.tipo === "precio_especial" ? `${main}: ${COP(promotion.precio_promocional)}` : promotion.tipo === "combo" ? `${combo} · ${COP(promotion.precio_promocional)}` : `${main} + cortesía`;
              const type = promotion.tipo === "combo" ? "combo" : promotion.tipo === "cortesia" ? "courtesy" : promotion.tipo === "2x1" ? "two-for-one" : "special-price";
              const label = promotion.tipo === "combo" ? "Combo" : promotion.tipo === "cortesia" ? "Producto + cortesía" : promotion.tipo === "2x1" ? "2 × 1" : "Precio especial";
              const icon = promotion.tipo === "combo" ? "🍸" : promotion.tipo === "cortesia" ? "🎁" : promotion.tipo === "2x1" ? "✦" : "◈";
              return (
                <article key={promotion.id} className={`waiter-promotion waiter-promotion--${type}`}>
                  <div className="waiter-promotion__top">
                    <span className="waiter-promotion__icon" aria-hidden="true">{icon}</span>
                    <span className="waiter-promotion__type">{label}</span>
                  </div>
                  <div className="waiter-promotion__content">
                    <strong>{promotion.nombre}</strong>
                    <span>{text}</span>
                  </div>
                  <button type="button" disabled={busy} onClick={() => addPromotion(promotion)}>
                    <span aria-hidden="true">＋</span> Agregar al pedido
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {showComposer && (<>
      {/* COMPOSITOR */}
      <div
        style={{
          ...s.card,
          marginBottom: 18,
          padding: 0,
          overflow: "hidden",
        }}
      >
        {/* CABECERA */}
        <div
          style={{
            padding: "16px 16px 12px",
            borderBottom: `1px solid ${C.border || "rgba(255,255,255,.08)"}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                {editingId
                  ? "✏️ Editando pedido"
                  : barOrderMode ? "🛒 Nuevo pedido" : singleOperator ? "🛒 Nueva venta" : "🛒 Nuevo pedido"}
              </div>

              <div
                style={{
                  color: C.sub,
                  fontSize: 12,
                  marginTop: 3,
                }}
              >
                {editingId
                  ? "Los cambios serán enviados nuevamente a barra."
                  : "Agrega productos y envía la comanda cuando esté lista."}
              </div>
            </div>

            {tableOrderMode && (
              <button
                type="button"
                onClick={() => { setMesa(""); setItems([]); setEditingId(null); setMessage(""); }}
                disabled={busy}
                style={{ ...s.btn("ghost"), minHeight: 36 }}
              >
                ← Cambiar mesa
              </button>
            )}

            {editingId && (
              <button
                type="button"
                onClick={clearComposer}
                disabled={busy}
                style={{
                  ...s.btn("ghost"),
                  padding: "7px 11px",
                }}
              >
                Salir de edición
              </button>
            )}
          </div>

          {/* ALERTA DE EDICIÓN */}
          {editingId && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background:
                  "rgba(255,193,7,.10)",
                border:
                  "1px solid rgba(255,193,7,.28)",
                color: C.amber,
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              ⚠️ <strong>Pedido en edición.</strong>{" "}
              Al guardar, barra recibirá el cambio
              realizado sobre esta comanda.
            </div>
          )}
        </div>

        <div style={{ padding: 16 }}>
          <div className="waiter-catalogue-search">
            <span aria-hidden="true">⌕</span>
            <input
              placeholder="Buscar producto..."
              aria-label="Buscar producto"
              value={productSearch}
              onChange={event =>
                setProductSearch(
                  event.target.value
                )
              }
              disabled={busy}
            />
            {productSearch && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setProductSearch("")}
                disabled={busy}
              >
                ×
              </button>
            )}
          </div>

          <div className="waiter-category-list" role="group" aria-label="Filtrar productos por categoría">
            {categories.map(category => {
              const active =
                selectedCategory === category;
              const categoryCount = category === "Todos"
                ? productos.length
                : productos.filter(product => product.cat === category).length;

              return (
                <button
                  key={category}
                  type="button"
                  className={`waiter-category${active ? " is-active" : ""}`}
                  onClick={() =>
                    setSelectedCategory(category)
                  }
                  disabled={busy}
                  aria-pressed={active}
                >
                  {category}
                  <span>{categoryCount}</span>
                </button>
              );
            })}
          </div>

          {/* PRODUCTOS */}
          <div className="waiter-catalogue-summary">
            <div>
              <strong>Productos para tu comanda</strong>
              <span>{availableProducts} disponibles de {visibleProducts.length} productos</span>
            </div>
            <div className="waiter-catalogue-legend">
              <span><i className="is-available" />Disponible</span>
              <span><i className="is-low" />Pocas unidades</span>
              <span><i className="is-empty" />Agotado</span>
            </div>
          </div>
          <div className="waiter-product-grid">
            {visibleProducts.map(product => {
              const selected = items.find(
                item =>
                  item.producto_id === product.id
              );

              const stock = Number(
                product.stock || 0
              );

              const outOfStock = stock < 1;
              const lowStock = !outOfStock && stock <= 3;
              const promotion = getPromotion(product.id);

              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={
                    outOfStock || busy
                  }
                  aria-pressed={Boolean(selected)}
                  className={`waiter-product-card${selected ? " is-selected" : ""}${outOfStock ? " is-out" : ""}`}
                  onClick={() =>
                    addItem(product)
                  }
                  title={outOfStock ? "Producto agotado" : `Agregar ${product.name} a la comanda`}
                >
                  <span className="waiter-product-mark" aria-hidden="true">
                    {String(product.name || "?").trim().charAt(0).toUpperCase()}
                  </span>

                  {promotion && (
                    <span className="waiter-product-promotion">
                      {promotion.tipo === "2x1" ? "2×1" : "Oferta"}
                    </span>
                  )}

                  {selected && (
                    <span className="waiter-product-quantity" aria-label={`${selected.cantidad} en la comanda`}>
                      {selected.cantidad}
                    </span>
                  )}

                  <div className="waiter-product-info">
                    <strong>{product.name}</strong>
                    {product.cat && <span>{product.cat}</span>}
                  </div>

                  <div className="waiter-product-details">
                    <strong className="waiter-product-price">{COP(product.price)}</strong>
                    <span className={`waiter-product-stock ${outOfStock ? "is-empty" : lowStock ? "is-low" : "is-available"}`}>
                      <i />
                      {outOfStock ? "Agotado" : lowStock ? `Solo ${stock} unidades` : `${stock} disponibles`}
                    </span>
                    {!outOfStock && <span className="waiter-product-add" aria-hidden="true">＋ Agregar</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {!visibleProducts.length && (
            <div className="waiter-catalogue-empty">
              <span aria-hidden="true">⌕</span>
              <strong>No encontramos productos</strong>
              <p>Prueba con otro nombre o selecciona una categoría distinta.</p>
              {(productSearch || selectedCategory !== "Todos") && (
                <button type="button" onClick={() => { setProductSearch(""); setSelectedCategory("Todos"); }}>
                  Limpiar búsqueda y filtros
                </button>
              )}
            </div>
          )}

          {/* CARRITO */}
          {items.length > 0 && (
            <div
              style={{
                marginTop: 18,
                borderRadius: 14,
                border:
                  "1px solid rgba(0,210,100,.20)",
                background:
                  "rgba(0,210,100,.045)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "13px 14px",
                  borderBottom:
                    "1px solid rgba(255,255,255,.07)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                    }}
                  >
                    🛒 Pedido actual
                  </div>

                  <div
                    style={{
                      color: C.sub,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {itemsCount} producto
                    {itemsCount === 1
                      ? ""
                      : "s"}{" "}
                    seleccionado
                    {itemsCount === 1
                      ? ""
                      : "s"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setItems([])
                  }
                  disabled={busy}
                  style={{
                    ...s.btn("ghost"),
                    padding: "6px 9px",
                    fontSize: 11,
                  }}
                >
                  Vaciar
                </button>
              </div>

              <div
                style={{
                  padding: "4px 14px",
                }}
              >
                {items.map(item => (
                  <div
                    key={item.producto_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr auto",
                      gap: 8,
                      alignItems: "center",
                      padding:
                        "11px 0",
                      borderBottom:
                        "1px solid rgba(255,255,255,.06)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{item.nombre}</span>
                        {(() => {
                          const productStock = Number(productos.find(p => p.id === item.producto_id)?.stock || 0);
                          const available = productStock >= item.cantidad;
                          return (
                            <span style={{ 
                              display: "inline-flex", alignItems: "center", gap: 4, 
                              background: available ? "rgba(52, 211, 153, 0.15)" : "rgba(248, 113, 113, 0.15)", 
                              padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                              color: available ? C.green : C.red
                            }}>
                              Pide {item.cantidad} <span style={{ color: C.sub, opacity: 0.7, fontWeight: 400 }}>/</span> Stock {productStock}
                            </span>
                          );
                        })()}
                      </div>
                      <div style={{ color: C.sub, fontSize: 10, marginTop: 4 }}>
                        {COP(item.precio_unitario)} c/u
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems:
                          "center",
                        gap: 7,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          changeQty(
                            item.producto_id,
                            -1
                          )
                        }
                        disabled={busy}
                        style={{
                          width: 31,
                          height: 31,
                          borderRadius: 8,
                          border:
                            "1px solid rgba(255,255,255,.12)",
                          background:
                            "rgba(255,255,255,.04)",
                          color: C.text,
                          fontSize: 18,
                          cursor:
                            "pointer",
                        }}
                      >
                        −
                      </button>

                      <strong
                        style={{
                          minWidth: 22,
                          textAlign: "center",
                        }}
                      >
                        {item.cantidad}
                      </strong>

                      <button
                        type="button"
                        onClick={() =>
                          changeQty(
                            item.producto_id,
                            1
                          )
                        }
                        disabled={busy}
                        style={{
                          width: 31,
                          height: 31,
                          borderRadius: 8,
                          border:
                            "1px solid rgba(255,255,255,.12)",
                          background:
                            "rgba(255,255,255,.04)",
                          color: C.green,
                          fontSize: 18,
                          cursor:
                            "pointer",
                        }}
                      >
                        +
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeItem(
                            item.producto_id
                          )
                        }
                        disabled={busy}
                        aria-label={`Eliminar ${item.nombre}`}
                        style={{
                          width: 29,
                          height: 29,
                          marginLeft: 2,
                          border: "none",
                          background:
                            "transparent",
                          color: C.red,
                          fontSize: 15,
                          cursor:
                            "pointer",
                        }}
                      >
                        🗑
                      </button>
                    </div>

                    <div
                      style={{
                        gridColumn:
                          "1 / -1",
                        textAlign: "right",
                        color: C.green,
                        fontWeight: 800,
                        fontSize: 12,
                        marginTop: -5,
                      }}
                    >
                      {itemDiscount(item) > 0 && <span style={{ color: C.purple, marginRight: 7, fontSize: 10 }}>Promoción aplicada</span>}
                      {COP(itemTotal(item))}
                    </div>
                  </div>
                ))}
              </div>

              {/* TOTAL */}
              <div
                style={{
                  padding: "13px 14px",
                  display: "flex",
                  justifyContent:
                    "space-between",
                  alignItems: "center",
                  background:
                    "rgba(0,0,0,.12)",
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                  }}
                >
                  Total del pedido
                </span>

                <strong
                  style={{
                    color: C.green,
                    fontSize: 20,
                  }}
                >
                  {COP(cartTotal)}
                </strong>
              </div>
            </div>
          )}

          {/* MENSAJE */}
          {message && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 9,
                background:
                  message.startsWith("✓")
                    ? "rgba(0,210,100,.08)"
                    : "rgba(255,70,70,.08)",
                border: message.startsWith("✓")
                  ? "1px solid rgba(0,210,100,.18)"
                  : "1px solid rgba(255,70,70,.18)",
                color: message.startsWith("✓")
                  ? C.green
                  : C.red,
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {message}
            </div>
          )}

          {turno && (tableOrderMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "10px 12px", borderRadius: 9, background: `${C.amber}12`, color: C.amber, fontSize: 13, fontWeight: 700 }}>
              <span>▦</span><span>Comanda para {mesa}</span>
            </div>
          ) : (
            <label style={{ display: "grid", gap: 6, marginTop: 14, color: C.sub, fontSize: 12 }}>
              Mesa del pedido
              {tables.length ? (
                <select style={s.sel} value={mesa} onChange={event => setMesa(event.target.value)} disabled={busy || Boolean(editingId)}>
                  <option value="">Selecciona una mesa</option>
                  {tables.map(table => <option key={table.id} value={table.nombre}>{table.nombre}</option>)}
                </select>
              ) : (
                <span style={{ color: tablesError ? C.red : C.sub }}>
                  {tablesError || "No hay mesas registradas. Barra puede crearlas desde el módulo Mesas."}
                </span>
              )}
            </label>
          ))}

          {/* ACCIÓN PRINCIPAL */}
          <button
            type="button"
            disabled={
              busy ||
              !turno ||
              !userId ||
              !mesa ||
              !items.length
            }
            onClick={submit}
            style={{
              ...s.btn("primary"),
              width: "100%",
              marginTop: 14,
              minHeight: 48,
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {busy
              ? "Guardando..."
              : singleOperator
              ? "✓ Registrar venta y cobrar"
              : barOrderMode
              ? "🚀 Registrar comanda"
              : editingId
              ? "✏️ Guardar cambios y avisar a barra"
              : "🚀 Enviar pedido a barra"}
          </button>

          {!turno && (
            <div
              style={{
                textAlign: "center",
                color: C.red,
                fontSize: 11,
                marginTop: 8,
              }}
            >
              Debes tener un turno abierto
              para crear comandas.
            </div>
          )}
        </div>
      </div>
      </>)}

      {!barOrderMode && view === "operacion" && (<>
      {/* COMANDAS */}
      <div
        style={{
          ...s.card,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "15px 16px",
            borderBottom:
              "1px solid rgba(255,255,255,.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              📋 Mis comandas
            </div>

            <div
              style={{
                color: C.sub,
                fontSize: 11,
                marginTop: 2,
              }}
            >
              Pedidos realizados durante este
              turno
            </div>
          </div>

          <span
            style={{
              padding: "5px 9px",
              borderRadius: 999,
              background:
                "rgba(255,255,255,.05)",
              color: C.sub,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {activeComandas.length}
          </span>
        </div>

        <div style={{ padding: 12 }}>
          {!turno && (
            <div
              style={{
                padding: 20,
                textAlign: "center",
                color: C.sub,
                fontSize: 13,
              }}
            >
              No hay turno abierto.
            </div>
          )}

          {turno && activeComandas.length === 0 && tableAccounts.length === 0 && (
            <div
              style={{
                padding: "28px 15px",
                textAlign: "center",
                color: C.sub,
              }}
            >
              <div
                style={{
                  fontSize: 32,
                  marginBottom: 8,
                }}
              >
                🧾
              </div>

              <div
                style={{
                  fontWeight: 700,
                  color: C.text,
                  marginBottom: 4,
                }}
              >
                Aún no tienes comandas
              </div>

              <div
                style={{
                  fontSize: 12,
                }}
              >
                Selecciona productos y comienza
                a agregar {singleOperator ? "la venta" : "la comanda"}.
              </div>
            </div>
          )}

          {turno && (activeComandas.length > 0 || tableAccounts.length > 0) && (
            <div className="waiter-order-tabs" role="tablist" aria-label={`Filtrar ${singleOperator ? "ventas" : "mis pedidos"} por estado`}>
              {orderStatusGroups.map(group => (
                <button
                  key={group.id}
                  id={`waiter-order-tab-${group.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeOrderStatus === group.id}
                  aria-controls="waiter-orders-panel"
                  className={`waiter-order-tab waiter-order-tab--${group.id}${activeOrderStatus === group.id ? " is-active" : ""}`}
                  onClick={() => {
                    setActiveOrderStatus(group.id);
                    setSelectedAccountId("");
                    setAccountOrdersError("");
                    orderPage.setPage(1);
                  }}
                >
                  <span>{group.title}</span><b>{group.id === "entregada_falta_pago" ? tableAccounts.length : ordersForStatus(group.id).length}</b>
                </button>
              ))}
            </div>
          )}

          {turno && (activeComandas.length > 0 || tableAccounts.length > 0) && (
            <div
              id="waiter-orders-panel"
              role="tabpanel"
              aria-labelledby={`waiter-order-tab-${activeOrderStatus}`}
              className={`waiter-orders-panel${isOpenAccountsTab ? selectedAccountId ? " waiter-orders-panel--account-detail" : " waiter-orders-panel--account-list" : ""}`}
            >
              {isOpenAccountsTab && !selectedAccountId ? (
                accountsError ? (
                  <div role="alert" className="waiter-orders-empty">{accountsError}</div>
                ) : tableAccounts.length === 0 ? (
                  <div className="waiter-orders-empty">No hay cuentas abiertas.</div>
                ) : (
                  <div className="waiter-account-grid">
                    {tableAccounts.map(account => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => {
                          setAccountOrdersError("");
                          setSelectedAccountId(account.id);
                          orderPage.setPage(1);
                        }}
                        className="waiter-account-card"
                        style={{ ...s.card, textAlign: "left", cursor: "pointer", borderColor: `${C.amber}65` }}
                      >
                        <span className="waiter-account-card__identity">
                          <strong>{account.mesa}</strong>
                          <span>{account.pedidos} pedido{account.pedidos === 1 ? "" : "s"}</span>
                        </span>
                        <strong className="waiter-account-card__total">{COP(account.total)}</strong>
                        <span className="waiter-account-card__status">
                          {account.pedidos_pendientes > 0
                            ? `${account.pedidos_pendientes} por despachar`
                            : "Lista para cerrar"}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <>
                  {isOpenAccountsTab && selectedAccountId && (
                    <div className="waiter-account-detail-header">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAccountId("");
                          orderPage.setPage(1);
                        }}
                        style={{ ...s.btn("ghost"), minHeight: 34, fontSize: 12 }}
                      >
                        ← Todas las cuentas
                      </button>
                      <div className="waiter-account-detail-summary">
                        <strong>{tableAccounts.find(account => account.id === selectedAccountId)?.mesa || "Cuenta"}</strong>
                        <span>{COP(tableAccounts.find(account => account.id === selectedAccountId)?.total || 0)}</span>
                      </div>
                      {(() => {
                        const account = tableAccounts.find(row => row.id === selectedAccountId);
                        if (!account) return null;
                        return (
                          <div className="waiter-account-detail-actions">
                            <select
                              aria-label="Medio de pago de la cuenta"
                              style={s.sel}
                              value={accountPaymentMethod}
                              onChange={event => setAccountPaymentMethod(event.target.value)}
                              disabled={busy}
                            >
                              <option value="efectivo">Efectivo</option>
                              <option value="tarjeta">Tarjeta</option>
                              <option value="transferencia">Transferencia</option>
                            </select>
                            <button
                              type="button"
                              disabled={busy || account.pedidos_pendientes > 0}
                              onClick={() => void closeTableAccount(account)}
                              style={{ ...s.btn("success"), minHeight: 38, fontSize: 12 }}
                              title={account.pedidos_pendientes > 0 ? "Primero deben despacharse todos los pedidos." : ""}
                            >
                              {account.pedidos_pendientes > 0
                                ? `${account.pedidos_pendientes} por despachar`
                                : account.total > 0 ? "Cerrar y cobrar" : "Cerrar cuenta vacía"}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {isOpenAccountsTab && accountOrdersLoading ? (
                    <div className="waiter-orders-empty">Cargando pedidos de la mesa...</div>
                  ) : accountOrdersError ? (
                    <div role="alert" className="waiter-orders-empty">{accountOrdersError}</div>
                  ) : visibleOrders.length === 0 ? (
                    <div className="waiter-orders-empty">{isOpenAccountsTab ? "Esta cuenta no tiene pedidos activos." : "No hay pedidos en esta categoría."}</div>
                  ) : orderPage.pageItems.map(comanda => {
            const isPending =
              comanda.estado === "enviada";

            const isEditing =
              editingId === comanda.id;
            const canManageOrder =
              String(comanda.mesero_id) === String(userId);

            return (
              <div
                key={comanda.id}
                className="waiter-order-card"
                style={{
                  borderRadius: 13,
                  border: isEditing
                    ? `1px solid ${C.amber}`
                    : "1px solid rgba(255,255,255,.08)",
                  background:
                    "rgba(255,255,255,.025)",
                  padding: 12,
                  marginBottom: 8,
                }}
              >
                {/* CABECERA COMANDA */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent:
                      "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 15,
                      }}
                    >
                      Comanda #{comanda.consecutivo || "—"}
                    </div>

                    <div
                      style={{
                        color: C.sub,
                        fontSize: 12,
                        marginTop: 5,
                      }}
                    >
                      {comanda.mesa && <strong style={{ display: "block", color: C.amber, marginBottom: 3 }}>Mesa: {comanda.mesa}</strong>}
                      {singleOperator ? "Atendió" : "Mesero"}: {comanda.mesero_nombre || userName} · Pedido de las{" "}
                      {formatLocalTime(comanda.creado_en)}
                    </div>
                  </div>

                  <Badge
                    color={
                      STATUS_COLOR[
                        comanda.estado
                      ] || C.sub
                    }
                    small
                  >
                    {STATUS_LABEL[
                      comanda.estado
                    ] || comanda.estado}
                  </Badge>
                </div>

                {/* TOTAL */}
                <div className="waiter-order-card__summary">
                  <span>{comanda.mesa ? `Mesa ${comanda.mesa}` : "Comanda"} · Total</span>
                  <strong>{COP(comanda.total)}</strong>
                </div>

                {/* VER PRODUCTOS */}
                <div style={{ marginTop: 7 }}>
                  <button className="waiter-order-card__details" style={{ ...s.btn("ghost"), padding: "6px 10px", fontSize: 11, minHeight: 32 }} type="button" disabled={busy} onClick={() => toggleDetails(comanda)}>
                    {expandedId === comanda.id ? "Ocultar productos" : "Ver productos"}
                  </button>
                </div>

                {expandedId === comanda.id && (
                  <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>Comparación de pedido vs inventario</div>
                    {(itemDetails[comanda.id] || []).map(item => {
                      const productStock = Number(productos.find(p => p.id === item.producto_id)?.stock || 0);
                      const available = productStock >= item.cantidad;
                      return (
                        <div key={item.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}50`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 650, fontSize: 14 }}>{item.nombre}</span>
                              <span style={{ 
                                display: "inline-flex", alignItems: "center", gap: 4, 
                                background: available ? "rgba(52, 211, 153, 0.15)" : "rgba(248, 113, 113, 0.15)", 
                                padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                color: available ? C.green : C.red
                              }}>
                                Pide {item.cantidad} <span style={{ color: C.sub, opacity: 0.7, fontWeight: 400 }}>/</span> Stock {productStock}
                              </span>
                            </div>
                          </div>
                          <strong style={{ color: C.green, fontSize: 13, flexShrink: 0 }}>{COP(Number(item.cantidad) * Number(item.precio_unitario))}</strong>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ACCIONES */}
                {isPending && canManageOrder && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: 8,
                      marginTop: 11,
                    }}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        startEdit(comanda)
                      }
                      style={{
                        ...s.btn("ghost"),
                        minHeight: 38,
                        fontSize: 12,
                      }}
                    >
                      ✏️ Modificar
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        cancel(comanda)
                      }
                      style={{
                        ...s.btn("danger"),
                        minHeight: 38,
                        fontSize: 12,
                      }}
                    >
                      ✕ Cancelar
                    </button>
                  </div>
                )}

                {comanda.estado === "entregada_falta_pago" && (
                  <div style={{ marginTop: 11, padding: 10, borderRadius: 9, background: "rgba(245,158,11,.10)", border: `1px solid ${C.amber}45` }}>
                    <div style={{ color: C.amber, fontSize: 12 }}>
                      Pedido despachado. El pago se registra una sola vez al cerrar la cuenta completa de {comanda.mesa}.
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div
                    style={{
                      marginTop: 8,
                      color: C.amber,
                      fontSize: 10,
                      textAlign: "center",
                    }}
                  >
                    Esta comanda está siendo
                    modificada arriba.
                  </div>
                )}
              </div>
              );
            })}
              <PaginationTabs totalItems={visibleOrders.length} page={orderPage.page} onPageChange={orderPage.setPage} />
              </>
              )}
            </div>
          )}
        </div>
      </div>
      </>)}
    </div>
  );
}
