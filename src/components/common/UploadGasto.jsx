import { useState, useRef } from "react";
import { C, s, COP } from "../../constants/theme.js";
import { uid } from "../../utils/helpers.js";
import { localInsertDetailed } from "../../lib/localApi.js";

const CATS = ['Insumos','Nómina','Mantenimiento','Servicios','Proveedores','Arriendo','Comisión','CxC','Otros'];
const CAT_COLORS = { Insumos:C.indigo, Nómina:C.green, Mantenimiento:C.amber, Servicios:C.purple, Proveedores:C.cyan, Arriendo:C.red, Comisión:'#ec4899', CxC:C.red, Otros:C.sub };

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No fue posible leer la imagen."));
    reader.readAsDataURL(file);
  });
}

export async function preparePhoto(file) {
  if (file.size > 20_000_000) throw new Error("La imagen supera el límite de 20 MB.");
  const source = await readAsDataUrl(file);
  const image = new Image();
  image.src = source;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("El archivo seleccionado no es una imagen válida."));
  });

  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No fue posible preparar la imagen.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.7, 0.58, 0.46]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= 1_400_000) return dataUrl;
  }
  throw new Error("La imagen es demasiado grande. Selecciona una foto más pequeña.");
}

function localDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

// Detectar categoría del gasto
function parseCategoria(texto) {
  const t = (texto || '').toLowerCase();
  if (/hielo|limon|limón|vaso|bolsa|sal|insumo|servilleta/.test(t)) return 'Insumos';
  if (/arreglo|reparac|manten|plomero|electr/.test(t)) return 'Mantenimiento';
  if (/licor|aguardiente|cerveza|proveedor|pedido|ron|whisky/.test(t)) return 'Proveedores';
  if (/arriendo/.test(t)) return 'Arriendo';
  if (/nomina|nómina|personal|pago personal/.test(t)) return 'Nómina';
  if (/publicidad|redes|diseño/.test(t)) return 'Comisión';
  return 'Otros';
}

export default function UploadGasto({ negocio, onRegistered }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [desc, setDesc] = useState('');
  const [monto, setMonto] = useState('');
  const [cat, setCat] = useState('Insumos');
  const [date, setDate] = useState(localDate);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleFile = async (f) => {
    if (!f) return;
    setFile(null);
    setPreview(null);
    setSuccess(false);
    setError('');
    try {
      const photo = await preparePhoto(f);
      setPreview(photo);
      setFile(photo);
    } catch (photoError) {
      setFile(null);
      setPreview(null);
      setError(photoError.message);
      return;
    }

  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile?.type.startsWith('image/')) handleFile(droppedFile);
    else setError("Selecciona un archivo de imagen.");
  };

  const registrar = async () => {
    const amount = Number(monto);
    if (!desc.trim() || !Number.isSafeInteger(amount) || amount <= 0 || uploading) {
      setError("Ingresa una descripción y un monto válido mayor que cero.");
      return;
    }
    setUploading(true);
    setError('');
    try {
      const result = await localInsertDetailed('gastos', [{
        id: uid(),
        negocio_id: negocio.id,
        fecha: date,
        desc: desc.trim(),
        monto: amount,
        cat,
        foto_url: file,
        procesado: false,
      }]);
      if (!result.ok) throw new Error(result.error || "No fue posible guardar el gasto.");

      setSuccess(true);
      setFile(null);
      setPreview(null);
      setDesc('');
      setMonto('');
      setCat('Insumos');
      setDate(localDate());
      if (fileRef.current) fileRef.current.value = "";
      if (onRegistered) onRegistered();
    } catch (e) {
      setError('Error al registrar: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setDesc('');
    setMonto('');
    setCat('Insumos');
    setDate(localDate());
    if (fileRef.current) fileRef.current.value = "";
    setError('');
    setSuccess(false);
  };

  return (
    <div>
      {error && !file && (
        <div style={{ padding: '8px 10px', marginBottom: 8, border: `1px solid ${C.red}40`, borderRadius: 9, background: `${C.red}10`, color: C.red, fontSize: 11 }} role="alert">
          {error}
        </div>
      )}
      {success && !file && (
        <div style={{ padding: '8px 10px', marginBottom: 8, border: `1px solid ${C.green}40`, borderRadius: 9, background: `${C.green}10`, color: C.green, fontSize: 11 }} role="status">
          ✓ Gasto y comprobante guardados.
        </div>
      )}
      {!file ? (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${C.border}`,
            borderRadius: 12,
            padding: '1.5rem 1rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: C.surface,
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.amber}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            Subir factura / recibo
          </div>
          <div style={{ fontSize: 11, color: C.sub }}>
            Arrastra una foto o haz clic para seleccionar
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
            Adjunta el comprobante y completa los datos
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${C.border}`, flexShrink: 0, position: 'relative'
          }}>
            <img src={preview} alt="factura" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button
              onClick={reset}
              style={{
                position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)',
                border: 'none', color: '#fff', borderRadius: '50%', width: 20, height: 20,
                cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >✕</button>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {error && (
              <div style={{ padding: '6px 10px', background: C.red + '15', borderRadius: 8, fontSize: 11, color: C.red, marginBottom: 8 }}>{error}</div>
            )}
            {success && (
              <div style={{ padding: '6px 10px', background: C.green + '15', borderRadius: 8, fontSize: 11, color: C.green, marginBottom: 8 }}>
                ✓ Gasto registrado
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <input
                style={{ ...s.inp, flex: 2, minWidth: 120 }}
                placeholder="Descripción (ej: hielo 5 bolsas)"
                value={desc}
                onChange={e => {
                  setDesc(e.target.value);
                  setCat(parseCategoria(e.target.value));
                }}
              />
              <input
                style={{ ...s.inp, flex: 1, maxWidth: 150 }}
                type="number"
                placeholder="Monto"
                value={monto}
                onChange={e => setMonto(e.target.value)}
              />
              <select
                style={{ ...s.sel, flex: '0 0 140px' }}
                value={cat}
                onChange={e => setCat(e.target.value)}
              >
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <label style={{ display: 'grid', gap: 4, marginBottom: 8, color: C.sub, fontSize: 10 }}>
              Fecha del gasto
              <input
                style={{ ...s.inp, minHeight: 36 }}
                type="date"
                value={date}
                onChange={event => setDate(event.target.value)}
              />
            </label>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={{ ...s.btn('primary'), padding: '5px 14px', fontSize: 11 }}
                disabled={uploading || !desc || !monto}
                onClick={registrar}
              >
                {uploading ? 'Subiendo...' : '✓ Registrar'}
              </button>
              <button style={{ ...s.btn(), padding: '5px 10px', fontSize: 11 }} onClick={reset}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
