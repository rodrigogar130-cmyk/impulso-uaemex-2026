# Primera fase de cuentas — IMPULSO UAEMÉX 2026

La landing sigue en `index.html`. No se creó un segundo index ni se cambió su URL.

## Flujo actualizado: inscripción automática

Crear cuenta → confirmar correo → iniciar sesión → cargar/crear perfil → garantizar inscripción y folio → Mi cuenta. Ya no hay botón de inscripción al evento. `js/prepare-account.js` centraliza la operación y verifica `email_confirmed_at` mediante `getUser()`. Primero consulta la inscripción existente; solo inserta si falta. La restricción UNIQUE y la recuperación tras error 23505 resuelven intentos simultáneos. El navegador envía únicamente event_id; PostgreSQL sigue generando el folio. No se requiere ni se ejecutó otra migración.

Si una cuenta antigua no tiene los datos necesarios, se solicita completar el perfil. Guardarlo finaliza automáticamente la inscripción. Un registro cancelado se conserva, sin duplicarlo ni reactivarlo.

## Estado

- Implementación local de cuentas, perfil, inscripción al festival y pasaporte inicial.
- Migración ejecutada y probada en PostgreSQL local aislado (PGlite), con roles y helpers de Auth de prueba.
- URL y clave pública configuradas. El usuario confirmó que aplicó la migración `users_events_phase_one` en Supabase real. No se volvió a ejecutar ni modificar la migración.
- Verificación real: Auth devuelve HTTP 200 con Email habilitado, confirmación obligatoria y usuarios anónimos deshabilitados. Las tres tablas rechazan consultas sin sesión con `42501` (HTTP 401).
- Pendiente probar correos reales, persistencia entre pestañas y los anchos 1440, 1024, 768, 430 y 390 px en navegador. El navegador integrado no estuvo disponible en esta sesión.
- No hay QR, tablas de actividades, asistencias, premios, emisión de insignias ni panel administrativo. El pasaporte muestra únicamente su estado inicial.

## Archivos

- Nuevos: `registro.html`, `login.html`, `recuperar-password.html`, `mi-cuenta.html`, `pasaporte.html`.
- Estilos: `css/account.css`.
- Módulos: `js/config.js`, `js/supabase-client.js`, `js/auth.js`, `js/ui.js`, `js/navbar-auth.js`, `js/profile.js`, `js/event-registration.js`, `js/private-page.js`, `js/registro.js`, `js/login.js`, `js/recovery.js`, `js/account.js`, `js/passport.js`, `js/prepare-account.js`.
- SQL: `supabase/migrations/001_users_events.sql`, `supabase/verify.sql`, `supabase/tests/phase1.sql`.
- Pruebas: `tests/database.mjs`, `tests/frontend.mjs`.
- Modificado: `index.html` (enlaces, navbar, aviso de registro y estilos de navegación necesarios).
- Respaldo: `backups/landing-antes-auth.html`.
- `.gitignore` excluye dependencias de pruebas, respaldos, resultados y archivos de entorno.

## Configuración

1. **La migración ya fue aplicada según confirmación del usuario. No volver a ejecutarla.** `supabase/migrations/001_users_events.sql` queda como referencia de la estructura preparada.
2. Ejecutar `supabase/verify.sql`. Esperar tres tablas con RLS `true`, seis políticas, permisos limitados por columna, slug `impulso-uaemex-2026`, estado `open`, fechas 15 y 16 de octubre y secuencia sin ciclo.
3. Ejecutar `supabase/tests/phase1.sql` como postgres para verificar aislamiento con dos usuarios temporales. Revierte las filas de prueba; los números de secuencia consumidos no se reciclan. Una excepción FAIL indica que hay que corregir antes de abrir registros.
4. `js/config.js` ya contiene la URL HTTPS del proyecto y su Publishable Key. No hay claves privadas ni se necesitan para las consultas frontend.
5. Mantener Email habilitado, confirmación obligatoria y usuarios anónimos deshabilitados. Establecer contraseña mínima de al menos 8 caracteres.
6. Site URL: la URL base del sitio con barra final; por ejemplo `http://127.0.0.1:5500/` en local o `https://rodrigogar130-cmyk.github.io/impulso-uaemex-2026/` en producción. No terminarla en `index.html`: la plantilla de confirmación concatena `confirmar.html`.
7. Redirect URLs: `http://127.0.0.1:5500/**` y `http://localhost:5500/**`. No incluir barras invertidas delante de los asteriscos.
8. Después de publicar `confirmar.html`, cambiar manualmente únicamente el enlace de **Confirm signup** como se indica abajo. Confirmación vuelve a `login.html?confirmed=1`; recuperación conserva su plantilla y vuelve a `recuperar-password.html?mode=reset`.
9. Abrir la landing con Live Server. Usar el mismo origen de forma consistente: localhost y 127.0.0.1 tienen almacenamientos de sesión diferentes.

