# Supabase JS 2.57.4

`supabase.js` es una copia sin modificaciones de `dist/umd/supabase.js`
del paquete oficial `@supabase/supabase-js@2.57.4`, con sus dependencias
incluidas en una distribución de navegador UMD. `LICENSE` es la licencia
MIT incluida en ese mismo paquete.

- Paquete: https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.57.4.tgz
- Archivo descargado: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js
- Licencia: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/LICENSE
- Integridad SHA-512 del paquete oficial:
  `LcbTzFhHYdwfQ7TRPfol0z04rLEyHabpGYANME6wkQ/kLtKNmI+Vy+WEM8HxeOZAtByUFxoUTTLwhXmrh+CcVw==`
- SHA-256 de `supabase.js`:
  `7e94b62086deecef8c0ba3b38f514e2a1944ff6c81d92fb3ff967828c406c38f`

Se verificaron la integridad del tarball y la igualdad byte por byte del
bundle y la licencia con los archivos del paquete oficial.

Cada página carga este archivo como script clásico local, sin `async` ni
`defer`, antes de sus scripts de módulo. El bundle UMD no se importa como
módulo ES. Después, `js/supabase-client.js` usa
`globalThis.supabase?.createClient` para crear la instancia compartida.
El bundle, los módulos de entrada y sus imports relativos usan la versión
`?v=20260921-4` para evitar mezclar versiones almacenadas en caché.
En `confirmar.html` cargar el bundle no crea el cliente ni consume el token:
el módulo del cliente sigue cargándose solo al confirmar explícitamente.
Se conserva la configuración de Auth existente. No necesita un CDN en
ejecución, instalación npm ni compilación. La agenda pública consulta
la RPC anónima por HTTP de manera independiente del SDK y de Auth.
