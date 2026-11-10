import { useCallback, useEffect, useMemo, useState } from "react";
import { COP } from "../../constants/theme.js";
import {
  localCreateStoreAppointment,
  localFetchStoreAppointments,
  localFetchStorePersonnel,
  localRegisterStoreAppointmentPayment,
  localUpdateStoreAppointment,
} from "../../lib/localApi.js";
import { PaginationTabs, SectionTitle, useListPagination } from "../common/index.jsx";

const dateKey = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const monthStart = date => new Date(date.getFullYear(), date.getMonth(), 1);
const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const weekRange = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { from: dateKey(start), to: dateKey(end) };
};

const nextAppointmentTime = (date = new Date()) => {
  const rounded = new Date(date);
  rounded.setMinutes(rounded.getMinutes() + 60 - (rounded.getMinutes() % 30), 0, 0);
  return `${dateKey(rounded)}T${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}`;
};

const addMinutesToLocalDateTime = (value, minutes) => {
  const [date, time] = String(value || "").split("T");
  const [year, month, day] = (date || "").split("-").map(Number);
  const [hour, minute] = (time || "").split(":").map(Number);
  const next = new Date(year, month - 1, day, hour, minute + minutes);
  return `${dateKey(next)}T${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
};

const localDateTimeMinutes = value => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const [, year, month, day, hour, minute] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) / 60000;
};

const MAX_APPOINTMENT_MINUTES = 4 * 60;

const initialAppointment = (date = dateKey()) => {
  const startsAt = `${date}T${nextAppointmentTime().slice(11, 16)}`;
  return {
    cliente_nombre: "",
    cliente_cedula: "",
    cliente_telefono: "",
    tatuador: "",
    personal_id: "",
    servicio: "",
    fecha_hora: startsAt,
    fecha_fin: addMinutesToLocalDateTime(startsAt, 120),
    precio_acordado: "",
    abono_inicial: "",
    medio_pago: "efectivo",
    notas: "",
  };
};

const statusLabel = {
  agendada: "Agendada",
  completada: "Completada",
  cancelada: "Cancelada",
};

const dateLabel = value => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const time = value.slice(11, 16);
  const date = new Date(year, month - 1, day);
  const formattedDate = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return time ? `${formattedDate} · ${time}` : formattedDate;
};

const moneyValue = amount => COP(Number(amount || 0));

export default function CitasTienda({ negocio, userId, canManage, onToggle, onManagePersonnel }) {
  const [appointments, setAppointments] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  const [form, setForm] = useState(initialAppointment);
  const [continuationAppointment, setContinuationAppointment] = useState(null);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => dateKey());
  const [paymentFilter, setPaymentFilter] = useState("pendientes");
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [activePaymentId, setActivePaymentId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ monto: "", medio_pago: "efectivo" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const from = dateKey(visibleMonth);
  const to = dateKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0));
  const today = dateKey();
  const currentWeek = weekRange();
  const appointmentsFrom = canManage ? from : currentWeek.from;
  const appointmentsTo = canManage ? to : currentWeek.to;

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await localFetchStoreAppointments(negocio.id, appointmentsFrom, appointmentsTo);
      if (!Array.isArray(result)) throw new Error("El servidor devolvió una lista de citas inválida.");
      setAppointments(result);
    } catch (loadError) {
      setError(loadError.message || "No fue posible cargar las citas.");
    } finally {
      setLoading(false);
    }
  }, [negocio.id, appointmentsFrom, appointmentsTo]);

  useEffect(() => { void loadAppointments(); }, [loadAppointments]);
  useEffect(() => {
    let active = true;
    localFetchStorePersonnel(negocio.id).then(result => {
      if (!Array.isArray(result)) throw new Error("El servidor devolvió una lista de personal inválida.");
      if (active) setPersonnel(result.filter(person => person.activo));
    }).catch(loadError => {
      if (active) setError(loadError.message || "No fue posible cargar el personal para las citas.");
    });
    return () => { active = false; };
  }, [negocio.id]);

  const appointmentsByDay = useMemo(() => {
    const grouped = new Map();
    for (const appointment of appointments) {
      const day = String(appointment.fecha_hora || "").slice(0, 10);
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day).push(appointment);
    }
    for (const dayAppointments of grouped.values()) {
      dayAppointments.sort((first, second) => first.fecha_hora.localeCompare(second.fecha_hora));
    }
    return grouped;
  }, [appointments]);

  const selectedAppointments = appointmentsByDay.get(selectedDate) || [];
  const weekAppointments = appointments
    .filter(appointment => appointment.estado === "agendada"
      && appointment.fecha_hora.slice(0, 10) >= currentWeek.from
      && appointment.fecha_hora.slice(0, 10) <= currentWeek.to)
    .sort((first, second) => first.fecha_hora.localeCompare(second.fecha_hora));
  const paymentFilterAppointments = canManage ? appointments : weekAppointments;
  const unpaidAppointments = paymentFilterAppointments.filter(appointment => Number(appointment.saldo) > 0);
  const paidAppointments = paymentFilterAppointments.filter(appointment => Number(appointment.saldo) === 0);
  const paymentAppointments = paymentFilter === "pendientes" ? unpaidAppointments : paidAppointments;
  const paymentPage = useListPagination(
    canManage ? selectedAppointments.filter(appointment => paymentFilter === "pendientes"
      ? Number(appointment.saldo) > 0
      : Number(appointment.saldo) === 0) : paymentAppointments,
  );
  const monthSummary = useMemo(() => appointments.reduce((totals, appointment) => {
    totals.count += 1;
    totals.received += Number(appointment.monto_pagado || 0);
    totals.balance += Number(appointment.saldo || 0);
    return totals;
  }, { count: 0, received: 0, balance: 0 }), [appointments]);

  const calendarCells = useMemo(() => {
    const first = monthStart(visibleMonth);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(first.getFullYear(), first.getMonth(), index - startOffset + 1);
      return { key: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === first.getMonth() };
    });
  }, [visibleMonth]);

  const updateForm = (key, value) => setForm(current => {
    if (key === "fecha_fin") return { ...current, fecha_fin: value };
    if (key !== "fecha_hora") return { ...current, [key]: value };
    const duration = new Date(current.fecha_fin).getTime() - new Date(current.fecha_hora).getTime();
    return {
      ...current,
      fecha_hora: value,
      fecha_fin: Number.isFinite(duration) && duration > 0
        ? addMinutesToLocalDateTime(value, Math.min(MAX_APPOINTMENT_MINUTES, Math.round(duration / 60000)))
        : addMinutesToLocalDateTime(value, 120),
    };
  });

  const appointmentDuration = localDateTimeMinutes(form.fecha_fin) - localDateTimeMinutes(form.fecha_hora);
  const appointmentTooLong = appointmentDuration > MAX_APPOINTMENT_MINUTES;

  const proposedConflict = useMemo(() => {
    if (!form.personal_id || !form.fecha_hora || !form.fecha_fin) return null;
    return appointments.find(appointment =>
      appointment.estado === "agendada"
      && appointment.personal_id === form.personal_id
      && appointment.fecha_hora < form.fecha_fin
      && appointment.fecha_fin > form.fecha_hora
    ) || null;
  }, [appointments, form.personal_id, form.fecha_hora, form.fecha_fin]);

  const showDate = nextDate => {
    const nextMonth = monthStart(new Date(
      Number(nextDate.slice(0, 4)),
      Number(nextDate.slice(5, 7)) - 1,
      1,
    ));
    setSelectedDate(nextDate);
    if (monthKey(nextMonth) !== monthKey(visibleMonth)) setVisibleMonth(nextMonth);
    updateForm("fecha_hora", `${nextDate}T${form.fecha_hora.slice(11, 16) || "09:00"}`);
    paymentPage.setPage(1);
    setError("");
  };

  const changeMonth = delta => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1);
    setVisibleMonth(nextMonth);
    const nextDate = dateKey(nextMonth);
    setSelectedDate(nextDate);
    updateForm("fecha_hora", `${nextDate}T${form.fecha_hora.slice(11, 16) || "09:00"}`);
    paymentPage.setPage(1);
  };

  const createAppointment = async event => {
    event.preventDefault();
    if (saving || !userId) return;
    const price = Number(form.precio_acordado);
    const initialPayment = Number(form.abono_inicial || 0);
    const maximumPayment = continuationAppointment ? Number(continuationAppointment.saldo) : price;
    const clientId = form.cliente_cedula.trim();
    if (clientId.length < 5 || clientId.length > 20) {
      setError("La cédula debe tener entre 5 y 20 caracteres.");
      return;
    }
    if (!Number.isSafeInteger(price) || price < 1
      || !Number.isSafeInteger(initialPayment) || initialPayment < 0 || initialPayment > maximumPayment) {
      setError(`El precio debe ser un entero mayor que cero y el abono no puede superar el saldo pendiente de ${moneyValue(maximumPayment)}.`);
      return;
    }
    if (!form.personal_id || !form.fecha_hora || !form.fecha_fin || form.fecha_fin <= form.fecha_hora) {
      setError("Selecciona un profesional y un horario de inicio y fin válido.");
      return;
    }
    if (appointmentTooLong) {
      setError("Una cita no puede durar más de 4 horas.");
      return;
    }
    if (proposedConflict) {
      setError(`${form.tatuador} está ocupada de ${proposedConflict.fecha_hora.slice(11, 16)} hasta ${proposedConflict.fecha_fin.slice(11, 16)} por la cita de ${proposedConflict.servicio}.`);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await localCreateStoreAppointment({
        negocio_id: negocio.id,
        cliente_nombre: form.cliente_nombre.trim(),
        cliente_cedula: clientId,
        cliente_telefono: form.cliente_telefono.trim(),
        personal_id: form.personal_id,
        servicio: form.servicio.trim(),
        fecha_hora: form.fecha_hora,
        fecha_fin: form.fecha_fin,
        precio_acordado: price,
        cita_origen_id: continuationAppointment?.id,
        abono_inicial: initialPayment,
        medio_pago: form.medio_pago,
        notas: form.notas.trim(),
      });
      const appointmentDate = form.fecha_hora.slice(0, 10);
      const appointmentMonth = monthStart(new Date(
        Number(form.fecha_hora.slice(0, 4)),
        Number(form.fecha_hora.slice(5, 7)) - 1,
        1,
      ));
      const appointmentMonthFrom = dateKey(appointmentMonth);
      const appointmentMonthTo = dateKey(new Date(
        appointmentMonth.getFullYear(),
        appointmentMonth.getMonth() + 1,
        0,
      ));
      setSelectedDate(appointmentDate);
      setVisibleMonth(appointmentMonth);
      setForm(initialAppointment(appointmentDate));
      setContinuationAppointment(null);
      setShowAppointmentForm(false);
      setMessage(continuationAppointment
        ? initialPayment
          ? "Cita de seguimiento guardada. El precio se conservó y el nuevo abono quedó registrado como ingreso de hoy."
          : "Cita de seguimiento guardada. El precio, lo abonado y el saldo se conservaron."
        : initialPayment
          ? "Cita guardada y abono registrado como ingreso de hoy. El saldo sigue pendiente."
          : "Cita guardada correctamente.");
      if (appointmentMonthFrom === from && appointmentMonthTo === to) await loadAppointments();
    } catch (saveError) {
      setError(saveError.message || "No fue posible guardar la cita.");
    } finally {
      setSaving(false);
    }
  };

  const registerPayment = async (event, appointment) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await localRegisterStoreAppointmentPayment(appointment.id, {
        monto: Number(paymentForm.monto),
        medio_pago: paymentForm.medio_pago,
      });
      setActivePaymentId(null);
      setPaymentForm({ monto: "", medio_pago: "efectivo" });
      setMessage("Abono registrado como ingreso del día. El saldo de la cita fue actualizado.");
      await loadAppointments();
    } catch (saveError) {
      setError(saveError.message || "No fue posible registrar el abono.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (appointment, status) => {
    const confirmation = status === "cancelada"
      ? "¿Cancelar esta cita? Los abonos recibidos se conservarán en el historial de ingresos."
      : status === "completada"
        ? "¿Marcar esta cita como completada? El saldo pendiente seguirá visible."
        : "¿Reabrir esta cita?";
    if (!window.confirm(confirmation)) return;
    setError("");
    setMessage("");
    try {
      await localUpdateStoreAppointment(appointment.id, status);
      setAppointments(current => current.map(item => item.id === appointment.id ? { ...item, estado: status } : item));
      setMessage(`Cita marcada como ${statusLabel[status].toLocaleLowerCase("es")}.`);
    } catch (updateError) {
      setError(updateError.message || "No fue posible actualizar la cita.");
    }
  };

  const toggleModule = async () => {
    if (!canManage || toggling) return;
    setToggling(true);
    setError("");
    try {
      await onToggle(false);
    } catch (toggleError) {
      setError(toggleError.message || "No fue posible desactivar el módulo.");
    } finally {
      setToggling(false);
    }
  };

  const scheduleAnotherAppointment = appointment => {
    const scheduledDate = appointment.fecha_hora.slice(0, 10);
    const nextDate = scheduledDate >= today ? scheduledDate : today;
    const nextMonth = monthStart(new Date(
      Number(nextDate.slice(0, 4)),
      Number(nextDate.slice(5, 7)) - 1,
      1,
    ));
    const followUpStart = `${nextDate}T${nextAppointmentTime().slice(11, 16)}`;
    setVisibleMonth(nextMonth);
    setSelectedDate(nextDate);
    setForm({
      ...initialAppointment(nextDate),
      cliente_nombre: appointment.cliente_nombre || "",
      cliente_cedula: appointment.cliente_cedula || "",
      cliente_telefono: appointment.cliente_telefono || "",
      tatuador: appointment.tatuador || "",
      personal_id: appointment.personal_id || "",
      servicio: appointment.servicio || "",
      fecha_hora: followUpStart,
      fecha_fin: addMinutesToLocalDateTime(followUpStart, 120),
      precio_acordado: String(appointment.precio_acordado),
    });
    setContinuationAppointment(appointment);
    setShowAppointmentForm(true);
    setError("");
    setMessage(`Cita de seguimiento para ${appointment.cliente_nombre}. Se conservarán el precio acordado y el saldo acumulado.`);
    window.setTimeout(() => document.querySelector(".store-appointments__form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const renderAppointmentInformation = appointment => {
    const fullyPaid = Number(appointment.saldo) === 0;
    const canTakePayment = appointment.estado !== "cancelada" && !fullyPaid;
    return (
      <>
        <div className="store-appointment__identity">
          <span><b>Cédula</b> {appointment.cliente_cedula || "Sin registrar"}</span>
          <span><b>Teléfono</b> {appointment.cliente_telefono || "Sin teléfono"}</span>
        </div>
        <div className="store-appointment__details">
          <div><span>Servicio</span><strong>{appointment.servicio}</strong></div>
          <div><span>Profesional · horario</span><strong>{appointment.tatuador} · {appointment.fecha_hora.slice(11, 16)}–{appointment.fecha_fin?.slice(11, 16) || "--:--"}</strong></div>
          {appointment.notas && <p>{appointment.notas}</p>}
        </div>
        <div className="store-appointment__money">
          <div><span>Precio</span><strong>{moneyValue(appointment.precio_acordado)}</strong></div>
          <div><span>Abonado</span><strong className="is-received">{moneyValue(appointment.monto_pagado)}</strong></div>
          <div><span>Saldo</span><strong className={fullyPaid ? "is-settled" : "is-balance"}>{moneyValue(appointment.saldo)}</strong></div>
        </div>
        {!!appointment.pagos?.length && (
          <details className="store-appointment__payments">
            <summary>{appointment.pagos.length} {appointment.pagos.length === 1 ? "abono registrado" : "abonos registrados"}</summary>
            {appointment.pagos.map(payment => (
              <div key={payment.id}>
                <span>{payment.fecha} · {payment.medio_pago}</span>
                <strong>{moneyValue(payment.monto)}</strong>
              </div>
            ))}
          </details>
        )}
        {activePaymentId === appointment.id && (
          <form className="store-appointment__payment-form" onSubmit={event => void registerPayment(event, appointment)}>
            <label>Nuevo abono
              <input type="number" min="1" step="1" max={appointment.saldo} value={paymentForm.monto} onChange={event => setPaymentForm(current => ({ ...current, monto: event.target.value }))} placeholder={`Máximo ${appointment.saldo}`} required />
            </label>
            <label>Medio de pago
              <select value={paymentForm.medio_pago} onChange={event => setPaymentForm(current => ({ ...current, medio_pago: event.target.value }))}>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </label>
            <div>
              <button type="button" onClick={() => setActivePaymentId(null)}>Cancelar</button>
              <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Registrar abono"}</button>
            </div>
          </form>
        )}
        <div className="store-appointment__actions">
          {canTakePayment && <button type="button" onClick={() => {
            setActivePaymentId(appointment.id);
            setPaymentForm({ monto: "", medio_pago: "efectivo" });
          }}>＋ Registrar abono</button>}
          {canManage && Number(appointment.saldo) > 0 && (
            <button type="button" onClick={() => scheduleAnotherAppointment(appointment)}>＋ Agendar otra cita</button>
          )}
          {appointment.estado === "agendada" && (
            <>
              <button type="button" onClick={() => void updateStatus(appointment, "completada")}>Marcar completada</button>
              <button type="button" className="is-danger" onClick={() => void updateStatus(appointment, "cancelada")}>Cancelar cita</button>
            </>
          )}
          {appointment.estado === "cancelada" && (
            <button type="button" onClick={() => void updateStatus(appointment, "agendada")}>Reabrir cita</button>
          )}
        </div>
      </>
    );
  };

  const renderAppointment = appointment => (
    <article className={`store-appointment${canManage ? "" : " is-compact"}`} key={appointment.id}>
      <div className="store-appointment__time">
        <strong>{appointment.fecha_hora.slice(11, 16)}–{appointment.fecha_fin?.slice(11, 16) || "--:--"}</strong>
        {canManage && <span>{appointment.estado === "cancelada" ? "Cancelada" : "Reserva"}</span>}
      </div>
      <div className="store-appointment__body">
        <div className="store-appointment__top">
          <h3>{appointment.cliente_nombre}</h3>
          {canManage && <span className={`store-appointment__status is-${appointment.estado}`}>{statusLabel[appointment.estado] || appointment.estado}</span>}
        </div>
        {!canManage && (
          <div className="store-appointment__compact-service">
            <span>{appointment.servicio}</span>
            <span className="store-appointment__compact-id">Cédula: {appointment.cliente_cedula || "Sin registrar"}</span>
          </div>
        )}
        {!canManage && Number(appointment.saldo) > 0 && (
          <button type="button" className="store-appointment__follow-up" onClick={() => scheduleAnotherAppointment(appointment)}>
            ＋ Agendar otra cita para este cliente
          </button>
        )}
        {canManage
          ? renderAppointmentInformation(appointment)
          : (
            <details className="store-appointment__more">
              <summary>Ver detalles y acciones</summary>
              <div className="store-appointment__more-content">
                <span className={`store-appointment__status is-${appointment.estado}`}>{statusLabel[appointment.estado] || appointment.estado}</span>
                {renderAppointmentInformation(appointment)}
              </div>
            </details>
          )}
      </div>
    </article>
  );

  return (
    <main className="store-appointments">
      <header className="store-appointments__hero">
        <div>
          <span className="store-appointments__eyebrow">AGENDA Y SERVICIOS</span>
          <SectionTitle>Agenda de citas</SectionTitle>
          <p>{negocio.name} · {canManage
            ? "Organiza tus reservas, evita cruces de horario por profesional y lleva el control de abonos y saldos."
            : "Consulta las citas del mes. Cada fila muestra el cliente, el servicio y la hora."}</p>
        </div>
        {canManage && (
          <button type="button" className="store-appointments__disable" disabled={toggling} onClick={() => void toggleModule()}>
            {toggling ? "Guardando..." : "Desactivar agenda"}
          </button>
        )}
      </header>

      {(error || message) && (
        <div className={`store-appointments__notice${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
          <span aria-hidden="true">{error ? "!" : "✓"}</span>{error || message}
          {error && <button type="button" onClick={() => setError("")} aria-label="Cerrar aviso">×</button>}
        </div>
      )}

      {canManage && (
        <section className="store-appointments__summary" aria-label="Resumen del mes">
          <div><span>Citas este mes</span><strong>{monthSummary.count}</strong></div>
          <div><span>Abonos recibidos</span><strong className="is-received">{moneyValue(monthSummary.received)}</strong></div>
          <div><span>Saldo pendiente</span><strong className="is-balance">{moneyValue(monthSummary.balance)}</strong></div>
        </section>
      )}

      {(canManage || showAppointmentForm) && <div className="store-appointments__top-grid">
        {canManage && <section className="store-appointments__panel store-appointments__calendar-panel">
          <div className="store-appointments__calendar-heading">
            <div>
              <span className="store-appointments__eyebrow">CALENDARIO</span>
              <h2>{new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(visibleMonth)}</h2>
              <p>Selecciona un día para ver sus reservas.</p>
            </div>
            <div className="store-appointments__calendar-controls">
              <button type="button" aria-label="Mes anterior" onClick={() => changeMonth(-1)}>‹</button>
              <button type="button" className="is-today" onClick={() => {
                const currentMonth = monthStart(new Date());
                setVisibleMonth(currentMonth);
                setSelectedDate(today);
                updateForm("fecha_hora", `${today}T${form.fecha_hora.slice(11, 16) || "09:00"}`);
              }}>Hoy</button>
              <button type="button" aria-label="Mes siguiente" onClick={() => changeMonth(1)}>›</button>
            </div>
          </div>

          <div className="store-appointments__calendar-grid" role="group" aria-label="Calendario mensual">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(day => (
              <div className="store-appointments__weekday" key={day}>{day}</div>
            ))}
            {calendarCells.map(cell => {
              const dayAppointments = appointmentsByDay.get(cell.key) || [];
              const isSelected = selectedDate === cell.key;
              return (
                <button
                  type="button"
                  aria-label={`${cell.key}, ${dayAppointments.length} ${dayAppointments.length === 1 ? "cita" : "citas"}`}
                  aria-pressed={isSelected}
                  key={cell.key}
                  className={[
                    "store-appointments__day",
                    cell.inMonth ? "" : "is-outside",
                    cell.key === today ? "is-today" : "",
                    isSelected ? "is-selected" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => showDate(cell.key)}
                >
                  <span className="store-appointments__day-number">{cell.day}</span>
                  {dayAppointments.length > 0 && (
                    <span className="store-appointments__day-events">
                      <span>{dayAppointments.length}</span>
                      <i aria-hidden="true" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="store-appointments__legend">
            <span><i className="is-booked" />Día con citas</span>
            <span><i className="is-today" />Hoy</span>
          </div>
        </section>}

        <section className="store-appointments__panel store-appointments__form-panel">
          <div className="store-appointments__form-heading">
            <span className="store-appointments__step">＋</span>
            <div><h2>{continuationAppointment ? "Agendar seguimiento" : "Agendar cliente"}</h2><p>Reserva para {dateLabel(`${selectedDate}T`).split(" · ")[0]}.</p></div>
          </div>
          {appointmentTooLong && (
            <div className="store-appointments__notice is-error" role="alert">
              <span aria-hidden="true">!</span>
              Una cita no puede durar más de 4 horas.
            </div>
          )}
          {continuationAppointment && (
            <div className="store-appointments__continuation-summary">
              <strong>La cuenta se mantiene en la misma línea</strong>
              <span>Precio acordado: {moneyValue(continuationAppointment.precio_acordado)}</span>
              <span>Abonado hasta ahora: {moneyValue(continuationAppointment.monto_pagado)}</span>
              <span>Saldo pendiente: {moneyValue(continuationAppointment.saldo)}</span>
            </div>
          )}
          {proposedConflict && (
            <div className="store-appointments__notice is-error" role="alert">
              <span aria-hidden="true">!</span>
              {form.tatuador} está ocupada de {proposedConflict.fecha_hora.slice(11, 16)} hasta {proposedConflict.fecha_fin.slice(11, 16)} en la cita de {proposedConflict.servicio}. Elige otro horario o profesional.
            </div>
          )}
          {!personnel.length && (
            <div className="store-appointments__notice is-error" role="status">
              <span aria-hidden="true">!</span>
              Agrega al menos una persona desde Personal antes de agendar.
              {onManagePersonnel && <button type="button" onClick={onManagePersonnel}>Ir a Personal</button>}
            </div>
          )}
          <form className="store-appointments__form" onSubmit={createAppointment}>
            <label>
              Nombre completo
              <input value={form.cliente_nombre} maxLength={120} onChange={event => updateForm("cliente_nombre", event.target.value)} placeholder="Nombre del cliente" autoComplete="name" required />
            </label>
            <label>
              Cédula
              <input value={form.cliente_cedula} maxLength={20} minLength={5} onChange={event => updateForm("cliente_cedula", event.target.value)} placeholder="Número de identificación" autoComplete="off" required />
            </label>
            <label>
              Teléfono <span>Opcional</span>
              <input value={form.cliente_telefono} maxLength={40} onChange={event => updateForm("cliente_telefono", event.target.value)} placeholder="Número de contacto" autoComplete="tel" />
            </label>
            <label>
              Profesional
              <select
                value={form.personal_id}
                onChange={event => {
                  const person = personnel.find(item => item.id === event.target.value);
                  setForm(current => ({
                    ...current,
                    personal_id: event.target.value,
                    tatuador: person?.nombre || "",
                  }));
                }}
                required
              >
                <option value="">Selecciona un profesional</option>
                {personnel.map(person => <option key={person.id} value={person.id}>{person.nombre}</option>)}
              </select>
            </label>
            <label className="is-wide">
              Inicio de la cita
              <input type="datetime-local" value={form.fecha_hora} onChange={event => {
                const value = event.target.value;
                if (!value) return;
                updateForm("fecha_hora", value);
                const nextDate = value.slice(0, 10);
                setSelectedDate(nextDate);
                const nextMonth = monthStart(new Date(
                  Number(nextDate.slice(0, 4)),
                  Number(nextDate.slice(5, 7)) - 1,
                  1,
                ));
                setVisibleMonth(nextMonth);
              }} required />
            </label>
            <label className="is-wide">
              Fin de la cita
              <input
                type="datetime-local"
                min={form.fecha_hora}
                max={form.fecha_hora ? addMinutesToLocalDateTime(form.fecha_hora, MAX_APPOINTMENT_MINUTES) : undefined}
                value={form.fecha_fin}
                onChange={event => updateForm("fecha_fin", event.target.value)}
                required
              />
            </label>
            <label className="is-wide">
              Servicio o trabajo
              <textarea value={form.servicio} maxLength={500} onChange={event => updateForm("servicio", event.target.value)} placeholder="Describe el servicio o la sesión" rows={2} required />
            </label>
            <label>
              {continuationAppointment ? "Precio acordado (se conserva)" : "Precio acordado (COP)"}
              <input type="number" min="1" step="1" value={form.precio_acordado} onChange={event => updateForm("precio_acordado", event.target.value)} placeholder="Precio del servicio" readOnly={Boolean(continuationAppointment)} required />
            </label>
            <label>
              {continuationAppointment ? "Nuevo abono" : "Abono inicial"} <span>Opcional</span>
              <input type="number" min="0" step="1" max={continuationAppointment?.saldo ?? form.precio_acordado ?? undefined} value={form.abono_inicial} onChange={event => updateForm("abono_inicial", event.target.value)} placeholder="0" />
            </label>
            {Number(form.abono_inicial) > 0 && (
              <label className="is-wide">
                Medio de pago del abono
                <select value={form.medio_pago} onChange={event => updateForm("medio_pago", event.target.value)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </label>
            )}
            <label className="is-wide">
              Notas <span>Opcional</span>
              <textarea value={form.notas} maxLength={1000} onChange={event => updateForm("notas", event.target.value)} placeholder="Detalles útiles para la cita" rows={2} />
            </label>
            <div className="store-appointments__form-foot">
              {Number(form.precio_acordado) > 0 && (
                <span>Saldo después del abono <strong>{moneyValue(Math.max(0, Number(continuationAppointment?.saldo ?? form.precio_acordado) - Number(form.abono_inicial || 0)))}</strong></span>
              )}
              <button type="submit" disabled={saving || !userId || !personnel.length || Boolean(proposedConflict) || appointmentTooLong}>{saving ? "Guardando cita..." : "Guardar cita"}</button>
            </div>
          </form>
        </section>
      </div>}

      {!canManage && <section className="store-appointments__panel store-appointments__list-panel">
        <div className="store-appointments__day-heading">
          <div>
            <span className="store-appointments__eyebrow">CITAS AGENDADAS DE ESTA SEMANA</span>
            <h2>{dateLabel(currentWeek.from)} — {dateLabel(currentWeek.to)}</h2>
            <p>{weekAppointments.length} {weekAppointments.length === 1 ? "cita agendada" : "citas agendadas"}, ordenadas de la más cercana a la más lejana.</p>
          </div>
          <div className="store-appointments__bar-controls">
            <button type="button" className="store-appointments__new-button" onClick={() => {
              setShowAppointmentForm(current => !current);
              if (!showAppointmentForm) {
                setContinuationAppointment(null);
                setForm(initialAppointment(selectedDate));
                window.setTimeout(() => document.querySelector(".store-appointments__form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
              }
            }}>{showAppointmentForm ? "Cerrar formulario" : "＋ Nueva cita"}</button>
          </div>
        </div>

        <div className="appointment-payment-tabs" role="tablist" aria-label="Filtrar citas por pago">
          <button type="button" role="tab" aria-selected={paymentFilter === "pendientes"} className={paymentFilter === "pendientes" ? "is-active" : ""} onClick={() => { setPaymentFilter("pendientes"); paymentPage.setPage(1); }}>
            Pendientes de pago <b>{unpaidAppointments.length}</b>
          </button>
          <button type="button" role="tab" aria-selected={paymentFilter === "pagadas"} className={paymentFilter === "pagadas" ? "is-active" : ""} onClick={() => { setPaymentFilter("pagadas"); paymentPage.setPage(1); }}>
            Pagadas <b>{paidAppointments.length}</b>
          </button>
        </div>

        {loading ? <div className="store-appointments__empty">Cargando citas...</div> : !paymentAppointments.length ? (
          <div className="store-appointments__empty">
            <span aria-hidden="true">▦</span>
            <strong>{paymentFilter === "pendientes" ? "No hay citas pendientes de pago" : "Todavía no hay citas completamente pagadas"}</strong>
            <p>Las citas aparecerán aquí organizadas por fecha.</p>
          </div>
        ) : (
          <div className="store-appointments__bar-list">
            {[...new Map(paymentPage.pageItems.map(appointment => [
              appointment.fecha_hora.slice(0, 10),
              paymentPage.pageItems.filter(item => item.fecha_hora.slice(0, 10) === appointment.fecha_hora.slice(0, 10)),
            ])).entries()].map(([day, dayAppointments]) => (
              <section className="store-appointments__bar-day" key={day}>
                <header className="store-appointments__bar-day-heading">
                  <h3>{dateLabel(day)}</h3>
                  <span>{dayAppointments.length} {dayAppointments.length === 1 ? "cita" : "citas"}</span>
                </header>
                <div className="store-appointments__list store-appointments__bar-day-list">
                  {dayAppointments.map(renderAppointment)}
                </div>
              </section>
            ))}
          </div>
        )}
        <PaginationTabs totalItems={paymentAppointments.length} page={paymentPage.page} onPageChange={paymentPage.setPage} />
      </section>}

      {canManage && <section className="store-appointments__panel store-appointments__day-panel">
        <div className="store-appointments__day-heading">
          <div>
            <span className="store-appointments__eyebrow">AGENDA DEL DÍA</span>
            <h2>{dateLabel(selectedDate)}</h2>
            <p>{paymentPage.pageItems.length
              ? `${paymentPage.pageItems.length} ${paymentFilter === "pendientes" ? "pendiente de pago" : "pagadas"}`
              : "No hay citas para este día."}</p>
          </div>
          <div className="appointment-payment-tabs" role="tablist" aria-label="Filtrar citas del día por pago">
            <button type="button" role="tab" aria-selected={paymentFilter === "pendientes"} className={paymentFilter === "pendientes" ? "is-active" : ""} onClick={() => { setPaymentFilter("pendientes"); paymentPage.setPage(1); }}>
              Pendientes <b>{selectedAppointments.filter(appointment => Number(appointment.saldo) > 0).length}</b>
            </button>
            <button type="button" role="tab" aria-selected={paymentFilter === "pagadas"} className={paymentFilter === "pagadas" ? "is-active" : ""} onClick={() => { setPaymentFilter("pagadas"); paymentPage.setPage(1); }}>
              Pagadas <b>{selectedAppointments.filter(appointment => Number(appointment.saldo) === 0).length}</b>
            </button>
          </div>
          <button type="button" className="store-appointments__new-button" onClick={() => {
            setContinuationAppointment(null);
            setForm(initialAppointment(selectedDate));
            setShowAppointmentForm(true);
            document.querySelector(".store-appointments__form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>＋ Nueva cita</button>
        </div>

        {loading ? <div className="store-appointments__empty">Cargando las citas del mes...</div> : paymentPage.pageItems.length === 0 ? (
          <div className="store-appointments__empty">
            <span aria-hidden="true">▦</span>
            <strong>Tu agenda está libre este día</strong>
            <p>Selecciona “Nueva cita” para reservar un horario.</p>
          </div>
        ) : (
          <div className="store-appointments__list">
            {paymentPage.pageItems.map(renderAppointment)}
          </div>
        )}
        <PaginationTabs totalItems={selectedAppointments.filter(appointment => paymentFilter === "pendientes"
          ? Number(appointment.saldo) > 0 : Number(appointment.saldo) === 0).length}
        page={paymentPage.page} onPageChange={paymentPage.setPage} />
      </section>}
    </main>
  );
}
