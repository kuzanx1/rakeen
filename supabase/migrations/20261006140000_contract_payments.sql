-- Contracts round 2: every contract is tied to the subscriber's account
-- (business_id), carries its own payment schedule, and every payment is
-- confirmed by the platform admin by hand (bank transfer to Rakeen's
-- account, receipt uploaded by the subscriber from their dashboard).
--
-- Same bar as subscription_contracts: RLS on, no policies, no grants. Every
-- read/write goes through Route Handlers with the service role:
--   app/api/admin/contracts/*        (platform admin)
--   app/api/billing                  (the subscriber's owner account)
--
-- Also: admin_business_order_counts() — the real order count per business
-- for /admin. online_order_free_count only counts cash online orders (the
-- free-trial meter), so it never showed a business's actual volume.

alter table public.subscription_contracts
  add column if not exists business_id bigint references public.businesses(id) on delete set null;

create index if not exists subscription_contracts_business_idx on public.subscription_contracts (business_id);

create table if not exists public.contract_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.subscription_contracts(id) on delete cascade,
  seq int not null check (seq >= 1),
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  -- due: waiting for the subscriber · submitted: receipt uploaded, waiting
  -- for the admin · paid: confirmed by the admin · rejected: receipt not
  -- accepted (the subscriber can upload again)
  status text not null default 'due' check (status in ('due', 'submitted', 'paid', 'rejected')),
  receipt_path text,
  submitted_at timestamptz,
  submitted_by uuid,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  created_at timestamptz not null default now(),
  unique (contract_id, seq)
);

create index if not exists contract_payments_contract_idx on public.contract_payments (contract_id, seq);
create index if not exists contract_payments_open_idx on public.contract_payments (due_date) where status <> 'paid';

alter table public.contract_payments enable row level security;
revoke all on public.contract_payments from anon, authenticated;

create or replace function public.admin_business_order_counts()
returns table (business_id bigint, total_orders bigint, online_orders bigint)
language sql
stable
security definer
set search_path = public
as $$
  select o.business_id,
         count(*) filter (where o.status <> 'cancelled'),
         count(*) filter (where o.status <> 'cancelled' and o.source = 'online')
    from orders o
   group by o.business_id;
$$;

revoke execute on function public.admin_business_order_counts() from public, anon, authenticated;
grant execute on function public.admin_business_order_counts() to service_role;

-- Platform-wide settings edited from /admin (service role only). First
-- key: "bank", Rakeen's account for subscription payments, shown in new
-- contracts and on the subscriber's pay screen (lib/platformBank.ts).
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;

insert into public.platform_settings (key, value, updated_by)
values ('bank', '{"bankName": "بنك D360", "iban": "SA3636036036049631065967", "accountHolder": "عمار وزير الثقفي"}', 'migration')
on conflict (key) do nothing;
