# Debug: Google Sign-In no vuelve a la app

## Qué está pasando

1. Tocás "Continue with Google" → se abre Chrome Custom Tabs con accounts.google.com
2. Iniciás sesión en Google → Google redirige a `com.miralab.matchpoint:/oauthredirect?...`
3. **Falla:** Chrome no transfiere ese link al app y termina en google.com

La raíz: Android no asocia el redirect con la app, o Chrome no hace el handoff correcto.

---

## Cambio aplicado

**Scheme unificado:** Antes había `["matchpoint", "com.miralab.matchpoint"]` y Linking ignoraba `com.miralab.matchpoint`.  
Ahora solo usamos `com.miralab.matchpoint`, que es el redirect que envía Google.

**Requerido: nuevo build** (afecta `app.json` y manifest nativo):

```bash
npx eas build --profile development --platform android
```

---

## Verificar que Android reciba el intent

Con el APK instalado y el dispositivo conectado:

```bash
adb shell pm resolve-activity -a android.intent.action.VIEW -d "com.miralab.matchpoint:/oauthredirect"
```

Debería devolver algo como `com.miralab.matchpoint/...MainActivity`. Si no devuelve nada o no menciona tu package, el intent filter no está bien configurado.

---

## Si sigue fallando: alternativas

### 1. @react-native-google-signin/google-signin

Usa el SDK nativo de Google en vez del flujo OAuth por navegador: no hay redirect y suele ser más estable en Android.

```bash
npx expo install @react-native-google-signin/google-signin
```

Requiere configurar `google-services.json` y cambiar la lógica de sign-in.

### 2. Verificar que el redirect coincida

En el sign-in, el redirect es:

- `com.miralab.matchpoint:/oauthredirect` (un slash)  
o  
- `com.miralab.matchpoint:///oauthredirect` (triple slash)

Debe coincidir exactamente con lo que usa el request OAuth. En Google Cloud, para cliente **Android** no se configuran redirect URIs manualmente; para cliente **Web**, solo si usás ese flujo.

### 3. Probar en otro dispositivo

Algunos fabricantes modifican Chrome o el manejo de intents; el mismo build puede comportarse distinto en otro teléfono.
