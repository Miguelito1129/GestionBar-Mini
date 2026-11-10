import { Component } from "react";
import { AuthProvider, useAuth } from "./hooks/useAuth.jsx";
import { C } from "./constants/theme.js";
import LoginScreen from "./components/Login/LoginScreen.jsx";
import MainApp from "./components/MainApp.jsx";

class AppErrorBoundary extends Component {
  state = { error: null, componentStack: "" };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Error al mostrar la aplicación:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "grid", placeItems: "center", padding: 24, boxSizing: "border-box" }}>
        <div style={{ maxWidth: 520, textAlign: "center" }}>
          <h1 style={{ color: C.red }}>No fue posible mostrar esta pantalla</h1>
          <p style={{ color: C.sub }}>Ocurrió un error inesperado. Recarga la aplicación; si continúa, informa este detalle al administrador.</p>
          <pre style={{ color: C.red, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "left" }}>
            {this.state.error.message}
          </pre>
          {this.state.componentStack && (
            <pre style={{ color: C.sub, whiteSpace: "pre-wrap", overflowWrap: "anywhere", textAlign: "left", fontSize: 11, maxHeight: 240, overflow: "auto" }}>
              {this.state.componentStack}
            </pre>
          )}
          <button type="button" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      </div>
    );
  }
}

function Root() {
  const { user, authLoading } = useAuth();
  if (authLoading) return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:C.amber,fontSize:18,fontWeight:700}}>
      <img src="/gestionbar-logo.png" alt="GestiónBar" style={{width:88,height:82,objectFit:'contain'}}/>
      <span>GestiónBar</span>
    </div>
  );
  return user ? <MainApp/> : <LoginScreen/>;
}

export default function App() {
  return <AppErrorBoundary><AuthProvider><Root/></AuthProvider></AppErrorBoundary>;
}
