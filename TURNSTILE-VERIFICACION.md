# Integración Turnstile — 22/09/2026

Preparada localmente, sin commit, push ni despliegue. Site key pública configurada: `0x4AAAAAAFAdAaOu84ToJ37E`. Widget Managed para `rodrigogar130-cmyk.github.io`. No se recibió ni incorporó ninguna Secret key.

## Cambios de esta fase

- `js/nfc-config.js`: Site key pública compartida.
- `js/auth-turnstile.js`: token nuevo por intento, limpieza del widget, bloqueo ante error, expiración o fallo de carga; sin guardar tokens.
- `js/auth.js`: `captchaToken` en registro, acceso por contraseña, recuperación y reenvío de confirmación. OAuth Google conserva su flujo.
- `js/ui.js`: mensaje de error de verificación en español.
- `js/activity-page.js`: carga de Turnstile con límite de espera, recuperación ante fallos y comprobación de respuesta HTTP.
- `supabase/functions/nfc-attendance/handler.mjs`: rechazo seguro ante fallos HTTP, red o JSON de Siteverify. Verifica hostname, acción y actividad antes de confirmar asistencia; lee exclusivamente `TURNSTILE_SECRET_KEY` del entorno del servidor.
- Pruebas: `tests/frontend.mjs`, `tests/nfc-handler.mjs`, `tests/turnstile.mjs`. Documentación NFC actualizada.

## Activación pendiente: necesaria para impedir bypass

1. Guardar la Secret key directamente en Supabase → Edge Functions → Secrets, nombre `TURNSTILE_SECRET_KEY`. No ponerla en GitHub, HTML, JS público, capturas ni chat.
2. **Supabase Auth requiere además su configuración nativa:** Authentication → Bot and Abuse Protection → CAPTCHA → Turnstile, guardar la clave secreta directamente en ese panel y habilitar CAPTCHA. Auth no lee automáticamente el secreto de Edge Functions. La aplicación solo envía `captchaToken`; Supabase Auth realiza la validación server-side. Si se exige que el secreto exista únicamente como variable de Edge Functions, esa restricción no permite activar CAPTCHA nativo de Auth mediante la integración estándar.
3. Publicar el frontend preparado de forma coordinada con la activación de Auth. Habilitar Auth antes de publicar estos cambios puede bloquear formularios antiguos que todavía no envían tokens.
4. Aplicar la migración y desplegar NFC siguiendo `NFC-IMPLEMENTACION.md`. La consulta remota de esta sesión no encontró la tabla/RPC de asistencia ni Edge Functions desplegadas.
5. Verificar con una cuenta propia registro, confirmación, login, recuperación, reenvío y asistencia. Desde API comprobar rechazo de solicitudes sin token, con token inválido, caducado o reutilizado. No se ejecutaron solicitudes reales de creación de cuentas o envío de correos.

Sin el paso 2, un cliente puede omitir el frontend y llamar directamente a Auth. No se afirma protección activa en producción ni ausencia de bypass remoto hasta completar y verificar la configuración. NFC falla cerrado cuando falta su secreto y su escritura está restringida al backend por la migración.

## Validación local

```sh
node --experimental-vm-modules tests/frontend.mjs
node --experimental-vm-modules tests/turnstile.mjs
node tests/nfc-handler.mjs
node tests/database.mjs
git diff --check
```

Las pruebas usan Auth y Siteverify simulados y PostgreSQL local PGlite. Cubren propagación de tokens en las cuatro operaciones, ausencia de llamadas cuando CAPTCHA falla, tokens nuevos, errores/expiración/timeout, limpieza y reintento, rechazo server-side NFC y permisos de escritura. No sustituyen pruebas con tokens reales ni Safari/iPhone. Los archivos públicos contienen la Site key, nunca el secreto privado; las claves públicas de Supabase existentes siguen siendo necesarias y no son secretos.

Fuentes: [CAPTCHA nativo de Supabase Auth](https://supabase.com/docs/guides/auth/auth-captcha), [validación server-side de Cloudflare](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
