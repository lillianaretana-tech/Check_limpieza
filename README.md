# Control de Recorridos de Limpieza

Aplicación web conectada a Supabase para registrar recorridos de limpieza por piso, observaciones, reprogramaciones, administración de áreas y reportes.

## Archivos que se suben a GitHub Pages

Suba directamente a la raíz del repositorio:

- `index.html`
- `styles.css`
- `app.js`
- `supabase-config.js`

Los siguientes archivos también pueden quedar en la raíz como respaldo/documentación, pero el navegador no los necesita para ejecutar la app:

- `supabase-schema.sql`
- `areas.json`
- `README.md`

## Estructura correcta en GitHub

```text
/
├── index.html
├── styles.css
├── app.js
├── supabase-config.js
├── supabase-schema.sql
├── areas.json
└── README.md
```

No suba una carpeta adicional que contenga estos archivos. `index.html` debe verse directamente al abrir el repositorio.

## Supabase

La app ya está configurada para el proyecto:

`https://uamyglxdzmdrwjdfscvg.supabase.co`

Las tablas de esta aplicación usan el prefijo `crl_` para no interferir con las demás apps del proyecto compartido.

## Crear usuarios

1. En Supabase abra **Authentication > Users**.
2. Cree el usuario con correo y contraseña.
3. El trigger de la base crea automáticamente su perfil como `staff`.
4. Para convertirlo en administrador, ejecute en SQL Editor:

```sql
update public.crl_profiles
set role = 'admin', active = true
where id = (
  select id from auth.users where email = 'CORREO@EJEMPLO.COM'
);
```

Roles disponibles:

- `admin`: administra áreas y consulta todos los reportes.
- `coordinator`: administra áreas y consulta todos los reportes.
- `staff`: registra y consulta únicamente sus recorridos.

## Publicar con GitHub Pages

1. Cree o abra el repositorio.
2. Suba los archivos a la raíz.
3. Vaya a **Settings > Pages**.
4. En **Build and deployment**, seleccione **Deploy from a branch**.
5. Seleccione la rama `main` y la carpeta `/root`.
6. Guarde y espere a que GitHub muestre el enlace publicado.

## Notas

- La clave del archivo `supabase-config.js` es la clave pública `anon`, no una clave de servicio.
- No coloque nunca una clave `service_role` dentro del repositorio.
- La aplicación necesita conexión a Internet para comunicarse con Supabase y cargar la librería oficial desde CDN.
