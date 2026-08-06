# Emerson Cleaning Control

Aplicación web para controlar los recorridos de limpieza del edificio Emerson.

## Funciones incluidas

- Inicio de sesión con Supabase Auth.
- Roles de administrador, coordinación y personal operativo.
- Dashboard diario por piso.
- Catálogo de 101 áreas de Emerson.
- Registro de áreas limpias, ocupadas, reprogramadas o que requieren atención.
- Observaciones y hora de reprogramación.
- Administración de áreas sin perder historial.
- Reportes filtrados y descarga XLSX con dashboard.

## Publicación en GitHub Pages

1. Descomprima el ZIP.
2. Suba todo el contenido directamente a la raíz del repositorio.
3. Reemplace los archivos anteriores cuando GitHub lo solicite.
4. Confirme que `index.html` quede en la raíz.
5. Espere uno o dos minutos y actualice la página con `Ctrl + F5`.

## Supabase

La aplicación ya apunta al proyecto configurado en `supabase-config.js`.
Las tablas utilizadas llevan el prefijo `crl_` para no mezclarse con otras aplicaciones del proyecto compartido.

No publique ni agregue una clave `service_role`. La aplicación utiliza solamente la clave pública de frontend.
