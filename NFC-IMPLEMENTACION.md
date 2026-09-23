# Asistencia NFC / QR — propuesta lista para revisión

Actualización del 22/09/2026. Implementada y probada localmente. **No se desplegaron migraciones ni Edge Functions; no hubo commit ni push.** Sustituye la propuesta anterior basada en horarios. La integración de Turnstile de cuentas sigue preparada en los archivos existentes.

## 1. Esquema propuesto

- `activities.attendance_enabled boolean not null default false`: todas empiezan cerradas. Ninguna fecha u hora abre o cierra automáticamente.
- `activity_attendances`: `id`, `user_id`, `activity_id`, `attended_at default now()`, `method='NFC_QR'`, `request_id`, `UNIQUE(user_id,activity_id)`. RLS permite a cada participante leer exclusivamente sus registros; la escritura solo corresponde al backend.
- `impulso_private.attendance_points`: un token estable por actividad. Se genera en PostgreSQL al consultar por primera vez su control administrativo: dos UUID v4 aleatorios, sin guiones (64 caracteres hexadecimales, aproximadamente 244 bits aleatorios). Solo se devuelve a administradores autorizados; no aparece en el catálogo público, semillas ni repositorio.
- `impulso_private.attendance_control_log`: historial de cada transición, con actividad, estado, ID del administrador y fecha del servidor. No se sobrescriben transiciones al reabrir. El panel muestra las últimas 50 con nombre, ID y fecha en Ciudad de México; la tabla conserva todo el historial mientras exista la actividad. Si se elimina una cuenta, su referencia queda nula.
- `impulso_private.nfc_rate_limits`: límite persistente de intentos por usuario.

Las tablas privadas tienen RLS y carecen de acceso directo para `anon`/`authenticated`. Las RPC administrativas verifican rol y acceso al escenario, con `search_path` vacío y permisos EXECUTE explícitos.

## 2. Migración propuesta

`supabase/migrations/20260923001237_nfc_attendance.sql`.

Se corrigió **la propuesta pendiente y aún no desplegada**, creada previamente con CLI. No se creó otra migración que dejara vigente la función anterior. Aplicar después de 001–007, una sola vez y únicamente cuando se autorice. No existen en esta propuesta las columnas de ventanas ni la RPC `admin_set_attendance_window`; tampoco queda una firma de confirmación sin token.

La consulta remota de la fase anterior confirmó que aún no existían tabla/RPC de asistencia ni Edge Functions. Esta fase no escribió en producción. Si otro operador aplicó entretanto la versión anterior, no debe ejecutar esta propuesta como actualización: necesitaría una migración incremental tras inspeccionar ese esquema.

## 3. Edge Function y RPC

`nfc-attendance` recibe `activity_id`, `point_token` y `token` (este último es el token independiente de Turnstile). Verifica sesión contra Supabase Auth, origen permitido, cuerpo limitado, límite de intentos y Siteverify (hostname, acción y cData). Después llama a:

`confirm_nfc_attendance(p_user_id,p_activity_id,p_request_id,p_point_token)`.

Solo `service_role` puede ejecutarla. PostgreSQL verifica identidad, festival, token específico, estado habilitado y duplicados. Se mantienen los controles existentes de correo confirmado, perfil, privacidad e inscripción activa al festival; la preparación de cuenta no agrega nada a Mi Ruta.

No se confía en `user_id`, timestamps ni estado enviados por el navegador. La clave `TURNSTILE_SECRET_KEY` se lee exclusivamente del entorno backend; la Site key pública permanece en `js/nfc-config.js`. Auth nativo exige además su configuración descrita en `TURNSTILE-VERIFICACION.md`.

## 4. Funcionamiento de attendance_enabled

`false` rechaza registros nuevos con `ATTENDANCE_CLOSED`; `true` permite confirmar cuando los demás controles pasan. Agenda, cambios de sede, fecha, inicio y término no autorizan ni invalidan asistencias.

También se puede habilitar una actividad borrador sin fecha sin modificar su estado editorial; su vista NFC queda disponible mientras la asistencia esté activa, sin publicarla en la agenda. Una actividad cancelada no acepta nuevas asistencias. La agenda conserva sus reglas editoriales actuales. Las asistencias existentes permanecen en el historial aunque cambie o se cierre la actividad.

## 5. Panel administrativo

En detalle: **CONTROL DE ASISTENCIA**, **ASISTENCIA CERRADA / ASISTENCIA ACTIVA**, URL para NFC/QR e historial. `admin_get_attendance_control` obtiene el estado/token/auditoría; `admin_set_attendance_enabled` abre o cierra.

Antes de habilitar se muestra: “¿Habilitar el registro de asistencia para esta actividad? Las personas que accedan mediante el NFC o QR de esta actividad podrán confirmar su presencia.” Botones CANCELAR / HABILITAR.

Antes de cerrar: “¿Cerrar el registro de asistencia? Ya no se aceptarán nuevas asistencias hasta que vuelvas a habilitarlo.” Botones CANCELAR / CERRAR ASISTENCIA.

La solicitud queda bloqueada durante el envío. Cancelar no escribe. Backend conserva autorización `super_admin` y permisos de escenario para staff; no usa metadata editable del usuario como permiso.

## 6. Duplicados y concurrencia

`UNIQUE(user_id,activity_id)` más `INSERT ... ON CONFLICT DO NOTHING` asegura una sola fila. Reintentos devuelven `ALREADY_COMPLETED`, sin cambiar el timestamp ni sumar al pasaporte. Esto puede mostrarse incluso tras cerrar: reconoce una asistencia existente, no registra otra.

