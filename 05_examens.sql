-- =====================================================================
-- LUKOS-REVISION — 05_examens.sql
-- 1. Service / corps du membre (Gendarmerie, Armée, BNSP)
-- 2. Simulateur d'examen : enregistrement des résultats
-- À exécuter UNE FOIS dans Supabase : SQL Editor > New query > coller > Run.
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SERVICE / CORPS
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists service text;

alter table public.profiles drop constraint if exists profiles_service_chk;
alter table public.profiles add constraint profiles_service_chk
  check (service is null or service in ('gendarmerie', 'armee', 'bnsp'));

grant select (service) on public.profiles to authenticated;

-- À la création du profil, on reprend le service choisi dans le formulaire d'inscription
create or replace function public.lukos_profile_service_from_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare v text;
begin
  if new.service is null then
    select lower(raw_user_meta_data ->> 'service') into v from auth.users where id = new.id;
    if v in ('gendarmerie', 'armee', 'bnsp') then new.service := v; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_service on public.profiles;
create trigger trg_profiles_service
  before insert on public.profiles
  for each row execute function public.lukos_profile_service_from_signup();

-- Le membre choisit ou modifie son service (inscription, « Mon compte », accueil)
create or replace function public.set_my_service(p_service text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if p_service is null or p_service not in ('gendarmerie', 'armee', 'bnsp') then
    raise exception 'Service invalide';
  end if;
  update public.profiles set service = p_service where id = auth.uid();
end;
$$;

revoke all on function public.set_my_service(text) from public, anon;
grant execute on function public.set_my_service(text) to authenticated;

-- Les comptes déjà créés avec un service dans l'inscription (s'il y en a)
update public.profiles p
   set service = lower(u.raw_user_meta_data ->> 'service')
  from auth.users u
 where u.id = p.id
   and p.service is null
   and lower(u.raw_user_meta_data ->> 'service') in ('gendarmerie', 'armee', 'bnsp');

-- ---------------------------------------------------------------------
-- 2. RÉSULTATS DU SIMULATEUR D'EXAMEN
-- ---------------------------------------------------------------------
create table if not exists public.exam_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  exam_code   text not null,
  subject_id  bigint,                                   -- null = tout le parcours
  total       int  not null check (total between 1 and 30),
  score       numeric(5,2) not null check (score >= 0),
  note20      numeric(4,2) not null check (note20 between 0 and 20),
  duration_s  int  not null default 0 check (duration_s >= 0),
  leaves      int  not null default 0 check (leaves >= 0),
  details     jsonb not null default '[]'::jsonb,       -- [{q: id question, c: points, r: réponse}]
  created_at  timestamptz not null default now()
);

create index if not exists exam_attempts_user_exam_idx
  on public.exam_attempts (user_id, exam_code, created_at desc);

alter table public.exam_attempts enable row level security;

-- Chaque membre voit ses examens ; l'administrateur voit tout. Aucune écriture directe.
drop policy if exists exam_attempts_select on public.exam_attempts;
create policy exam_attempts_select on public.exam_attempts
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin' and not a.is_blocked)
  );

revoke all on public.exam_attempts from anon;
grant select on public.exam_attempts to authenticated;

-- Enregistrement d'un examen (seul moyen d'écrire dans la table)
create or replace function public.complete_exam(
  p_exam        text,
  p_subject_id  bigint,
  p_total       int,
  p_score       numeric,
  p_note20      numeric,
  p_duration_s  int,
  p_leaves      int,
  p_details     jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then raise exception 'Non connecté'; end if;

  if exists (select 1 from public.profiles where id = v_uid and is_blocked) then
    raise exception 'Compte bloqué';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid and role = 'admin')
     and not exists (select 1 from public.enrollments
                      where user_id = v_uid and exam_code = p_exam and status = 'active') then
    raise exception 'Parcours non activé';
  end if;

  if p_total is null or p_total not between 1 and 30
     or p_score is null or p_score < 0 or p_score > p_total
     or p_note20 is null or p_note20 < 0 or p_note20 > 20 then
    raise exception 'Résultat invalide';
  end if;

  if p_details is not null and (jsonb_typeof(p_details) <> 'array' or length(p_details::text) > 60000) then
    raise exception 'Détails invalides';
  end if;

  -- garde-fou contre les envois en rafale
  if (select count(*) from public.exam_attempts
       where user_id = v_uid and created_at > now() - interval '1 day') >= 60 then
    raise exception 'Trop d''examens enregistrés aujourd''hui. Réessaie demain.';
  end if;

  insert into public.exam_attempts (user_id, exam_code, subject_id, total, score, note20, duration_s, leaves, details)
  values (v_uid, p_exam, p_subject_id, p_total, round(p_score, 2), round(p_note20, 2),
          greatest(0, least(coalesce(p_duration_s, 0), 36000)), greatest(0, coalesce(p_leaves, 0)),
          coalesce(p_details, '[]'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.complete_exam(text, bigint, int, numeric, numeric, int, int, jsonb) from public, anon;
grant execute on function public.complete_exam(text, bigint, int, numeric, numeric, int, int, jsonb) to authenticated;

-- Rafraîchit le cache de l'API pour que les nouvelles fonctions soient visibles tout de suite
notify pgrst, 'reload schema';
