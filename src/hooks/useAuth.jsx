import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { can, canSeeNeg, OWNER_EMAIL } from "../constants/roles.js";
import {
  createMasterAccount, localCreateUser, localFetch, localFetchOrThrow, localLogin, localLogout,
  localUpdateUser, localDelete,
} from "../lib/localApi.js";

// ── Constantes de almacenamiento ───────────────────────────────────────────────
export const SESSION_KEY = 'gesbar_sess_v2';

// ── Protección brute-force (en memoria, reset al recargar página) ──────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000; // 15 minutos
const loginAttempts = new Map(); // email → { count, lockedUntil }

function checkBruteForce(email) {
  const key    = email.toLowerCase().trim();
  const record = loginAttempts.get(key) || { count:0, lockedUntil:0 };
  if (record.lockedUntil > Date.now()) {
    const mins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return { blocked: true, message: `Demasiados intentos. Espera ${mins} min.` };
  }
  return { blocked: false, record, key };
}

function recordFailedAttempt(key, record) {
  const count = record.count + 1;
  loginAttempts.set(key, {
    count,
    lockedUntil: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
  });
  const remaining = MAX_ATTEMPTS - count;
  return remaining > 0
    ? `Contraseña incorrecta. ${remaining} intento${remaining>1?'s':''} restante${remaining>1?'s':''}.`
    : `Cuenta bloqueada 15 minutos por exceso de intentos.`;
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

function normalizeAccount(account) {
  const email = String(account.email || '').trim().toLowerCase();
  const savedRole = String(account.role || '').toLowerCase();
  const role = email === OWNER_EMAIL
    ? 'administrador'
    : ['admin', 'administrador'].includes(savedRole)
      ? 'gerente'
      : savedRole;
  return {
    id:account.id, name:account.name, email, role, negocios:account.negocios,
  };
}

// ── Contexto ───────────────────────────────────────────────────────────────────
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);
  const [users,       setUsers]       = useState([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError,   setAuthError]   = useState('');
  const [setupRequired, setSetupRequired] = useState(false);

  const refreshUsers = useCallback(async () => {
    const storedUsers = await localFetchOrThrow('usuarios');
    if (!Array.isArray(storedUsers)) {
      throw new Error('No fue posible actualizar las cuentas de usuario desde SQLite.');
    }
    const accounts = storedUsers.map(normalizeAccount);
    setUsers(accounts);
    return accounts;
  }, []);

  useEffect(() => {
    (async () => {
      try {
      const licenseStatus = await localFetch('license/status');
      if (!licenseStatus?.authorized) {
        setAuthError('Este computador todavía no está autorizado. Solicita y activa una licencia desde el servidor para continuar.');
        return;
      }
      const setupStatus = await localFetch('setup/status');
      if (!setupStatus) {
        setAuthError('No fue posible verificar la configuración de la cuenta maestra desde el computador servidor.');
        return;
      }
      setSetupRequired(setupStatus.required);
      if (setupStatus.required) {
        setAuthError('La cuenta maestra debe configurarse desde el computador servidor.');
        return;
      }
      setAuthError('');
      const savedSession = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!savedSession?.token || new Date(savedSession.expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      const activeSession = await localFetch('auth/session');
      if (!activeSession?.user) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      const storedUsers = await localFetch('usuarios');
      if (!Array.isArray(storedUsers)) {
        throw new Error('La sesión se validó, pero no fue posible cargar las cuentas.');
      }
      setUsers(storedUsers.map(normalizeAccount));
      const account = normalizeAccount(activeSession.user);
      setUser({ id:account.id, name:account.name, email:account.email, role:account.role, negocios:account.negocios });
      } catch (error) {
        console.error('No fue posible restaurar la sesión:', error);
        setAuthError(error.message || 'No fue posible restaurar la sesión.');
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const bf = checkBruteForce(email);
    if (bf.blocked) return { error: bf.message };

    try {
      const result = await localLogin(email, password);
      const account = normalizeAccount(result.user);
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token:result.token, userId:account.id, expiresAt:result.expiresAt,
      }));
      const storedUsers = await localFetch('usuarios');
      if (!Array.isArray(storedUsers)) {
        localStorage.removeItem(SESSION_KEY);
        return { error:'La sesión inició, pero no fue posible cargar las cuentas. Inténtalo nuevamente.' };
      }
      setUsers(storedUsers.map(normalizeAccount));
      setAuthError('');
      clearAttempts(bf.key);
      setUser({ id:account.id, name:account.name, email:account.email, role:account.role, negocios:account.negocios });
      return { success:true };
    } catch (error) {
      if (error?.message?.includes('Credenciales incorrectas')) {
        return { error:recordFailedAttempt(bf.key, bf.record) };
      }
      return { error:error.message || 'No fue posible iniciar sesión.' };
    }
  };

  const logout = () => {
    localLogout().catch(error => console.error(error));
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setUsers([]);
  };

  const createUser = async ({ name, email, role, negocios, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === OWNER_EMAIL || ['admin', 'administrador'].includes(String(role).toLowerCase())) {
      return { error:'El administrador maestro es único y no se puede crear desde Gestión de Usuarios.' };
    }
    if (users.find(u => u.email.trim().toLowerCase() === normalizedEmail)) return { error:'Email ya existe' };
    if (!password || password.length < 8) return { error:'Contraseña mínimo 8 caracteres' };
    const account = await localCreateUser({
      name: name.trim(),
      email: normalizedEmail,
      role,
      negocios,
      password,
    });
    setUsers(current => [...current, normalizeAccount(account)]);
    return { success: true };
  };

  const updateUser = async (userId, changes) => {
    const current = users.find(account => account.id === userId);
    if (!current) throw new Error('No se encontró el usuario que deseas actualizar.');
    const isMaster = current.email.trim().toLowerCase() === OWNER_EMAIL;
    if (!isMaster && (
      String(changes.email || '').trim().toLowerCase() === OWNER_EMAIL
      || ['admin', 'administrador'].includes(String(changes.role || '').toLowerCase())
    )) throw new Error('El administrador maestro no se puede asignar a otra cuenta.');
    const payload = isMaster
      ? { name: changes.name, ...(changes.password ? { password: changes.password } : {}) }
      : { ...changes, role:['admin', 'administrador'].includes(String(changes.role || '').toLowerCase()) ? 'gerente' : changes.role };
    const updated = normalizeAccount(await localUpdateUser(userId, payload));
    setUsers(accounts => accounts.map(account => account.id === userId ? updated : account));
    if (user?.id === userId) {
      setUser({ id:updated.id, name:updated.name, email:updated.email, role:updated.role, negocios:updated.negocios });
    }
  };

  const deleteUser = async id => {
    if (id === user?.id) return;
    if (users.find(account => account.id === id)?.email.trim().toLowerCase() === OWNER_EMAIL) {
      throw new Error('El administrador maestro no se puede eliminar.');
    }
    const saved = await localDelete('usuarios', { id });
    if (!saved) throw new Error('No fue posible eliminar el usuario de SQLite.');
    setUsers(users.filter(u => u.id !== id));
  };

  const setupMaster = async (name, password) => {
    const result = await createMasterAccount(name, password);
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      token:result.token, userId:result.user.id, expiresAt:result.expiresAt,
    }));
    const rows = await localFetch('usuarios');
    if (!Array.isArray(rows)) throw new Error('La cuenta se creó, pero no se pudo cargar desde SQLite.');
    const accounts = rows.map(normalizeAccount);
    const master = accounts.find(account => account.email === OWNER_EMAIL);
    if (!master) throw new Error('La cuenta maestra no aparece en la base de datos.');
    setUsers(accounts);
    setSetupRequired(false);
    setAuthError('');
    setUser({ id:master.id, name:master.name, email:master.email, role:master.role, negocios:master.negocios });
    return { success:true };
  };

  return (
    <AuthCtx.Provider value={{ user, users, authLoading, authError, setupRequired, setupMaster, login, logout, createUser, updateUser, deleteUser, refreshUsers, can, canSeeNeg }}>
      {children}
    </AuthCtx.Provider>
  );
}
