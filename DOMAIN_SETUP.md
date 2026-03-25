# Configuración del dominio matchpoint.miralab.ar

Según el plan del proyecto, estos son los pasos pendientes en **matchpoint.miralab.ar**.

---

## 0. Si ves 404 DEPLOYMENT_NOT_FOUND

El dominio llega a Vercel pero no encuentra el deployment. Verificá:

1. **Vercel Dashboard** → Tu proyecto Matchpoint → **Settings** → **Domains**
2. Añadí `matchpoint.miralab.ar` si no está
3. **DNS:** CNAME `matchpoint` → `cname.vercel-dns.com` (Vercel te muestra el valor exacto)
4. **Producción:** Hacé un deploy y asegurate de que el dominio apunte a la última versión

---

## 1. Crear el subdominio

En el DNS de miralab.ar, agregar un registro para el subdominio:

| Tipo | Nombre     | Valor                    |
|------|------------|--------------------------|
| A    | matchpoint | IP del servidor/hosting  |
| CNAME| matchpoint | (alternativa) tu hosting |

Apuntar `matchpoint.miralab.ar` al servidor donde vas a alojar los archivos (puede ser Vercel, Netlify, hosting compartido, etc.).

---

## 2. Android App Links — assetlinks.json

Para que al tocar `https://matchpoint.miralab.ar/t/XXXX` se abra la app en Android (si está instalada), hace falta **todo** esto:

1. **En el repo:** `public/assetlinks.json` (se publica como `/assetlinks.json`). Vercel reescribe `/.well-known/assetlinks.json` → `/assetlinks.json`.
2. **En la app:** `app.config.js` ya incluye un `intentFilter` HTTPS (`host: matchpoint.miralab.ar`, `pathPrefix: /t`, `autoVerify: true`). Tenés que generar un **nuevo build** de Android (`eas build` o `expo run:android`) para que el manifest del APK/AAB lo incluya.
3. **SHA256:** tiene que coincidir con la firma que usa Google Play (**App signing key certificate** en Play Console → App integrity). Editá `public/assetlinks.json` y reemplazá el fingerprint. Si el SHA no coincide, Android **no** verifica el dominio y el enlace sigue abriendo el navegador.

**Contenido de ejemplo** (reemplazá el SHA256):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.miralab.matchpoint",
      "sha256_cert_fingerprints": [
        "4A:09:81:D0:60:74:43:50:51:24:E7:8C:EF:49:6A:9B:C2:7F:D9:39:51:0E:E5:E4:B8:35:83:19:AB:36:84:D0"
      ]
    }
  }
]
```

> **SHA256:** Obtené el actual con `npx eas credentials --platform android` o desde Play Console (firma de **app signing**, no solo upload). Podés añadir varios fingerprints en el array si usás distintas claves.

---

## 3. iOS Universal Links — apple-app-site-association (para más adelante)

Si más adelante publicás en iOS, necesitás:

**Archivo:** `https://matchpoint.miralab.ar/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.miralab.matchpoint",
        "paths": ["/t/*"]
      }
    ]
  }
}
```

Reemplazá `TEAMID` por tu Apple Team ID. Este archivo debe servirse con `Content-Type: application/json` (algunos hosts lo hacen automático).

---

## 4. Página web de fallback

Cuando alguien abra `https://matchpoint.miralab.ar/t/XXXX` **sin tener la app instalada**, se verá una web. Esa web debe:

- Mostrar que es un link de invitación de Matchpoint
- Incluir un botón/link para descargar la app en Play Store
- (Opcional) Redirigir directamente a Play Store

**Formato de la ruta:** `https://matchpoint.miralab.ar/t/{token}`

Ejemplo mínimo de HTML para `/t/*`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Matchpoint — Beach Volleyball Tournaments</title>
</head>
<body>
  <h1>Matchpoint</h1>
  <p>You've been invited to a beach volleyball tournament.</p>
  <p>Open this link in the Matchpoint app, or download it:</p>
  <a href="https://play.google.com/store/apps/details?id=com.miralab.matchpoint">
    Get Matchpoint on Google Play
  </a>
</body>
</html>
```

---

## 5. Resumen de archivos

| Ruta | Propósito |
|------|-----------|
| `/.well-known/assetlinks.json` | Android App Links |
| `/.well-known/apple-app-site-association` | iOS Universal Links (futuro) |
| `/t/*` | Página web de fallback para links de invitación |

---

## 6. Verificación

- **assetlinks:** https://developers.google.com/digital-asset-links/tools/generator  
- **Android:** Instalá la app y probá abrir `https://matchpoint.miralab.ar/t/abc123` desde un link (Chrome, WhatsApp, etc.)

---

*Actualizado según el keystore de EAS development. Verificá los fingerprints con `npx eas credentials --platform android` antes de usar en producción.*
