# Arma tu ruta — implementación y activación

## Estado de la entrega

Implementados: selección/cancelación/reactivación, Mi ruta, cuenta de selecciones, calendario de Google sin OAuth, ICS individual y múltiple con alarmas. Las asistencias permanecen en 0 / 12 y la insignia bloqueada.

El proyecto real todavía respondió HTTP 404 a `list_impulso_activities` en la comprobación de esta entrega. La migración nueva no se aplicó remotamente. La clave pública permite operar bajo RLS, no ejecutar DDL administrativo. No se solicitan claves privadas.

## Aplicar en Supabase SQL Editor, en este orden

1. `supabase/migrations/002_activities_routes.sql`: ejecutar una vez. Crea solamente las dos tablas nuevas, sus políticas, selección de actividades y funciones de catálogo/ruta.
2. `supabase/seeds/002_activities_catalog.sql`: incorpora las 67 actividades sin modificar las existentes al repetir la carga.
3. `supabase/verify-phase2.sql`: comprobaciones de solo lectura.

**No ejecutar nuevamente `001_users_events.sql`.** No se modificaron las tablas, políticas ni folios de fase 1.

La implementación usa dos consultas controladas adicionales a la propuesta inicial: `list_impulso_activities()` limita el catálogo público al evento principal sin ampliar los permisos de `events`; `get_my_impulso_route()` filtra con `auth.uid()` y no devuelve detalles de actividades cerradas o canceladas. Ambas fijan `search_path` y restringen `EXECUTE`.

## Datos reales, sin supuestos

La semilla y `data/activities-catalog.json` se extrajeron de las 67 actividades ya presentes en la landing. Se conservaron títulos, participantes, escenarios, sedes, notas y horarios disponibles. Los slugs son identificadores estables, no solo títulos (hay títulos repetidos).

- 53 actividades `open`: fecha y hora inicial disponibles.
- 14 actividades `draft`: falta fecha o inicio (6 sin fecha; 8 con fecha pero sin inicio).
- 4 actividades con inicio y fin, aptas para calendarios.
- No se inventaron duraciones, horarios finales ni capacidades.

Una actividad con inicio y sin hora final se puede seleccionar. Sus botones de calendario aparecen cuando se completa el horario. Los estados `closed` y `cancelled` impiden nuevas reservas; una selección propia de una actividad que deja de estar abierta permanece visible como «Actividad no disponible» y puede retirarse.


## Primera prueba real

Después de aplicar los SQL:

1. Abrir la landing por Live Server y recargar con Ctrl + F5.
2. En Arma tu ruta, comprobar que las tarjetas no muestran textos ni contadores de cupo.
3. Sin sesión, pulsar «Asistir a esta actividad»: aparecen Iniciar sesión y Crear cuenta.
4. Iniciar sesión: la página regresa a la actividad y la hace visible aunque estuviera fuera de la primera página de resultados. No la selecciona sin otro clic.
5. Pulsar «Asistir a esta actividad». Aparece «Agregada a tu ruta» después de la confirmación de Supabase.
6. En Mi pasaporte comprobar Mi ruta y su contador; las asistencias deben seguir en 0 / 12.
7. Para una de las cuatro actividades con horario completo, abrir Google Calendar o descargar Apple/iPhone. Revisar la fecha y hora en la aplicación de destino antes de guardar.
8. Seleccionar varias actividades y usar «Agregar toda mi ruta al calendario»: descarga un ICS múltiple o presenta un enlace Google por actividad.
9. Quitar una actividad; recargar y verificar que ya no está activa. Volver a agregarla reutiliza la misma fila.
10. Seleccionar la misma actividad desde dos cuentas: ambas deben poder guardarla y cada cuenta solo debe consultar su propia ruta.

Google abre un formulario que el usuario debe guardar. Apple/iPhone importa un ICS; los avisos de 24 horas y 1 hora se incluyen como VALARM, pero su ejecución depende de la aplicación y ajustes del dispositivo. No se escribe en calendarios vía OAuth.

## Archivos

Nuevos módulos: `activities.js`, `agenda-route.js`, `my-route.js`, `route-ui.js`, `calendar.js`, `return-to.js` dentro de `js/`.

Actualizados: landing, `pasaporte.html`, `mi-cuenta.html`, `auth.js`, `login.js`, `registro.js`, `passport.js` y `account.js`. Los cambios de Auth conservan únicamente el destino interno de la actividad; se mantiene el cliente Supabase único.

Nuevos recursos: `css/route.css`, `data/activities-catalog.json`, migración, semilla, verificación y pruebas de fase 2.

## Pruebas realizadas y límites

`node tests/database.mjs`: migraciones aplicadas en PostgreSQL local aislado; semilla ejecutada dos veces sin duplicar las 67 filas. Aislamiento A/B, rechazo sin correo confirmado o inscripción al evento, bloqueo de escritura directa, idempotencia, cancelación, reactivación, inicio obligatorio.

`node --experimental-vm-modules tests/frontend.mjs`: regresión de fase 1 y pruebas DOM con API simulada, incluida ausencia de textos de cupo, regreso a actividad, bloqueo de destino externo y selección sin sumar asistencias.

`node tests/calendar.mjs`: zona horaria, parámetros Google, inicio/fin, UID estable, múltiples eventos, alarmas, escapes y plegado UTF-8 de líneas ICS.

Las pruebas locales no demuestran concurrencia entre sesiones reales de Supabase ni importación en un iPhone físico. El navegador integrado no estuvo disponible; queda pendiente la inspección visual responsive y la prueba real después de aplicar los SQL.

## Preparación para recordatorios

`reminder_enabled` existe con valor predeterminado true. No hay Cron, Edge Functions de envío ni correos programados. Una fase futura deberá registrar cada entrega con clave única por selección y tipo de aviso, comprobar nuevamente que sigue activa y omitir cancelaciones. Los VALARM de los archivos ICS son recordatorios del calendario personal, no correos del sistema.

No se implementaron QR, escáner, confirmación de asistencia, desbloqueo de insignias, premios ni panel administrativo.


La 002 es definitiva y la tercera migración pendiente fue retirada. No hay contadores manuales; las estadísticas futuras se calculan desde las selecciones registradas.

Actualización Fase 3A: la agenda operativa ahora se genera desde Supabase y deja de usar tarjetas o catálogos duplicados en el frontend. La regla nueva permite OPEN con fecha y horas opcionales. Consultar FASE-3A-ADMINISTRACION.md antes de aplicar la migración administrativa pendiente.
