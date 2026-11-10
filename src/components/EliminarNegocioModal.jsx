import { useState } from "react";
import { C, s } from "../constants/theme.js";
import { Modal } from "./common/index.jsx";

export default function EliminarNegocioModal({ negocio, onClose, onDelete }) {
  const [step, setStep] = useState("review");
  const [confirmationName, setConfirmationName] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteBusiness = async () => {
    setDeleting(true);
    setError("");
    try {
      await onDelete();
    } catch (deleteError) {
      setError(deleteError.message || "No fue posible eliminar el negocio.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      title={step === "review" ? "Eliminar negocio" : "Confirmación final"}
      onClose={deleting ? () => {} : onClose}
    >
      {step === "review" ? (
        <>
          <div className="business-delete-warning">
            <strong>Esta acción no se puede deshacer.</strong>
            <span>Se borrarán permanentemente el negocio y sus productos, personal, turnos, comandas, pagos e históricos.</span>
          </div>
          <p className="business-delete-prompt">
            Para continuar, escribe exactamente <strong>{negocio.name}</strong>.
          </p>
          <input
            autoFocus
            style={s.inp}
            value={confirmationName}
            onChange={event => setConfirmationName(event.target.value)}
            placeholder="Nombre exacto del negocio"
            aria-label="Escribe el nombre exacto del negocio"
            disabled={deleting}
          />
          {error && <p className="business-delete-error" role="alert">{error}</p>}
          <div className="business-delete-actions">
            <button style={s.btn("ghost")} type="button" onClick={onClose} disabled={deleting}>Cancelar</button>
            <button
              style={s.btn("danger")}
              type="button"
              onClick={() => { setError(""); setStep("final"); }}
              disabled={deleting || confirmationName !== negocio.name}
            >
              Continuar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="business-delete-warning">
            <strong>Último paso: borrar “{negocio.name}”.</strong>
            <span>Se eliminarán de forma permanente sus datos y registros asociados. No existe una opción para recuperarlos.</span>
          </div>
          {error && <p className="business-delete-error" role="alert">{error}</p>}
          <div className="business-delete-actions">
            <button
              style={s.btn("ghost")}
              type="button"
              onClick={() => { setError(""); setStep("review"); }}
              disabled={deleting}
            >
              Volver
            </button>
            <button
              style={s.btn("danger")}
              type="button"
              onClick={deleteBusiness}
              disabled={deleting}
            >
              {deleting ? "Eliminando..." : "Eliminar permanentemente"}
            </button>
          </div>
        </>
      )}
      <style>{`
        .business-delete-warning {
          display: grid;
          gap: 6px;
          margin-bottom: 16px;
          padding: 13px;
          border: 1px solid rgba(255, 114, 127, .28);
          border-radius: 12px;
          background: rgba(255, 114, 127, .08);
          color: #c8c4d0;
          font-size: 12px;
          line-height: 1.5;
        }
        .business-delete-warning strong { color: #ff929c; }
        .business-delete-prompt { margin: 0 0 8px; color: ${C.text2}; font-size: 12px; }
        .business-delete-prompt strong { color: ${C.text}; }
        .business-delete-error { margin: 10px 0 0; color: ${C.red}; font-size: 12px; }
        .business-delete-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
      `}</style>
    </Modal>
  );
}
