create table if not exists public.competition_state (
  id text primary key check (id = 'main'),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.competition_state enable row level security;
revoke all on table public.competition_state from anon, authenticated;
grant select, insert, update on table public.competition_state to service_role;

create or replace function public.save_competition_state(expected_version bigint, next_state jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed_rows integer;
begin
  update public.competition_state
  set state = next_state,
      version = version + 1,
      updated_at = now()
  where id = 'main'
    and version = expected_version;

  get diagnostics changed_rows = row_count;
  return changed_rows = 1;
end;
$$;

revoke all on function public.save_competition_state(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_competition_state(bigint, jsonb) to service_role;