El SDK v2.57.4 se carga desde esm.sh; la única instancia se crea en `js/supabase-client.js`. Todos los módulos la importan. La sesión se persiste y renueva mediante Supabase. Las páginas privadas validan al usuario y RLS protege los datos incluso ante peticiones directas.

## Prueba manual del flujo

1. En la landing pulsar **Regístrate**.
2. Completar nombre, apellidos, tipo, correo, contraseña y confirmación. Para estudiantes completar número de cuenta y espacio académico. Teléfono es opcional.
3. Pulsar **Crear cuenta**. Debe aparecer el mensaje de confirmación por correo. Aún no existe inscripción al evento.
4. Abrir el correo y seguir el enlace a `confirmar.html`. La visita no verifica el token. Pulsar **CONFIRMAR MI CUENTA**; tras verificarlo, regresa a login y la sesión de confirmación se cierra para solicitar el inicio de sesión explícito.
5. Iniciar sesión. Antes de abrir Mi cuenta se crea/consulta el perfil y se garantiza automáticamente la inscripción al festival.
6. Mi cuenta muestra directamente **REGISTRO CONFIRMADO**, folio `IMP-2026-XXXXXX` y fecha, sin otro botón de inscripción.
7. Recargar. Debe conservarse el mismo folio. Otro intento de inscripción no debe generar una segunda fila.
8. Pulsar **VER MI PASAPORTE**. Esperar `0 / 12 ACTIVIDADES` e insignia bloqueada.
9. Cerrar sesión e intentar abrir Mi cuenta o el pasaporte: debe volver a login.
10. Probar **Olvidé mi contraseña**, abrir el correo, establecer una nueva contraseña e iniciar sesión con ella. El formulario de recuperación muestra un mensaje para enlaces inválidos o caducados.
11. Si falta la confirmación, desplegar **¿No recibiste el correo de confirmación?** en login y reenviarla.

## RLS y pruebas

Las tablas privadas no conceden acceso a visitantes. Un usuario puede insertar y editar únicamente los campos de su propio perfil; no puede cambiar su ID o correo por esta vía. Los eventos publicados son legibles para usuarios autenticados. Las inscripciones solo admiten `event_id`: propietario, folio, estado y fecha se asignan en la base. No se permite modificar ni borrar inscripciones desde el cliente.

La prueba SQL crea usuarios A y B temporales y comprueba lectura y modificación cruzadas, lectura propia, edición propia, bloqueo de suplantación, cambio de estado y correo, validación de estudiantes, ausencia de inscripción por el mero INSERT de un perfil (la orquestación automática corresponde al cliente después del login confirmado), duplicados y folios distintos. No utiliza una clave privilegiada en el frontend.

Para repetir localmente las pruebas (dependencias solo de desarrollo; la aplicación no requiere npm):

```powershell
npm.cmd install --prefix .test-runtime --cache .test-runtime/npm-cache --no-save --ignore-scripts @electric-sql/pglite linkedom
node tests/database.mjs
node --experimental-vm-modules tests/frontend.mjs
```

Las pruebas DOM utilizan Supabase simulado: comprueban lógica, mensajes y navegación, pero no prueban SMTP, Auth real, CSS calculado ni renderizado. Las pruebas SQL utilizan PostgreSQL real embebido con un esquema Auth mínimo; deben repetirse en Supabase con los archivos entregados.

