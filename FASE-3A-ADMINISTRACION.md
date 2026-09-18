# Fase 3A: administración y edición operativa

Implementación local. **003_admin_panel.sql NO se ha ejecutado en Supabase real.**
La migración requiere la 002 definitiva sin cupos y su catálogo; no ejecutar nuevamente 001 o 002 en un proyecto donde ya existen.

## Activación posterior a revisión

1. Revisar `supabase/migrations/003_admin_panel.sql` y aplicarla una sola vez cuando se autorice.
2. Asignar manualmente un usuario real en SQL Editor, sustituyendo el marcador:

```sql
insert into public.admin_users(user_id,role)
values ('UUID_REAL_DEL_USUARIO','super_admin');
```

El marcador no es un UUID ejecutable. No se crearon administradores ni usuarios en producción. No se usa `profiles.tipo_usuario` para permisos. `super_admin` y `staff` pueden consultar el panel y editar los mismos campos operativos en esta fase. No pueden asignar roles desde la aplicación.

3. Iniciar sesión y abrir `admin.html`. El acceso en la navegación solo aparece después de comprobar el rol.
4. Probar edición, cancelación, participantes, búsqueda por nombre/correo/folio y rutas. Confirmar con otra cuenta normal que no obtiene datos administrativos.

## Seguridad

`admin_users` tiene RLS, no tiene policies de acceso directo y sus permisos están revocados para clientes. Todas las RPC administrativas llaman al helper privado `require_impulso_admin`, que valida `auth.uid()` y bloquea con `ADMIN_REQUIRED` si no existe asignación. Usa bloqueo compartido de la fila de rol durante la transacción; una revocación posterior impide nuevas operaciones.

Las RPC administrativas usan `SECURITY DEFINER`, `search_path=''` y nombres cualificados; solo `authenticated` tiene EXECUTE. El helper no es invocable desde el cliente. No se ampliaron policies de perfiles o inscripciones. No hay secretos ni clientes Supabase adicionales.

`updated_by` y `updated_at` solo se devuelven en respuestas administrativas. La tabla pública permite SELECT de columnas explícitas: SELECT * y SELECT updated_by fallan para anon/authenticated. Las dos RPC públicas/privadas de agenda usan proyecciones explícitas sin auditoría.

La 003 recrea `list_impulso_activities()` porque cambia su tipo de retorno. DROP no usa CASCADE: si en producción se añadieron dependencias no conocidas, la transacción falla sin borrarlas. El constraint original se busca por su definición normalizada exacta; si no se encuentra exactamente uno, se aborta. No se adivinan nombres ni se eliminan otras restricciones.

## Edición y horarios

Campos editables: ponente(s) como texto, fecha, inicio, término, ubicación, descripción y estado. Título, escenario y slug son de solo lectura. La RPC no recibe id de evento, slug, fecha de creación ni identidad/fecha de auditoría como valores modificables.

OPEN requiere fecha, pero las horas son opcionales e independientes. Cuando ambas existen, término > inicio. No se cambian los estados de las 67 actividades existentes ni se inventan datos.

Las filas existentes tienen auditoría NULL hasta su primera edición. Cada edición exige una versión `expected_updated_at`, compara con IS NOT DISTINCT FROM bajo bloqueo de fila y asigna updated_at=now(), updated_by=auth.uid(). EDIT_CONFLICT exige recargar y revisar antes de volver a guardar; no hay reintento automático que sobrescriba otra edición.

## Datos y actualización pública

La landing genera las tarjetas desde Supabase. Se retiraron las 67 tarjetas duplicadas del HTML y `js/public-agenda.js`. Se mantiene la semilla y el JSON de referencia como artefactos, no como fuentes del frontend.

Tras guardar, el panel vuelve a consultar el detalle. Las otras pestañas del navegador reciben una señal local que solo indica que hubo cambios, sin datos privados. Agenda y Mi ruta consultan de nuevo al recuperar el foco y cada 30 segundos mientras son visibles. Si falla una actualización conservan la última respuesta correcta; si falla la primera consulta pública muestran un aviso general sin inventar actividades ni consultar la ruta privada de visitantes.

Las nuevas exportaciones de calendario usan los datos actuales. Los eventos ya importados en Google o Apple no se sincronizan automáticamente. Se conserva el formulario de horario personal para actividades con información incompleta.

## Métricas

Usuarios registrados cuenta las inscripciones confirmadas al festival. Usuarios muestra las personas con inscripción al evento, también las canceladas. Rutas cuenta usuarios distintos con selecciones registered; selecciones cuenta dichas filas; actividades disponibles cuenta open. Los participantes muestran selección activa o cancelada. Asistencias es 0 y el bloque de asistencia está marcado Próximamente, sin tabla de asistencia.

## Verificación local

- `node tests/database.mjs`: PostgreSQL aislado con PGlite; migraciones, regresión de fases 1 y 2 y pruebas de permisos, datos privados, versión NULL, conflicto de edición, horas independientes, otro evento y revocación de roles.
- `node --experimental-vm-modules tests/frontend.mjs`: DOM y API simulada; autenticación, folios, ruta, calendarios y panel.
- `node tests/calendar.mjs`: formato ICS, zona, enlaces Google y validación de horarios.
- `supabase/tests/admin.sql`: consultas de verificación manual de solo lectura para después de aplicar la migración; no ejecutadas en producción.

El navegador integrado no estuvo disponible. Quedan pendientes la revisión visual responsive, la prueba con Supabase real tras aplicar 003 y la prueba de ediciones simultáneas desde dos sesiones reales. Las pruebas locales comprueban versiones obsoletas secuencialmente; no equivalen a dos conexiones de producción concurrentes.

No se implementaron QR, escáner, asistencias, insignias, premios, exportaciones CSV/Excel, correos ni administración de cuentas/roles desde frontend.
