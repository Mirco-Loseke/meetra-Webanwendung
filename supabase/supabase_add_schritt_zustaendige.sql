-- Schritt-Zuständige werden automatisch Zuständige des ganzen Vorgangs (2026-10-07)
-- Wer in einem Schritt (internal_processes.steps[].assigned_id) eingetragen ist,
-- landet per Trigger auch in internal_processes.assigned_users — egal von welcher
-- Stelle der App gespeichert wird. Dadurch steht er unter „Zuständig", in
-- „Meine Vorgänge", im Briefing und in der To-do-Liste.
-- Es wird nur ERGÄNZT, nie entfernt: wer von Hand aus „Zuständig" genommen wird,
-- kommt nur wieder, solange er noch in einem Schritt steht.

create or replace function public.app_schritt_zustaendige()
returns trigger
language plpgsql
as $$
declare
    s   jsonb;
    ids jsonb := coalesce(new.assigned_users, '[]'::jsonb);
begin
    if jsonb_typeof(ids) <> 'array' then ids := '[]'::jsonb; end if;
    if new.steps is null or jsonb_typeof(new.steps) <> 'array' then return new; end if;
    for s in select * from jsonb_array_elements(new.steps) loop
        if jsonb_typeof(s) = 'object'
           and coalesce(s ->> 'assigned_id', '') <> ''
           and not exists (select 1 from jsonb_array_elements(ids) e where e #>> '{}' = s ->> 'assigned_id') then
            ids := ids || jsonb_build_array(s -> 'assigned_id');
        end if;
    end loop;
    new.assigned_users := ids;
    return new;
end
$$;

drop trigger if exists trg_schritt_zustaendige on public.internal_processes;
create trigger trg_schritt_zustaendige
    before insert or update of steps, assigned_users on public.internal_processes
    for each row execute function public.app_schritt_zustaendige();

-- Bestand nachziehen: nur Vorgänge, bei denen ein Schritt-Zuständiger noch fehlt.
update public.internal_processes p
   set steps = p.steps
 where jsonb_typeof(p.steps) = 'array'
   and exists (
        select 1 from jsonb_array_elements(p.steps) s
         where jsonb_typeof(s) = 'object'
           and coalesce(s ->> 'assigned_id', '') <> ''
           and not exists (select 1 from jsonb_array_elements(coalesce(p.assigned_users, '[]'::jsonb)) e
                            where e #>> '{}' = s ->> 'assigned_id'));