Para probar cuentas reales A y B, usar dos correos propios y navegadores/perfiles separados. Registrar ambos y verificar folios diferentes. Repetir además la prueba SQL: comprobar solo la interfaz no demuestra aislamiento RLS.

## Referencias consultadas

- https://supabase.com/docs/reference/javascript/initializing
- https://supabase.com/docs/reference/javascript/auth-signup
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Pendientes para activar el servicio

La configuración pública está completa y la migración fue aplicada por el usuario. Falta completar el recorrido con un correo real confirmado, comprobar aislamiento entre dos cuentas reales, duplicados, persistencia/cierre de sesión y consola en navegador. Las pruebas locales no sustituyen estas comprobaciones. No se solicitarán contraseñas ni enlaces de confirmación al usuario.

Live Server devolvió HTTP 200 para `registro.html`, `login.html`, `mi-cuenta.html` y `pasaporte.html`. Que un HTML privado se pueda descargar es normal en un sitio estático: el acceso a sus datos depende de la sesión y de RLS. El SDK y sus dependencias directas devolvieron HTTP 200; el SDK admite CORS. Esto no equivale a una revisión de consola en un navegador real.

## Verificación de la corrección de flujo

23 comprobaciones DOM con Supabase simulado aprobaron: creación sin folio previo a confirmar, confirmación sin inscripción previa al login, login con preparación antes de redirección, inscripción automática, recarga con el mismo folio y sin nueva inserción, carrera de solicitudes, rechazo de correo sin confirmar y conservación de registros cancelados. El esquema SQL permanece sin cambios. La prueba end-to-end real por correo y navegador sigue pendiente; estas pruebas no la sustituyen.

## Confirmación manual de correo: activación pendiente

No se modificó Supabase ni la plantilla desde código. Publicar primero confirmar.html y js/confirm-email.js; después, en Authentication → Email Templates → Confirm signup, sustituir solamente el href del botón, conservando sus estilos:

```html
<!-- Antes -->
href="{{ .ConfirmationURL }}"
<!-- Después -->
href="{{ .SiteURL }}confirmar.html?token_hash={{ .TokenHash }}&amp;type=email"
```

El &amp; corresponde a HTML. Verificar manualmente que Site URL sea la base de producción con su subdirectorio y barra final, indicada arriba. Si conserva index.html o falta la barra final, la concatenación generará una URL incorrecta. No cambiar SMTP, la plantilla de recuperación, las tablas ni los permisos.

La página intermedia carga el header y los estilos compartidos, pero no inicializa el cliente Auth ni verifica al cargar, recuperar foco o volver a estar visible. Solo el botón importa el cliente existente y llama verifyOtp con token_hash y type email. Un enlace incompleto o de otro tipo no carga el cliente. Se bloquean clics duplicados; los errores de token tienen un mensaje neutral y los fallos temporales permiten reintentar. El éxito reemplaza la URL por login.html?confirmed=1 sin crear perfil, inscripción ni folio.

El token permanece solo en memoria durante la verificación; no se copia a storage, cookies ni consola. La política no-referrer evita enviarlo como referente al navegar o cargar recursos. La sesión que produce verifyOtp la gestiona el SDK existente; login confirmado la cierra y mantiene el requisito de iniciar sesión explícitamente.

El formulario ofrece controles independientes Mostrar/Ocultar con botones nativos, etiquetas accesibles y sin cambiar las contraseñas. El aviso de registro conserva la respuesta neutral para cuentas existentes, añade Spam/Correo no deseado/Promociones y no anuncia envío ante errores de SMTP o límite de solicitudes. El reenvío sigue disponible desde login.

Antes de activar la plantilla, probar un correo real: abrir el enlace sin pulsar no debe consumirlo; el clic debe confirmar una sola vez; luego iniciar sesión explícitamente. Las pruebas locales usan Auth simulado y no verifican entrega de correo ni el comportamiento de Outlook/Safe Links. El paso intermedio evita consumo por visitas/prefetch, pero no garantiza protección frente a un escáner que también active botones.

Referencia: [plantillas y prefetch de correo de Supabase](https://supabase.com/docs/guides/auth/auth-email-templates).
