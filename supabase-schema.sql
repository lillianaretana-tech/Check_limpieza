-- Control de Recorridos de Limpieza (CRL)
-- Objetos aislados con prefijo crl_ para convivir con otras apps.

create extension if not exists pgcrypto;
create schema if not exists crl_private;
revoke all on schema crl_private from public, anon, authenticated;

create table if not exists public.crl_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('admin','coordinator','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crl_areas (
  id uuid primary key default gen_random_uuid(),
  floor smallint not null check (floor between 1 and 99),
  name text not null,
  code text not null unique,
  area_type text not null,
  display_order integer not null default 1 check (display_order > 0),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crl_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  floor smallint check (floor between 1 and 99),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'open' check (status in ('open','completed','cancelled'))
);

create table if not exists public.crl_cleaning_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.crl_runs(id) on delete set null,
  area_id uuid not null references public.crl_areas(id) on delete restrict,
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('Limpio','Área ocupada','Reprogramado','Requiere atención')),
  note text not null default '',
  reschedule_time time,
  recorded_at timestamptz not null default now()
);

create table if not exists public.crl_area_audit (
  id bigint generated always as identity primary key,
  area_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists crl_areas_floor_order_idx on public.crl_areas(floor, display_order) where active;
create index if not exists crl_logs_area_recorded_idx on public.crl_cleaning_logs(area_id, recorded_at desc);
create index if not exists crl_logs_user_recorded_idx on public.crl_cleaning_logs(user_id, recorded_at desc);
create index if not exists crl_runs_user_started_idx on public.crl_runs(user_id, started_at desc);

create or replace function crl_private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.crl_profiles p
    where p.id = (select auth.uid())
      and p.active
      and p.role in ('admin','coordinator')
  );
$$;
revoke all on function crl_private.is_manager() from public;
grant execute on function crl_private.is_manager() to authenticated;

create or replace function crl_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.crl_profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''),'@',1)), 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function crl_private.handle_new_user() from public;

drop trigger if exists crl_on_auth_user_created on auth.users;
create trigger crl_on_auth_user_created
  after insert on auth.users
  for each row execute function crl_private.handle_new_user();

create or replace function crl_private.audit_area_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.crl_area_audit(area_id, action, before_data, after_data, changed_by)
  values (coalesce(new.id, old.id), tg_op, to_jsonb(old), to_jsonb(new), (select auth.uid()));
  return coalesce(new, old);
end;
$$;
revoke all on function crl_private.audit_area_change() from public;

drop trigger if exists crl_areas_audit_trigger on public.crl_areas;
create trigger crl_areas_audit_trigger
  after insert or update or delete on public.crl_areas
  for each row execute function crl_private.audit_area_change();

alter table public.crl_profiles enable row level security;
alter table public.crl_areas enable row level security;
alter table public.crl_runs enable row level security;
alter table public.crl_cleaning_logs enable row level security;
alter table public.crl_area_audit enable row level security;

drop policy if exists crl_profiles_select on public.crl_profiles;
create policy crl_profiles_select on public.crl_profiles for select to authenticated
using ((select auth.uid()) = id or crl_private.is_manager());

drop policy if exists crl_profiles_manage on public.crl_profiles;
create policy crl_profiles_manage on public.crl_profiles for update to authenticated
using (crl_private.is_manager()) with check (crl_private.is_manager());

drop policy if exists crl_areas_select on public.crl_areas;
create policy crl_areas_select on public.crl_areas for select to authenticated using (true);

drop policy if exists crl_areas_insert on public.crl_areas;
create policy crl_areas_insert on public.crl_areas for insert to authenticated
with check (crl_private.is_manager());

drop policy if exists crl_areas_update on public.crl_areas;
create policy crl_areas_update on public.crl_areas for update to authenticated
using (crl_private.is_manager()) with check (crl_private.is_manager());

drop policy if exists crl_areas_delete on public.crl_areas;
create policy crl_areas_delete on public.crl_areas for delete to authenticated
using (crl_private.is_manager());

drop policy if exists crl_runs_select on public.crl_runs;
create policy crl_runs_select on public.crl_runs for select to authenticated
using ((select auth.uid()) = user_id or crl_private.is_manager());

drop policy if exists crl_runs_insert on public.crl_runs;
create policy crl_runs_insert on public.crl_runs for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists crl_runs_update on public.crl_runs;
create policy crl_runs_update on public.crl_runs for update to authenticated
using ((select auth.uid()) = user_id or crl_private.is_manager())
with check ((select auth.uid()) = user_id or crl_private.is_manager());

drop policy if exists crl_logs_select on public.crl_cleaning_logs;
create policy crl_logs_select on public.crl_cleaning_logs for select to authenticated
using ((select auth.uid()) = user_id or crl_private.is_manager());

drop policy if exists crl_logs_insert on public.crl_cleaning_logs;
create policy crl_logs_insert on public.crl_cleaning_logs for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists crl_audit_select on public.crl_area_audit;
create policy crl_audit_select on public.crl_area_audit for select to authenticated
using (crl_private.is_manager());

