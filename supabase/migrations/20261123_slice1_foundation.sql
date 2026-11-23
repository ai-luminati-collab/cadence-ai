-- ═══════════════════════════════════════════════════════════════════
-- Slice 1 — Foundation
--   1. Tenancy: workspaces, members (roles + permission switches), invites
--   2. Brands and their server-side state (replaces browser-only storage)
--   3. Change log: who changed what, when, with before/after for undo
--   4. Reasons Graph: beliefs with versions, evidence and dependencies
--
-- Run once in Supabase → SQL Editor. Safe to re-run: every object is
-- created with IF NOT EXISTS / OR REPLACE, and policies are dropped first.
-- ═══════════════════════════════════════════════════════════════════

-- gen_random_uuid() is built into Postgres 13+, so no extension is needed.

-- ─── 1. Tenancy ────────────────────────────────────────────────────

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  email           text,            -- shown in the team list and change log
  role            text not null check (role in ('admin', 'marketer', 'client', 'read_only')),
  -- Permission switches inside the marketer role (ignored for other roles)
  can_edit_brain  boolean not null default false,
  can_publish     boolean not null default false,
  invited_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.workspace_members add column if not exists email text;
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  email           text not null,
  role            text not null check (role in ('admin', 'marketer', 'client', 'read_only')),
  can_edit_brain  boolean not null default false,
  can_publish     boolean not null default false,
  invited_by      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  unique (workspace_id, email)
);

-- ─── 2. Brands and their state ─────────────────────────────────────

