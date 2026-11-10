export const formatLocalTime = value => {
  if (!value) return "";
  const timestamp = String(value);
  const date = new Date(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)
      ? `${timestamp.replace(" ", "T")}Z`
      : timestamp
  );
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatLocalDateKey = value => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value || ""))
      ? `${String(value).replace(" ", "T")}Z`
      : value
  );
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
