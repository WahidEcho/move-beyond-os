-- 0014_ledger_immutable_fix.sql
-- journal_lines has no reversed_by column; PL/pgSQL does not short-circuit
-- record field access, so the check must be nested per table.
create or replace function public.mb_ledger_immutable()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'journal_entries' and tg_op = 'UPDATE' then
    if old.reversed_by is null and new.reversed_by is not null
       and (to_jsonb(new) - 'reversed_by') = (to_jsonb(old) - 'reversed_by') then
      return new;
    end if;
  end if;
  raise exception 'Posted ledger records cannot be modified or deleted; post a reversal instead.';
end $$;