Confirmación toma `FOR SHARE` sobre la actividad; apertura/cierre toman `FOR UPDATE` sobre la misma fila. Así se serializa el cierre frente a escaneos: una confirmación que ya obtuvo el bloqueo termina antes del cierre; tras completar el cierre no se aceptan nuevos registros hasta reapertura. PostgreSQL impone la unicidad también ante solicitudes concurrentes.

## 7. Token NFC / QR

El panel genera una URL de este formato, con el token real obtenido del backend:

`actividad.html?checkin=<escenario%2Fslug>&t=<token-del-punto>`

La misma URL sirve para NFC Tools y para el QR. Conocer solo el slug no basta. PostgreSQL comprueba la pareja actividad/token, además del formato validado por Edge Function. Un token de otra actividad se rechaza. Login, Google, confirmación de correo y privacidad conservan el destino y token. El manejador 404 también conserva `t` para rutas antiguas que lo incorporen.

**Las URLs sin token de `NFC-ETIQUETAS.md` son referencias históricas, no etiquetas listas para grabar.** Después del despliegue autorizado, copiar la URL completa desde cada actividad. No se generaron tokens de producción ni QR con valores ficticios. Si se cambia escenario o slug, actualizar la URL grabada.

Una URL válida puede compartirse mientras esté activa. El token es una credencial del punto, no un secreto del servidor ni prueba criptográfica de proximidad. Protección operativa: usuario autenticado, token específico, apertura manual breve, registro único y cierre inmediato. Sin GPS ni geolocalización. `NFC_QR` identifica el mecanismo compartido, no demuestra si se usó NFC o cámara.

## 8. Pasaporte Digital

Cuenta únicamente actividades distintas con asistencia registrada. No requiere selección previa, no agrega automáticamente selecciones ni completa escenarios. El historial muestra también asistencias fuera de Mi Ruta. Un fallo al consultar Mi Ruta no impide consultar asistencias.

`get_my_passport_status()` calcula en PostgreSQL `attendance_count` y `badge_unlocked = count(distinct activity_id) >= 12`, siempre filtrado por usuario autenticado y festival. La interfaz muestra la insignia desbloqueada según esa respuesta; selección, recarga o escaneo repetido no aumentan el contador. Se trata de la insignia visual del pasaporte existente, no de un certificado adicional.

`attended_at = now()` registra el momento de confirmación en servidor. No certifica permanencia durante toda la actividad.

## 9. Reapertura

Habilitar → cerrar → habilitar mantiene el mismo token y todas las asistencias. Cada transición registra actor y fecha; repetir el mismo estado no duplica auditoría. Los participantes que ya asistieron permanecen protegidos por la restricción única.

## 10. Archivos ajustados en esta fase

- Esquema: `supabase/migrations/20260923001237_nfc_attendance.sql`.
- Backend: `supabase/functions/nfc-attendance/handler.mjs`.
- Interfaz: `js/admin-attendance.js`, `js/activity-page.js`, `js/attendance.js`, `js/my-route.js`, `pasaporte.html`.
- Retorno NFC: `js/nfc-path.js`, `js/return-to.js`, `404.html`.
- Pruebas: `tests/nfc-database.mjs`, `tests/nfc-handler.mjs`, `tests/frontend.mjs`.
- Documentación: esta guía y `NFC-ETIQUETAS.md`.

Los cambios previos de landing, escenarios y Auth se conservaron.

## 11. Pruebas y límites

```sh
node tests/database.mjs
node tests/nfc-handler.mjs
node --experimental-vm-modules tests/frontend.mjs
node --experimental-vm-modules tests/turnstile.mjs
node tests/calendar.mjs
git diff --check
```

PostgreSQL local PGlite: estados, autorización de roles/escenario, tokens incorrectos y de otra actividad, aislamiento, ausencia de ruta, horarios pasados/futuros/ausentes, cambios de agenda, reapertura, auditoría, timestamp, duplicados y umbral 11→12. Se incluyen las regresiones 001–007.

Handler: sesión, suplantación, CORS, límites, validación Cloudflare, tokens faltantes/malformados, fallos seguros y propagación del token del punto al servidor. Interfaz: 189 comprobaciones, incluyendo confirmación/cancelación/reapertura, doble clic, errores y retorno con token. Turnstile y calendarios conservan sus pruebas.

Auth/Siteverify se simulan. No se probaron tokens Cloudflare reales, entrega de correo, NFC físico, cámara QR ni concurrencia entre procesos de un servidor PostgreSQL real. La garantía contra carreras reside en los locks y el constraint de PostgreSQL. El navegador integrado no estuvo disponible; las pruebas DOM no sustituyen validación visual Safari/iPhone.

## 12. Estado de entrega y futuro despliegue

**Sin deploy, commit ni push.** No se aplicó SQL remoto ni se desplegó Edge Function. Para una fase posterior autorizada: aplicar la migración revisada; configurar `TURNSTILE_SECRET_KEY`, `NFC_ALLOWED_ORIGINS`, `NFC_PUBLISHABLE_KEY` y variables backend de Supabase; desplegar `nfc-attendance`; publicar frontend y configurar CAPTCHA de Auth coordinadamente; obtener URLs reales del panel y probar con cuentas y dispositivos propios antes de grabar etiquetas finales.

Referencia de seguridad consultada: [funciones y permisos de Supabase](https://supabase.com/docs/guides/database/functions).
