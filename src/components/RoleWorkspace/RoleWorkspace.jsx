import MeseroWorkspace from "../Turnos/MeseroWorkspace.jsx";
import BarraWorkspace from "../Turnos/BarraWorkspace.jsx";

export default function RoleWorkspace({ role, negocio, userName, userId, view }) {
  if (role === "mesero" || role === "mesero_fijo") return <MeseroWorkspace negocio={negocio} userName={userName} userId={userId} view={view} />;
  if (role === "barra" || role === "barra_fija") return <BarraWorkspace negocio={negocio} userName={userName} userId={userId} view={view} />;
  return null;
}
