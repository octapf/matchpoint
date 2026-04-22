# Calendario de torneos en el feed (`TournamentsCalendar`)

Documentación de decisiones, bugs que aparecieron en el chat, y cómo evitar regresiones. Código: `components/calendar/TournamentsCalendar.tsx`. Uso: `app/(tabs)/feed.tsx`.

---

## Resumen de lo acordado en la conversación

1. **Compactar el calendario en vertical** (menos espacio entre filas de números): se probó bajar `weekVerticalMargin`, tamaños de fuente y overrides en `stylesheet.day.period` (altura/ancho de celda). Eso quedó **revertido** al estabilizar el layout: prioridad es grid correcto; la compacidad se puede retomar con mucho cuidado (ver “Peligros”).

2. **Color de torneos = primer color del preset**: los rangos de fechas con torneo usan `tokens.accent` (primer color del par en `THEME_PRESETS` / `buildAccentPair` en `lib/theme/colors.ts`), no `accentMuted`. El número del día usa `readableTextOnBackground(accent, tokens)` para elegir `lightText` o `darkText` y mantener contraste.

3. **Sin nombre del torneo bajo la fecha en la grilla**: solo barra de periodo y número; los nombres siguen en la lista inferior del mes.

4. **Regresiones de layout (Lun–Mar apilados, día “volando”)**: causas y solución final abajo.

---

## Comportamiento actual (check funcional)

| Área | Comportamiento |
|------|----------------|
| **Fuente de fechas** | `pickTournamentScheduleIso`: prioriza rangos por división (`divisionDates` men/women/mixed), luego `startDate`/`endDate`/`date` del torneo, con `createdAt` como último recurso para inicio. |
| **Parsing** | Fechas `YYYY-MM-DD` se anclan a mediodía local (`T12:00:00`) para evitar desfaces de zona. |
| **Marcado** | `markingType="period"`: cada día del rango tiene `startingDay` / `endingDay` en extremos; `color` y `textColor` por torneo. Solapamientos: se fusiona marcado (un solo color; sin multicolor). |
| **Límite de pintado** | `clampMaxDays(..., 62)` evita rangos enormes en el calendario. |
| **Primer día de semana** | `firstDay={1}` → lunes. |
| **Idioma** | `XDate` locales en/es/it + `useLanguageStore` para `XDate.defaultLocale`. |
| **Mes activo (lista)** | `activeMonthKey` se actualiza en `onMonthChange`; la lista inferior filtra torneos que intersectan ese mes. |
| **Selección** | `selectedDayKey` en estado local; se fusiona en `markedDates` con `selected: true`. |
| **Navegación** | Tap en fila de torneo → `router.push(/tournament/[id])`. |
| **Leyenda** | Muestra muestra de color con `tokens.accent` y borde `tokens.accentOutline`. |

---

## Integración técnica con `react-native-calendars`

### Import paths (Metro)

No importar desde el paquete raíz `react-native-calendars`: el index arrastra `CalendarList` / `recyclerlistview` y en este workspace Metro puede fallar. Importar solo módulos puntuales, p. ej.:

- `react-native-calendars/src/calendar`
- `react-native-calendars/src/expandableCalendar/Context/Provider`

### Sin `dayComponent` personalizado

Con `markingType="period"`, el componente interno `Day` ya elige `PeriodDay` y pasa `date` como **string** `YYYY-MM-DD`. Eso es compatible con `xdateToData` / `XDate` dentro de la librería.

Si en el futuro se usa `dayComponent`:

- La librería inyecta `date` como **objeto** `DateData` (`day/index.js`: `dayComponentProps`).
- Envolver `PeriodDay` en un `View` extra (p. ej. con `alignSelf: 'stretch'`) **rompió** el flex de la fila de la semana en dispositivo (encabezado Lun–Dom en columna, días desalineados).
- Cualquier wrapper debe respetar el mismo modelo de layout que la celda original (`flex: 1` en el contenedor padre del `Calendar`, etc.).

### Tema: cómo se fusionan los `stylesheet.*`

En varios `styleConstructor` de la librería, el tema hace algo equivalente a:

```js
StyleSheet.create({
  ...defaults,
  ...(theme['stylesheet.calendar.header'] || {}),
});
```

