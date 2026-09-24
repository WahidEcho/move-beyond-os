-- 0011_alerts.sql
-- Financial Alert Center (spec §80, §35, §101). mb_refresh_alerts() computes
-- every rule, upserts one open notification per condition (dedupe_key), and
-- resolves notifications whose condition no longer holds.

create or replace function public.mb_refresh_alerts(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_settings organization_settings;
  v_pos record;
  v_count int := 0;
  v_reserve numeric;
  v_next30 numeric;
begin
  perform mb_require_permission(p_org, 'finance.view');
  select * into v_settings from organization_settings where organization_id = p_org;

  create temp table if not exists _alerts (
    type text, priority text, title text, body text, link text, entity_type text, entity_id uuid,
    dedupe_key text, due_date date, audience text default 'finance.view'
  ) on commit drop;
  truncate _alerts;

  -- 1. Reserve below target (D4)
  select * into v_pos from v_company_position where organization_id = p_org;
  v_reserve := v_pos.available_reserve;
  if v_reserve < v_pos.reserve_target then
    insert into _alerts values ('reserve_below_target', 'critical',
      'Move Beyond reserve below ' || mb_fmt(v_pos.reserve_target) || ' EGP',
      'Available reserve is ' || mb_fmt(v_reserve) || ' EGP — shortfall ' || mb_fmt(v_pos.reserve_target - v_reserve) || ' EGP.',
      '/finance/reserve', 'organization', p_org, 'reserve_below_target', null);
  end if;

  -- 2. Collection reminders (14/7/3/0 days before, overdue)
  insert into _alerts
  select
    case when r.days_overdue > 0 then 'collection_overdue' when r.due_date = current_date then 'collection_due_today' else 'collection_due_soon' end,
    case when r.days_overdue > 30 then 'critical' when r.days_overdue > 0 then 'high' when r.due_date - current_date <= 3 then 'high' else 'normal' end,
    case when r.days_overdue > 0 then r.project_name || ' payment overdue by ' || r.days_overdue || ' days'
         when r.due_date = current_date then r.project_name || ' payment due today'
         else r.project_name || ' payment due in ' || (r.due_date - current_date) || ' days' end,
    coalesce(r.client_name || ' · ', '') || r.label || ' · ' || mb_fmt(r.outstanding * r.fx_rate) || ' EGP outstanding',
    '/finance/projects/' || r.project_id || '?tab=revenue', 'billing_milestone', r.milestone_id,
    'collection:' || r.milestone_id || ':' ||
      case when r.days_overdue > 0 then 'overdue' when r.due_date = current_date then 'today' else 'soon' end,
    r.due_date
  from v_receivables r
  where r.organization_id = p_org and r.outstanding > 0 and r.due_date is not null
    and (r.days_overdue > 0
         or (r.due_date - current_date) between 0 and coalesce((select max(d) from unnest(coalesce(r.reminder_days, v_settings.collection_reminder_days)) d), 14));

  -- 3. Subscription renewals and trials
  insert into _alerts
  select 'subscription_renewal', 'normal',
    m.client_name || ' ' || coalesce(m.service_name, m.plan_name) || ' ' || m.billing_cycle || ' subscription due',
    'Next billing ' || to_char(m.next_billing_date, 'DD Mon YYYY') || ' · ' || mb_fmt(m.cycle_total * m.fx_rate) || ' EGP',
    '/finance/subscriptions', 'subscription', m.subscription_id, 'sub_renewal:' || m.subscription_id || ':' || m.next_billing_date, m.next_billing_date
  from v_subscription_metrics m
  where m.organization_id = p_org and m.status = 'active' and m.next_billing_date <= current_date + 14;

  insert into _alerts
  select 'trial_ending', 'normal', m.client_name || ' trial ends ' || to_char(m.trial_end_date, 'DD Mon'),
    'Convert to paid or extend the trial.', '/finance/subscriptions', 'subscription', m.subscription_id,
    'trial:' || m.subscription_id, m.trial_end_date
  from v_subscription_metrics m
  where m.organization_id = p_org and m.status = 'trial' and m.trial_end_date <= current_date + 7;

  -- 4. Completed but not financially closed
  insert into _alerts
  select 'project_unsettled', 'high', p.code || ' ' || p.name || ' completed but financially unsettled',
    'Financial status: ' || replace(p.financial_status, '_', ' '), '/finance/projects/' || p.id || '?tab=settlement',
    'project', p.id, 'unsettled:' || p.id, null
  from projects p
  where p.organization_id = p_org and p.deleted_at is null and p.operational_status = 'completed'
    and p.financial_status <> 'financially_closed';

  -- 5. Amounts due to partners (one per partner)
  insert into _alerts
  select 'partner_due', 'normal', b.full_name || ' reimbursement outstanding',
    mb_fmt(b.funding_due + b.fee_due + b.cto_due + b.profit_due + b.carry_due) || ' EGP currently due',
    '/finance/partners/' || b.person_id, 'person', b.person_id, 'partner_due:' || b.person_id, null, 'partners.view'
  from v_person_balances b
  where b.organization_id = p_org and b.is_partner
    and (b.funding_due + b.fee_due + b.cto_due + b.profit_due + b.carry_due) > 0;

  -- 6. Unrecovered technology + 7. project using it ready for settlement
  insert into _alerts
  select 'technology_unrecovered', 'low', t.name || ' has ' || mb_fmt(t.outstanding) || ' EGP unrecovered CTO development value',
    'Developer: ' || t.developer_name, '/finance/cto/' || t.technology_id, 'technology_development', t.technology_id,
    'tech_unrecovered:' || t.technology_id || ':' || t.outstanding, null, 'technology.view'
  from v_technology_recovery t
  where t.organization_id = p_org and t.outstanding > 0 and t.recovery_status not in ('cancelled','archived');

  insert into _alerts
  select 'technology_settlement_ready', 'high',
    'Project using ' || t.name || ' is ready for settlement',
    p.code || ' ' || p.name || ' · ' || mb_fmt(t.outstanding) || ' EGP CTO recovery available',
    '/finance/projects/' || p.id || '?tab=settlement', 'project', p.id, 'tech_ready:' || p.id || ':' || t.technology_id, null, 'technology.view'
  from project_technology_usage u
  join projects p on p.id = u.project_id and p.deleted_at is null
  join v_technology_recovery t on t.technology_id = u.technology_id
  where p.organization_id = p_org and t.outstanding > 0 and u.recovery_decision in ('pending','decide_at_settlement','add_recovery')
    and p.financial_status in ('settlement_required','awaiting_collection','partially_settled');

  -- 8. Supplier payments overdue
  insert into _alerts
  select 'supplier_overdue', 'high', coalesce(s.name, 'Supplier') || ' payment overdue',
    e.description || ' · ' || mb_fmt(e.outstanding_egp) || ' EGP · due ' || to_char(e.due_date, 'DD Mon'),
    case when e.project_id is not null then '/finance/projects/' || e.project_id || '?tab=expenses' else '/finance/expenses' end,
    'expense', e.expense_id, 'supplier_overdue:' || e.expense_id, e.due_date
  from v_expense_balances e left join suppliers s on s.id = e.supplier_id
  where e.organization_id = p_org and e.outstanding_egp > 0 and e.due_date < current_date;

  -- 9. Forecast cost exceeds budget
  insert into _alerts
  select 'budget_exceeded', 'high', f.code || ' forecast cost exceeds budget',
    'Forecast ' || mb_fmt(f.committed_cost + f.uncommitted_estimates) || ' EGP vs budget ' || mb_fmt(f.budget_amount) || ' EGP',
    '/finance/projects/' || f.project_id, 'project', f.project_id, 'budget:' || f.project_id, null
  from v_project_financials f
  where f.organization_id = p_org and f.budget_amount is not null and f.budget_amount > 0
    and f.committed_cost + f.uncommitted_estimates > f.budget_amount and f.financial_status <> 'financially_closed';

  -- 10. Cash required in the next 30 days
  select coalesce(sum(outstanding_egp), 0) into v_next30 from v_expense_balances
  where organization_id = p_org and outstanding_egp > 0 and (due_date is null or due_date <= current_date + 30);
  if v_next30 > 0 and v_next30 > v_pos.company_cash then
    insert into _alerts values ('cash_required', 'critical', mb_fmt(v_next30) || ' EGP required in next 30 days',
      'Company cash is ' || mb_fmt(v_pos.company_cash) || ' EGP. Expected collections: ' || mb_fmt(v_pos.receivables) || ' EGP.',
      '/finance/forecast', 'organization', p_org, 'cash_required', current_date + 30);
  end if;

  -- Upsert open alerts
  insert into notifications (organization_id, audience_permission, module, type, priority, title, body, link, entity_type, entity_id, dedupe_key, due_date)
  select p_org, a.audience, 'finance', a.type, a.priority, a.title, a.body, a.link, a.entity_type, a.entity_id, a.dedupe_key, a.due_date
  from _alerts a
  on conflict (organization_id, dedupe_key) where dedupe_key is not null and resolved_at is null
  do update set title = excluded.title, body = excluded.body, priority = excluded.priority, link = excluded.link, due_date = excluded.due_date;
  get diagnostics v_count = row_count;

  -- Resolve alerts whose condition cleared
  update notifications n set resolved_at = now()
  where n.organization_id = p_org and n.module = 'finance' and n.resolved_at is null and n.dedupe_key is not null
    and not exists (select 1 from _alerts a where a.dedupe_key = n.dedupe_key);

  return v_count;
end $$;

-- Alerts for the current user (open, not dismissed), newest & most urgent first
create or replace view public.v_my_alerts with (security_invoker = true) as
select n.*, r.read_at, r.dismissed_at,
  case n.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end as priority_rank
from public.notifications n
left join public.notification_reads r on r.notification_id = n.id and r.user_id = auth.uid()
where n.resolved_at is null and r.dismissed_at is null;

create or replace function public.mb_dismiss_alert(p_notification uuid, p_read_only boolean default false)
returns void language sql security invoker set search_path = public as $$
  insert into notification_reads (notification_id, user_id, read_at, dismissed_at)
  values (p_notification, auth.uid(), now(), case when p_read_only then null else now() end)
  on conflict (notification_id, user_id) do update
    set read_at = coalesce(notification_reads.read_at, now()),
        dismissed_at = case when p_read_only then notification_reads.dismissed_at else now() end;
$$;

-- Try to schedule a daily refresh (pg_cron is optional; the app also refreshes on load and via /api/cron/alerts).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('mb-refresh-alerts', '15 5 * * *',
      $cron$select public.mb_refresh_alerts(id) from public.organizations$cron$);
  end if;
exception when others then
  raise notice 'pg_cron not available: %', sqlerrm;
end $$;
