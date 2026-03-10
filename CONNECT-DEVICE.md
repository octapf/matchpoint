# Conectar dispositivo sin EAS Build

## Setup Android SDK (sin instalar Android Studio)

Para compilar localmente y evitar la cola de EAS:

```powershell
# En PowerShell (puede requerir: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned)
.\scripts\setup-android-sdk.ps1
```

Luego cierra y abre una terminal nueva, conecta el teléfono por USB (con depuración USB activada) y ejecuta:

```bash
npx expo run:android
```

---

## Conectar via tunnel (cuando el launcher aparece)

Cuando el tunnel de Expo no carga el código nuevo al escanear el QR, prueba esto:

## Paso 1: Arrancar Metro con tunnel

```bash
npm run start:tunnel
```

Espera hasta ver **"Tunnel ready"**. En la terminal aparecerá algo como:

```
Metro: exp+matchpoint://expo-development-client/?url=https%3A%2F%2FXXXXX-octapf-8081.exp.direct
```

La URL que necesitas es: **https://XXXXX-octapf-8081.exp.direct** (copia la parte entre `url=` y el final, decodificada).

## Paso 2: Limpiar la app en el teléfono

- Ajustes → Apps → Matchpoint → Almacenamiento → **Borrar datos**
- Cierra Matchpoint por completo

## Paso 3: Abrir la app y pegar la URL (NO escanear el QR)

1. Abre Matchpoint **tocando el icono** (no escanees el QR).
2. Debería aparecer la pantalla de **launcher** con "Enter URL manually".
3. Pega la URL: `https://XXXXX-octapf-8081.exp.direct` (la que salió en la terminal).
4. Confirma / Enter.
5. La app debería cargar el bundle desde Metro.

## Alternativa: localtunnel

Si el tunnel de Expo falla, prueba con localtunnel:

**Terminal 1:**
```bash
npx expo start
```

**Terminal 2:**
```bash
npx localtunnel --port 8081
```

Copia la URL que muestra localtunnel (ej: `https://xxx.loca.lt`) y pégala en el launcher de la app.
