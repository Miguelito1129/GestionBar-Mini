# GestiónBar — App Android (Capacitor)

Esta app Android usa Capacitor para envolver la app web React en una app nativa.
**Misma base de datos Supabase, mismos perfiles, todas las funcionalidades.**

---

## Requisitos previos

### 1. Java (JDK 17 o superior)
Descarga desde: https://adoptium.net/
Verifica: `java -version`

### 2. Android Studio
Descarga desde: https://developer.android.com/studio
- Durante la instalación: acepta instalar el **Android SDK** (API 34)
- En Android Studio: `File > Settings > Appearance & Behavior > System Settings > Android SDK`
  - Instala: **Android 14 (API 34)** ✓

### 3. Variables de entorno (Windows)
Agrega al PATH de sistema:
```
ANDROID_HOME = C:\Users\<tu-usuario>\AppData\Local\Android\Sdk
PATH += %ANDROID_HOME%\tools
PATH += %ANDROID_HOME%\platform-tools
```

---

## Pasos para generar el APK

### Paso 1 — Configura las variables de entorno
Crea el archivo `.env` en la raíz del proyecto (si no existe):
```env
VITE_LOCAL_API_URL=http://192.168.1.20:3000/api
VITE_APP_PEPPER=tu_pepper_secreto
```

### Paso 2 — Sincroniza el proyecto
```bash
npm run cap:sync
```
Esto hace `npm run build` y copia la app a la carpeta `android/`.

### Paso 3 — Abre en Android Studio
```bash
npm run cap:open
```
Espera que Gradle termine de sincronizar (barra de progreso inferior en Android Studio).

### Paso 4 — Genera el APK
En Android Studio:
1. Menú: **Build → Build Bundle(s)/APK(s) → Build APK(s)**
2. Espera que compile (~2-3 minutos la primera vez)
3. Cuando aparezca "Build successful", haz clic en **locate** para encontrar el APK

El APK estará en:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Paso 5 — Instala en el celular
**Opción A — USB:**
1. Activa "Opciones de desarrollador" en tu Android (toca 7 veces "Número de compilación")
2. Activa "Depuración USB"
3. Conecta por USB y confirma el permiso
4. En Android Studio: **Run → Run 'app'** (triángulo verde ▶)

**Opción B — APK directo:**
1. Copia el archivo `app-debug.apk` al celular (WhatsApp, email, USB)
2. Abre el archivo en el celular
3. Si aparece "Fuentes desconocidas": ve a Ajustes → Seguridad → Instalar apps de fuentes desconocidas

---

## Actualizar la app

Cada vez que cambies código:
```bash
npm run cap:sync   # reconstruye y sincroniza
npm run cap:open   # abre Android Studio
```
Luego en Android Studio: **Build → Build APK(s)**

---

## Solución de problemas

| Error | Solución |
|---|---|
| `SDK location not found` | Verifica ANDROID_HOME en variables de entorno |
| `Gradle sync failed` | File → Sync Project with Gradle Files |
| `App no se conecta a Supabase` | Verifica que `.env` tiene las variables correctas y haz `npm run cap:sync` |
| `Pantalla en blanco` | Haz `npm run build` primero, luego `npx cap sync android` |

---

## Estructura del proyecto Android

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml    # Permisos y configuración
│   │   ├── assets/public/         # App web copiada aquí por cap sync
│   │   └── java/.../MainActivity  # Activity principal
│   └── build.gradle               # Dependencias Android
└── build.gradle                   # Configuración Gradle global
```

---

## App ID y nombre
- **App ID:** `co.gesbar.app`
- **Nombre:** GestiónBar
- Para cambiarlos: edita `capacitor.config.ts` y ejecuta `npm run cap:sync`
