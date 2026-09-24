-- 0013_permission_bypass.sql
-- Tighten the trusted-caller bypass: a direct database session is trusted only
-- when it carries no API JWT claims. This keeps API callers (always through
-- 'authenticator') locked down and lets SQL tests impersonate real users by
-- setting request.jwt.claims.

create or replace function public.mb_require_permission(p_org uuid, p_permission text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.role() = 'service_role'
     or (session_user <> 'authenticator' and coalesce(current_setting('request.jwt.claims', true), '') = '') then
    return;
  end if;
  if not mb_has_permission(p_org, p_permission) then
    raise exception 'permission denied: % required', p_permission using errcode = '42501';
  end if;
end $$;
