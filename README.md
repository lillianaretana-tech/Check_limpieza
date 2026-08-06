# Control de Recorridos de Limpieza v1.1

Aplicación web conectada al proyecto Supabase `SBM_Limpiando_ojos`.

## Incluye
- 85 áreas cargadas y organizadas por piso.
- Inicio de sesión con Supabase Auth.
- Registro de limpieza, área ocupada, reprogramación y atención requerida.
- Observaciones y hora para retomar.
- Reportes y descarga CSV compatible con Excel.
- Administración de áreas para perfiles `admin` y `coordinator`.
- Historial de cambios y RLS.
- Tablas aisladas con prefijo `crl_` para no interferir con otras apps.

## Publicación
Suba todos los archivos de esta carpeta al mismo repositorio o servicio de hosting estático. No abra `index.html` directamente con doble clic; use GitHub Pages, Vercel, Netlify o un servidor local.

## Acceso inicial
1. Cree el usuario en Supabase Authentication > Users.
2. El trigger crea automáticamente su perfil como `staff`.
3. Para convertirlo en administrador, ejecute en SQL Editor:

```sql
update public.crl_profiles
set role = 'admin', full_name = 'Nombre de la persona'
where id = (select id from auth.users where email = 'correo@ejemplo.com');
```

Nunca coloque una `service_role key` en estos archivos. La clave incluida es únicamente la clave pública/anon.