-- Brand ids stay text so existing ids ("brand_<timestamp>") and the
-- existing brand_os_* tables keep working unchanged.
create table if not exists public.brands (
  id            text primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null default 'Untitled brand',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create index if not exists brands_workspace_idx on public.brands (workspace_id);

-- The brand's working state (profile, strategy, calendar, drafts…) as one
-- versioned document. `version` gives optimistic concurrency: a save must
-- name the version it read, so two people can't silently overwrite each other.
create table if not exists public.brand_documents (
  brand_id    text primary key references public.brands(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  version     integer not null default 1,
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ─── 3. Change log ─────────────────────────────────────────────────

create table if not exists public.change_log (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  brand_id       text references public.brands(id) on delete cascade,
  actor_user_id  uuid references auth.users(id) on delete set null,
  actor_kind     text not null default 'user' check (actor_kind in ('user', 'ai', 'system')),
  entity_type    text not null,   -- 'brand_document' | 'belief' | 'brand' | 'member' | 'invite'
  entity_id      text not null,
  action         text not null check (action in ('create', 'update', 'delete', 'revert', 'import')),
  summary        text,
  changed_keys   text[],
  before         jsonb,
  after          jsonb,
  -- Internal changes (state, beliefs) can be undone. Anything that left the
  -- building (a published post, money spent, a reply sent) cannot.
  reversible     boolean not null default true,
  reverted_by    uuid references public.change_log(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists change_log_brand_idx on public.change_log (brand_id, created_at desc);
create index if not exists change_log_workspace_idx on public.change_log (workspace_id, created_at desc);

-- ─── 4. Reasons Graph ──────────────────────────────────────────────
-- Law 1: everything the brain thinks is a belief with reasons.

create table if not exists public.beliefs (
  id               uuid primary key default gen_random_uuid(),
  brand_id         text not null references public.brands(id) on delete cascade,
  kind             text not null check (kind in (
                     'fact', 'lesson', 'audience_trait', 'user_preference',
                     'plan_rationale', 'rule', 'constitution')),
  polarity         text not null default 'neutral' check (polarity in ('do', 'avoid', 'neutral')),
  statement        text not null,
  scope            jsonb not null default '{}'::jsonb,   -- market, platform, segment, format…
  confidence       real not null default 0.5 check (confidence >= 0 and confidence <= 1),
  status           text not null default 'active' check (status in ('proposed', 'active', 'retired')),
  needs_review     boolean not null default false,       -- set when something it rests on changed
  review_reason    text,
  subject_user_id  uuid references auth.users(id) on delete cascade,  -- for user_preference
  origin           text not null default 'user' check (origin in (
                     'user', 'ai', 'blanc', 'edit_pattern', 'research', 'migration', 'results')),
  origin_key       text,                                 -- de-duplication key for imports
  current_version  integer not null default 1,
  valid_from       timestamptz not null default now(),   -- when it became true
  valid_to         timestamptz,                          -- when it stopped being true
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),   -- when the brain learned it
  updated_at       timestamptz not null default now(),
  unique (brand_id, origin_key)
);
create index if not exists beliefs_brand_idx on public.beliefs (brand_id, status);
create index if not exists beliefs_review_idx on public.beliefs (brand_id) where needs_review;

create table if not exists public.belief_versions (
  belief_id      uuid not null references public.beliefs(id) on delete cascade,
  version        integer not null,
  statement      text not null,
  polarity       text not null,
  scope          jsonb not null,
  confidence     real not null,
  status         text not null,
  valid_from     timestamptz not null,
  valid_to       timestamptz,
  changed_by     uuid references auth.users(id) on delete set null,
  change_reason  text,
  created_at     timestamptz not null default now(),
  primary key (belief_id, version)
);

create table if not exists public.belief_evidence (
  id           uuid primary key default gen_random_uuid(),
  belief_id    uuid not null references public.beliefs(id) on delete cascade,
  source_type  text not null check (source_type in (
                 'episode', 'post', 'reaction', 'conversation', 'upload',
                 'research', 'edit', 'result', 'user')),
  source_ref   text,
  note         text,
  weight       real not null default 1,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists belief_evidence_belief_idx on public.belief_evidence (belief_id);

-- "belief_id rests on depends_on"
create table if not exists public.belief_dependencies (
  belief_id   uuid not null references public.beliefs(id) on delete cascade,
  depends_on  uuid not null references public.beliefs(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (belief_id, depends_on),
  check (belief_id <> depends_on)
);
create index if not exists belief_dependencies_on_idx on public.belief_dependencies (depends_on);

-- Things outside the graph (a post, a plan, the strategy) that rest on a belief.
create table if not exists public.belief_links (
  brand_id      text not null references public.brands(id) on delete cascade,
  entity_type   text not null check (entity_type in ('post', 'plan', 'calendar', 'campaign', 'strategy')),
  entity_id     text not null,
  belief_id     uuid not null references public.beliefs(id) on delete cascade,
  needs_review  boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (entity_type, entity_id, belief_id)
);
create index if not exists belief_links_belief_idx on public.belief_links (belief_id);

-- ─── Permission helpers ────────────────────────────────────────────
-- SECURITY DEFINER so policies can read membership without recursing
-- through workspace_members' own policies. They only ever answer about
-- the calling user (auth.uid()).

create or replace function public.ws_can(ws uuid, need text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case need
      when 'read'    then true
      when 'edit'    then m.role in ('admin', 'marketer')
      when 'brain'   then m.role = 'admin' or (m.role = 'marketer' and m.can_edit_brain)
      when 'publish' then m.role = 'admin' or (m.role = 'marketer' and m.can_publish)
      when 'admin'   then m.role = 'admin'
      else false
    end
    from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  ), false)
$$;

create or replace function public.brand_ws(b text)
returns uuid
language sql stable security definer set search_path = public
as $$ select workspace_id from public.brands where id = b $$;

create or replace function public.belief_ws(bid uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select br.workspace_id from public.beliefs be
  join public.brands br on br.id = be.brand_id
  where be.id = bid
$$;

-- Create a workspace and make the caller its admin, atomically.
create or replace function public.create_workspace(ws_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.workspaces (name, created_by) values (ws_name, auth.uid()) returning id into new_id;
  insert into public.workspace_members (workspace_id, user_id, email, role, can_edit_brain, can_publish)
    values (new_id, auth.uid(), lower(auth.jwt() ->> 'email'), 'admin', true, true);
  return new_id;
end $$;

-- Turn any pending invites for the caller's email into memberships.
create or replace function public.accept_my_invites()
returns integer
language plpgsql security definer set search_path = public
as $$
declare my_email text := lower(coalesce(auth.jwt() ->> 'email', '')); n integer;
begin
  if auth.uid() is null or my_email = '' then return 0; end if;
  insert into public.workspace_members (workspace_id, user_id, email, role, can_edit_brain, can_publish, invited_by)
    select i.workspace_id, auth.uid(), my_email, i.role, i.can_edit_brain, i.can_publish, i.invited_by
    from public.workspace_invites i
    where lower(i.email) = my_email and i.accepted_at is null
  on conflict (workspace_id, user_id) do nothing;
  get diagnostics n = row_count;
  update public.workspace_invites set accepted_at = now()
    where lower(email) = my_email and accepted_at is null;
  return n;
end $$;

-- Forward half of Law 3: when a belief changes, flag everything that
-- rests on it (directly or through a chain) for re-checking.
-- SECURITY INVOKER: it only touches rows the caller may already update.
create or replace function public.mark_belief_dependents(root uuid, reason text)
returns integer
language plpgsql security invoker set search_path = public
as $$
declare n integer;
begin
  with recursive chain(id) as (
      select d.belief_id from public.belief_dependencies d where d.depends_on = root
    union
      select d.belief_id from public.belief_dependencies d join chain c on d.depends_on = c.id
  )
  update public.beliefs b
     set needs_review = true, review_reason = reason, updated_at = now()
   where b.id in (select id from chain) and b.status <> 'retired';
  get diagnostics n = row_count;

  with recursive chain(id) as (
      select root
    union
      select d.belief_id from public.belief_dependencies d join chain c on d.depends_on = c.id
  )
  update public.belief_links l set needs_review = true
   where l.belief_id in (select id from chain);

  return n;
end $$;

revoke all on function public.ws_can(uuid, text) from public, anon;
revoke all on function public.brand_ws(text) from public, anon;
revoke all on function public.belief_ws(uuid) from public, anon;
revoke all on function public.create_workspace(text) from public, anon;
revoke all on function public.accept_my_invites() from public, anon;
revoke all on function public.mark_belief_dependents(uuid, text) from public, anon;
grant execute on function public.ws_can(uuid, text) to authenticated;
grant execute on function public.brand_ws(text) to authenticated;
grant execute on function public.belief_ws(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.accept_my_invites() to authenticated;
grant execute on function public.mark_belief_dependents(uuid, text) to authenticated;

-- ─── Row-level security ────────────────────────────────────────────

alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.workspace_invites   enable row level security;
alter table public.brands              enable row level security;
alter table public.brand_documents     enable row level security;
alter table public.change_log          enable row level security;
alter table public.beliefs             enable row level security;
alter table public.belief_versions     enable row level security;
alter table public.belief_evidence     enable row level security;
alter table public.belief_dependencies enable row level security;
alter table public.belief_links        enable row level security;

-- workspaces: members read; admins rename. Creation goes through create_workspace().
drop policy if exists ws_select on public.workspaces;
create policy ws_select on public.workspaces for select to authenticated using (public.ws_can(id, 'read'));
drop policy if exists ws_update on public.workspaces;
create policy ws_update on public.workspaces for update to authenticated
  using (public.ws_can(id, 'admin')) with check (public.ws_can(id, 'admin'));

-- members: everyone in the workspace sees the team; only admins change it.
drop policy if exists wm_select on public.workspace_members;
create policy wm_select on public.workspace_members for select to authenticated using (public.ws_can(workspace_id, 'read'));
drop policy if exists wm_admin on public.workspace_members;
create policy wm_admin on public.workspace_members for all to authenticated
  using (public.ws_can(workspace_id, 'admin')) with check (public.ws_can(workspace_id, 'admin'));

-- invites: admins only.
drop policy if exists wi_admin on public.workspace_invites;
create policy wi_admin on public.workspace_invites for all to authenticated
  using (public.ws_can(workspace_id, 'admin')) with check (public.ws_can(workspace_id, 'admin'));

-- brands: members read; admins and marketers create and edit; admins delete.
drop policy if exists br_select on public.brands;
create policy br_select on public.brands for select to authenticated using (public.ws_can(workspace_id, 'read'));
drop policy if exists br_insert on public.brands;
create policy br_insert on public.brands for insert to authenticated with check (public.ws_can(workspace_id, 'edit'));
drop policy if exists br_update on public.brands;
create policy br_update on public.brands for update to authenticated
  using (public.ws_can(workspace_id, 'edit')) with check (public.ws_can(workspace_id, 'edit'));
drop policy if exists br_delete on public.brands;
create policy br_delete on public.brands for delete to authenticated using (public.ws_can(workspace_id, 'admin'));

-- brand state: members read; admins and marketers write.
drop policy if exists bd_select on public.brand_documents;
create policy bd_select on public.brand_documents for select to authenticated using (public.ws_can(public.brand_ws(brand_id), 'read'));
drop policy if exists bd_write on public.brand_documents;
create policy bd_write on public.brand_documents for all to authenticated
  using (public.ws_can(public.brand_ws(brand_id), 'edit')) with check (public.ws_can(public.brand_ws(brand_id), 'edit'));

-- change log: members read; entries are written as yourself by editors;
-- the only update allowed is marking an entry as reverted.
drop policy if exists cl_select on public.change_log;
create policy cl_select on public.change_log for select to authenticated using (public.ws_can(workspace_id, 'read'));
drop policy if exists cl_insert on public.change_log;
create policy cl_insert on public.change_log for insert to authenticated
  with check (actor_user_id = auth.uid() and (public.ws_can(workspace_id, 'edit') or public.ws_can(workspace_id, 'brain')));
drop policy if exists cl_update on public.change_log;
create policy cl_update on public.change_log for update to authenticated
  using (public.ws_can(workspace_id, 'edit')) with check (public.ws_can(workspace_id, 'edit'));

-- beliefs: members read. Writing the brain needs the brain switch, except
-- that anyone may hold preferences about themselves.
drop policy if exists be_select on public.beliefs;
create policy be_select on public.beliefs for select to authenticated using (public.ws_can(public.brand_ws(brand_id), 'read'));
drop policy if exists be_write on public.beliefs;
create policy be_write on public.beliefs for all to authenticated
  using (public.ws_can(public.brand_ws(brand_id), 'brain')
         or (kind = 'user_preference' and subject_user_id = auth.uid() and public.ws_can(public.brand_ws(brand_id), 'read')))
  with check (public.ws_can(public.brand_ws(brand_id), 'brain')
         or (kind = 'user_preference' and subject_user_id = auth.uid() and public.ws_can(public.brand_ws(brand_id), 'read')));

drop policy if exists bv_select on public.belief_versions;
create policy bv_select on public.belief_versions for select to authenticated using (public.ws_can(public.belief_ws(belief_id), 'read'));
drop policy if exists bv_insert on public.belief_versions;
create policy bv_insert on public.belief_versions for insert to authenticated
  with check (public.ws_can(public.belief_ws(belief_id), 'brain')
              or exists (select 1 from public.beliefs b where b.id = belief_id
                         and b.kind = 'user_preference' and b.subject_user_id = auth.uid()));

-- evidence and links can be added by editors (their work is evidence);
-- dependencies are brain structure and need the brain switch.
drop policy if exists bev_select on public.belief_evidence;
create policy bev_select on public.belief_evidence for select to authenticated using (public.ws_can(public.belief_ws(belief_id), 'read'));
drop policy if exists bev_write on public.belief_evidence;
create policy bev_write on public.belief_evidence for all to authenticated
  using (public.ws_can(public.belief_ws(belief_id), 'edit') or public.ws_can(public.belief_ws(belief_id), 'brain'))
  with check (public.ws_can(public.belief_ws(belief_id), 'edit') or public.ws_can(public.belief_ws(belief_id), 'brain'));

drop policy if exists bdep_select on public.belief_dependencies;
create policy bdep_select on public.belief_dependencies for select to authenticated using (public.ws_can(public.belief_ws(belief_id), 'read'));
drop policy if exists bdep_write on public.belief_dependencies;
create policy bdep_write on public.belief_dependencies for all to authenticated
  using (public.ws_can(public.belief_ws(belief_id), 'brain'))
  with check (public.ws_can(public.belief_ws(belief_id), 'brain')
              and public.belief_ws(belief_id) = public.belief_ws(depends_on));

drop policy if exists bl_select on public.belief_links;
create policy bl_select on public.belief_links for select to authenticated using (public.ws_can(public.brand_ws(brand_id), 'read'));
drop policy if exists bl_write on public.belief_links;
create policy bl_write on public.belief_links for all to authenticated
  using (public.ws_can(public.brand_ws(brand_id), 'edit') or public.ws_can(public.brand_ws(brand_id), 'brain'))
  with check (public.ws_can(public.brand_ws(brand_id), 'edit') or public.ws_can(public.brand_ws(brand_id), 'brain'));

-- Supabase grants table privileges to `authenticated` by default; make it
-- explicit and keep logged-out visitors out entirely.
grant select, insert, update, delete on
  public.workspaces, public.workspace_members, public.workspace_invites,
  public.brands, public.brand_documents, public.change_log,
  public.beliefs, public.belief_versions, public.belief_evidence,
  public.belief_dependencies, public.belief_links
to authenticated;
revoke all on
  public.workspaces, public.workspace_members, public.workspace_invites,
  public.brands, public.brand_documents, public.change_log,
  public.beliefs, public.belief_versions, public.belief_evidence,
  public.belief_dependencies, public.belief_links
from anon;
