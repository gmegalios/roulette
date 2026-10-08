begin;

create table if not exists public.roulette_entries (
    id bigint generated always as identity primary key,
    entry_date date not null,
    amount numeric(18, 2) not null,
    note varchar(140) not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by_object_id uuid,
    created_by_tenant_id uuid,
    creator_name varchar(200) not null default 'Creator unavailable',
    creator_email varchar(320) not null default ''
);

create index if not exists roulette_entries_date_created_index
    on public.roulette_entries (entry_date desc, created_at desc);

create index if not exists roulette_entries_creator_index
    on public.roulette_entries (created_by_object_id);

create or replace function public.preserve_roulette_entry_creator()
returns trigger
language plpgsql
as $function$
begin
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by_object_id := old.created_by_object_id;
    new.created_by_tenant_id := old.created_by_tenant_id;
    new.creator_name := old.creator_name;
    new.creator_email := old.creator_email;
    new.updated_at := now();
    return new;
end;
$function$;

drop trigger if exists preserve_roulette_entry_creator on public.roulette_entries;
create trigger preserve_roulette_entry_creator
before update on public.roulette_entries
for each row execute function public.preserve_roulette_entry_creator();

commit;