Las claves del objeto spread **reemplazan por completo** la entrada del mismo nombre en el `StyleSheet.create` **solo para esas claves de primer nivel** (p. ej. si pasás `dayHeader: { marginBottom: 4 }`, **pisás** el `dayHeader` default y perdés `fontSize`, `color`, `textAlign`, etc.).

**Regla:** no pasar overrides parciales de `dayHeader`, `monthText`, `header`, etc., salvo que el objeto incluya **todas** las propiedades necesarias igual que el default de la librería.

En el código actual solo se pasa (de forma segura) la clave `week` con el mismo contenido esencial que el default (`marginTop`, `flexDirection: 'row'`, `justifyContent: 'space-around'`) para reforzar fila horizontal.

### `CalendarProvider` dentro de `ScrollView`

El `Provider` aplica `contextWrapper` con `flex: 1` por defecto (`expandableCalendar/style.js`). Dentro de un `ScrollView` vertical eso puede interactuar mal con el ancho/medición.

Se pasa `style={{ width: '100%', flex: 0 }}` al `CalendarProvider` para anular el crecimiento flex del wrapper. La tarjeta del calendario usa `alignSelf: 'stretch'` y el clip animado `width: '100%'`.

### `Calendar` y contexto

La instancia de `Calendar` en `src/calendar/index.js` no consume el `CalendarContext` del `Provider` para el día a día de la UI; la selección visible se maneja con `onDayPress` + estado. El `Provider` se mantiene por API existente (`date` / `onDateChanged`); si en el futuro se simplifica a solo `Calendar`, validar que no se dependa de efectos colaterales del contexto.

---

## Animación al cambiar de mes

`Animated.View` + `translateX` / `opacity` en `handleCalendarMonthChange`; `calendarWidthRef` se actualiza en `onLayout` del clip. No debe afectar el layout interno del grid si el contenedor tiene ancho definido (`width: '100%'`).

---

## Pequeñas inconsistencias conocidas (no bloqueantes)

- **Marcas vs texto de lista**: el pintado usa `pickTournamentScheduleIso` (incluye `divisionDates`); las filas de la lista formatean fechas con `formatTournamentDateRange(t.startDate || t.date, t.endDate)`. Si un torneo depende solo de divisiones, el texto podría no reflejar exactamente el mismo rango que el periodo; conviene alinear en una iteración futura si molesta en soporte.

---

## Checklist antes de tocar este archivo otra vez

- [ ] ¿Necesitás `dayComponent`? Preferí no; si sí, sin `View` que rompa flex o replicando medidas del `dayContainer` de la lib.
- [ ] ¿Overrides en `theme['stylesheet.*']`? Solo claves completas o solo claves que reemplacen un bloque entero ya copiado del default.
- [ ] ¿Probás en **Android** dentro del **ScrollView** del feed?
- [ ] ¿Seguís importando desde `src/...` y no desde el root del paquete?

---

## Referencias en el repo

| Archivo | Rol |
|---------|-----|
| `components/calendar/TournamentsCalendar.tsx` | UI del calendario + marcas + lista del mes |
| `app/(tabs)/feed.tsx` | Pasa `calendarTournaments` al componente |
| `lib/theme/colors.ts` | Presets, `accent`, `readableTextOnBackground` |
| `lib/theme/useTheme.ts` | `tokens` actuales según preset del usuario |
| `lib/utils/dateFormat.ts` | `toISODate`, `eachLocalDayInclusive`, `formatTournamentDateRange` |

---

## Changelog mental (esta conversación)

| Cambio | Estado |
|--------|--------|
| Calendario más bajo (`weekVerticalMargin`, `stylesheet.day.period`, fuentes) | Revertido por estabilidad |
| Color de periodo con `tokens.accent` + contraste de dígitos | Activo |
| Leyenda con `accent` | Activo |
| Quitar nombre del torneo bajo el día | Activo (sin caption custom) |
| `dayComponent` + wrapper `View` | Eliminado (causa raíz del layout roto) |
| Override parcial `stylesheet.calendar.header` | Eliminado; solo `week` seguro |
| `CalendarProvider` + ancho / flex | Activo |