-- Exposición explícita a Data API (requerida en proyectos nuevos desde 2026).
grant usage on schema public to authenticated;
grant select on public.crl_profiles to authenticated;
grant update(full_name, role, active, updated_at) on public.crl_profiles to authenticated;
grant select, insert, update, delete on public.crl_areas to authenticated;
grant select, insert, update on public.crl_runs to authenticated;
grant select, insert on public.crl_cleaning_logs to authenticated;
grant select on public.crl_area_audit to authenticated;
grant usage, select on sequence public.crl_area_audit_id_seq to authenticated;

insert into public.crl_areas(name, code, area_type, floor, display_order, notes, active) values
('Piso 1 - Training Room 1','P1-TRAINING-ROO-01','Training Room',1,1,'',true),
('Piso 1 - Training Room 2','P1-TRAINING-ROO-02','Training Room',1,2,'',true),
('Piso 1 - Training Room 3','P1-TRAINING-ROO-03','Training Room',1,3,'',true),
('Piso 1 - Training Room 4','P1-TRAINING-ROO-04','Training Room',1,4,'',true),
('Piso 1 - Oficina 1','P1-OFICINA-01','Oficina',1,5,'',true),
('Piso 1 - Oficina 2','P1-OFICINA-02','Oficina',1,6,'',true),
('Piso 1 - Oficina 3','P1-OFICINA-03','Oficina',1,7,'',true),
('Piso 1 - Oficina 4','P1-OFICINA-04','Oficina',1,8,'',true),
('Piso 1 - Oficina 5','P1-OFICINA-05','Oficina',1,9,'',true),
('Piso 1 - Oficina 6','P1-OFICINA-06','Oficina',1,10,'',true),
('Piso 1 - Oficina 7','P1-OFICINA-07','Oficina',1,11,'',true),
('Piso 1 - Oficina 8','P1-OFICINA-08','Oficina',1,12,'',true),
('Piso 1 - Meeting Room 1','P1-MEETING-ROOM-01','Meeting Room',1,13,'',true),
('Piso 1 - Meeting Room 2','P1-MEETING-ROOM-02','Meeting Room',1,14,'',true),
('Piso 1 - Laboratorio 1','P1-LABORATORIO-01','Laboratorio',1,15,'',true),
('Piso 1 - Laboratorio 2','P1-LABORATORIO-02','Laboratorio',1,16,'',true),
('Piso 1 - Laboratorio 3','P1-LABORATORIO-03','Laboratorio',1,17,'',true),
('Piso 1 - Otro 1','P1-OTRO-01','Otro',1,18,'',true),
('Piso 1 - Otro 2','P1-OTRO-02','Otro',1,19,'',true),
('Piso 1 - Otro 3','P1-OTRO-03','Otro',1,20,'',true),
('Piso 1 - Otro 4','P1-OTRO-04','Otro',1,21,'',true),
('Piso 1 - Otro 5','P1-OTRO-05','Otro',1,22,'',true),
('Piso 2 - Training Room 1','P2-TRAINING-ROO-01','Training Room',2,1,'',true),
('Piso 2 - Training Room 2','P2-TRAINING-ROO-02','Training Room',2,2,'',true),
('Piso 2 - Oficina 1','P2-OFICINA-01','Oficina',2,3,'',true),
('Piso 2 - Oficina 2','P2-OFICINA-02','Oficina',2,4,'',true),
('Piso 2 - Oficina 3','P2-OFICINA-03','Oficina',2,5,'',true),
('Piso 2 - Oficina 4','P2-OFICINA-04','Oficina',2,6,'',true),
('Piso 2 - Meeting Room 1','P2-MEETING-ROOM-01','Meeting Room',2,7,'',true),
('Piso 2 - Meeting Room 2','P2-MEETING-ROOM-02','Meeting Room',2,8,'',true),
('Piso 2 - Meeting Room 3','P2-MEETING-ROOM-03','Meeting Room',2,9,'',true),
('Piso 2 - Meeting Room 4','P2-MEETING-ROOM-04','Meeting Room',2,10,'',true),
('Piso 2 - Meeting Room 5','P2-MEETING-ROOM-05','Meeting Room',2,11,'',true),
('Piso 2 - Meeting Room 6','P2-MEETING-ROOM-06','Meeting Room',2,12,'',true),
('Piso 2 - Meeting Room 7','P2-MEETING-ROOM-07','Meeting Room',2,13,'',true),
('Piso 2 - Meeting Room 8','P2-MEETING-ROOM-08','Meeting Room',2,14,'',true),
('Piso 2 - Laboratorio 1','P2-LABORATORIO-01','Laboratorio',2,15,'',true),
('Piso 2 - Laboratorio 2','P2-LABORATORIO-02','Laboratorio',2,16,'',true),
('Piso 2 - Laboratorio 3','P2-LABORATORIO-03','Laboratorio',2,17,'',true),
('Piso 2 - Laboratorio 4','P2-LABORATORIO-04','Laboratorio',2,18,'',true),
('Piso 2 - Otro 1','P2-OTRO-01','Otro',2,19,'',true),
('Piso 3 - Training Room 1','P3-TRAINING-ROO-01','Training Room',3,1,'',true),
('Piso 3 - Training Room 2','P3-TRAINING-ROO-02','Training Room',3,2,'',true),
('Piso 3 - Oficina 1','P3-OFICINA-01','Oficina',3,3,'',true),
('Piso 3 - Oficina 2','P3-OFICINA-02','Oficina',3,4,'',true),
('Piso 3 - Oficina 3','P3-OFICINA-03','Oficina',3,5,'',true),
('Piso 3 - Oficina 4','P3-OFICINA-04','Oficina',3,6,'',true),
('Piso 3 - Oficina 5','P3-OFICINA-05','Oficina',3,7,'',true),
('Piso 3 - Oficina 6','P3-OFICINA-06','Oficina',3,8,'',true),
('Piso 3 - Oficina 7','P3-OFICINA-07','Oficina',3,9,'',true),
('Piso 3 - Oficina 8','P3-OFICINA-08','Oficina',3,10,'',true),
('Piso 3 - Meeting Room 1','P3-MEETING-ROOM-01','Meeting Room',3,11,'',true),
('Piso 3 - Meeting Room 2','P3-MEETING-ROOM-02','Meeting Room',3,12,'',true),
('Piso 3 - Meeting Room 3','P3-MEETING-ROOM-03','Meeting Room',3,13,'',true),
('Piso 3 - Meeting Room 4','P3-MEETING-ROOM-04','Meeting Room',3,14,'',true),
('Piso 3 - Laboratorio 1','P3-LABORATORIO-01','Laboratorio',3,15,'',true),
('Piso 3 - Laboratorio 2','P3-LABORATORIO-02','Laboratorio',3,16,'',true),
('Piso 3 - Laboratorio 3','P3-LABORATORIO-03','Laboratorio',3,17,'',true),
('Piso 4 - Training Room 1','P4-TRAINING-ROO-01','Training Room',4,1,'',true),
('Piso 4 - Training Room 2','P4-TRAINING-ROO-02','Training Room',4,2,'',true),
('Piso 4 - Oficina 1','P4-B4-OF-01-01','B4-OF-01',4,3,'',true),
('Piso 4 - Oficina 2','P4-B4-OF-02-02','B4-OF-02',4,4,'',true),
('Piso 4 - Oficina 3','P4-B4-OF-08-03','B4-OF-08',4,5,'',true),
('Piso 4 - Oficina 4','P4-B4-OF-03-04','B4-OF-03',4,6,'',true),
('Piso 4 - Oficina 5','P4-B4-OF-04-05','B4-OF-04',4,7,'',true),
('Piso 4 - Oficina 6','P4-B4-OF-05-06','B4-OF-05',4,8,'',true),
('Piso 4 - Oficina 7','P4-B4-OF-06-07','B4-OF-06',4,9,'',true),
('Piso 4 - Oficina 8','P4-B4-MC-02-08','B4-MC-02',4,10,'',true),
('Piso 4 - Oficina 9','P4-B4-MS-01-09','B4-MS-01',4,11,'',true),
('Piso 4 - Oficina 10','P4-B4-OF-09-10','B4-OF-09',4,12,'',true),
('Piso 4 - Oficina 11','P4-B4-OF-10-11','B4-OF-10',4,13,'',true),
('Piso 4 - Oficina 12','P4-B4-OF-11-12','B4-OF-11',4,14,'',true),
('Piso 4 - Oficina 13','P4-B4-OF-12-13','B4-OF-12',4,15,'',true),
('Piso 4 - Oficina 14','P4-B4-MS-02-14','B4-MS-02',4,16,'',true),
('Piso 4 - Oficina 15','P4-B4-MS-03-15','B4-MS-03',4,17,'',true),
('Piso 4 - Oficina 16','P4-B4-OF-14-16','B4-OF-14',4,18,'',true),
('Piso 4 - Oficina 17','P4-OFICINA-17','Oficina',4,19,'',true),
('Piso 4 - Meeting Room 1','P4-B4-MN-02-01','B4-MN-02',4,20,'',true),
('Piso 4 - Meeting Room 2','P4-B4-MN-03-02','B4-MN-03',4,21,'',true),
('Piso 4 - Meeting Room 3','P4-B4-MC-06-03','B4-MC-06',4,22,'',true),
('Piso 4 - Meeting Room 4','P4-B4-MC-01-04','B4-MC-01',4,23,'',true),
('Piso 4 - Meeting Room 5','P4-B4-MC-05-05','B4-MC-05',4,24,'',true),
('Piso 4 - Meeting Room 6','P4-B4-MC-04-06','B4-MC-04',4,25,'',true),
('Piso 4 - Meeting Room 7','P4-B4-MC-03-07','B4-MC-03',4,26,'',true),
('Piso 4 - Laboratorio 1','P4-LABORATORIO-01','Laboratorio',4,27,'',true)
on conflict (code) do update set
  name=excluded.name, area_type=excluded.area_type, floor=excluded.floor,
  display_order=excluded.display_order, notes=excluded.notes, active=excluded.active, updated_at=now();
