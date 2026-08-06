# Control de recorridos — versión 1

Primera versión funcional para recorridos de limpieza por piso.

## Incluye
- Catálogo inicial de 85 áreas obtenido del archivo suministrado.
- Recorrido por pisos y progreso diario.
- Estados: Limpio, Área ocupada, Reprogramado y Requiere atención.
- Observaciones y hora para retomar.
- Vista de pendientes.
- Administración de áreas: agregar, editar, ordenar, activar/desactivar y eliminar.
- Protección de historial: si un área tiene registros, se desactiva en lugar de eliminarse.
- Reportes filtrables y descarga CSV.
- Roles de demostración: Administrador y Personal operativo.
- Persistencia local mediante localStorage.
- Esquema SQL preparado para Supabase.

## Ejecutar
No abra `index.html` directamente si el navegador bloquea la carga de `areas.json`.

En la carpeta del proyecto ejecute:

```bash
python -m http.server 8080
```

Luego abra `http://localhost:8080`.

## Conexión a Supabase
Esta entrega no contiene credenciales. `supabase-config.js` y `supabase-schema.sql` quedan listos para la siguiente fase. Antes de producción se debe sustituir la persistencia local por Supabase Auth, consultas a las tablas y políticas RLS verificadas.
