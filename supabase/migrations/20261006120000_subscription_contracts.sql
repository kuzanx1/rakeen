-- Subscription contracts between Rakeen and a subscribing business, signed
-- electronically through a one-off link (/contract/<token>) on the
-- subscriber's own phone.
--
-- The platform admin creates the offer (plan, price, term, enabled
-- features) from /admin; the subscriber fills in their own party details
-- and signs. Everything the subscriber agreed to is snapshotted into this
-- row at signing time — terms text, offer, party details, signature image,
-- IP, user agent and a SHA-256 of the whole document — so the signed
-- record stands on its own even if the contract template changes later.
--
-- No RLS policies on purpose: every read and write goes through Route
-- Handlers using the service role (app/api/admin/contracts/*,
-- app/api/contracts/[token]/*), the same service-role-only bar as
-- admin_audit_log. The anon key can never touch this table directly.

create sequence if not exists public.contract_number_seq start 1;

create table if not exists public.subscription_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null unique
    default ('RKN-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-' || lpad(nextval('public.contract_number_seq')::text, 4, '0')),
  token text not null unique,
  status text not null default 'sent' check (status in ('sent', 'signed', 'void')),

  -- Offer (set by the admin, read-only for the subscriber)
  plan_name text not null,
  billing_period text not null check (billing_period in ('monthly', 'annual')),
  price numeric(12,2) not null check (price >= 0),
  setup_fee numeric(12,2) not null default 0 check (setup_fee >= 0),
  vat_mode text not null default 'exclusive' check (vat_mode in ('exclusive', 'inclusive')),
  start_date date not null,
  branches_count int not null default 1 check (branches_count >= 1),
  features text[] not null default '{}',
  special_terms text,
  expires_at timestamptz not null default (now() + interval '14 days'),

  -- Optional prefill by the admin (the subscriber can correct them)
  prefill_business_name text,
  prefill_owner_name text,
  prefill_phone text,

  -- Subscriber party details (filled at signing)
  business_name text,
  business_activity text,
  city text,
  cr_number text,
  vat_number text,
  owner_name text,
  owner_id_number text,
  phone text,
  email text,

  -- Signing evidence
  signature_png text,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  terms_version text,
  terms_snapshot jsonb,
  document_hash text,

  -- Files (private storage bucket "contracts")
  pdf_path text,
  uploaded_file_path text,

  created_by text not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text
);

create index if not exists subscription_contracts_created_at_idx on public.subscription_contracts (created_at desc);

alter table public.subscription_contracts enable row level security;
revoke all on public.subscription_contracts from anon, authenticated;
revoke all on sequence public.contract_number_seq from anon, authenticated;

-- Private bucket for the generated signed PDF and any contract file the
-- admin uploads manually. Not public: files are only ever served through
-- short-lived signed URLs minted by /api/admin/contracts/[id].
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 15728640, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;
