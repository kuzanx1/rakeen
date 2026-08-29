-- WhatsApp ordering channel — one conversation per (business, customer
-- phone), messages threaded underneath. Same tenant-isolation discipline as
-- every other table here: business_id explicit on both tables, RLS scoped
-- via current_business_id(), nothing implicitly shared across restaurants.
-- The webhook itself (app/api/webhooks/whatsapp) writes via the service-role
-- client — Meta calling us has no Supabase session to scope by auth.uid(),
-- same pattern already used for submit_online_order and the push-notify cron.

alter table businesses add column whatsapp_phone_number_id text;
alter table businesses add column whatsapp_business_account_id text;
alter table businesses add column whatsapp_enabled boolean not null default false;

create table whatsapp_conversations (
  id bigint generated always as identity primary key,
  business_id bigint not null references businesses(id) on delete cascade,
  branch_id bigint references branches(id) on delete set null,
  customer_phone text not null,
  customer_name text,
  -- 'ai' means the automated assistant is replying; a human staff member can
  -- take over ('human') and hand it back — this is the whole point of the
  -- admin dashboard's takeover button, not a status field nobody reads.
  mode text not null default 'ai' check (mode in ('ai','human')),
  taken_over_by uuid references profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, customer_phone)
);
create index whatsapp_conversations_business_idx on whatsapp_conversations(business_id, last_message_at desc);

create table whatsapp_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references whatsapp_conversations(id) on delete cascade,
  business_id bigint not null references businesses(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  sender text not null check (sender in ('customer','ai','staff')),
  message_type text not null default 'text' check (message_type in ('text','interactive_button','interactive_list','image','document','template','unknown')),
  body text,
  media_id text,
  wa_message_id text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index whatsapp_messages_conversation_idx on whatsapp_messages(conversation_id, created_at);

alter table whatsapp_conversations enable row level security;
alter table whatsapp_messages enable row level security;

create policy whatsapp_conversations_tenant_isolation on whatsapp_conversations
  for all using (business_id = current_business_id() and has_permission('screen:whatsapp'))
  with check (business_id = current_business_id() and has_permission('screen:whatsapp'));

create policy whatsapp_messages_tenant_isolation on whatsapp_messages
  for all using (business_id = current_business_id() and has_permission('screen:whatsapp'))
  with check (business_id = current_business_id() and has_permission('screen:whatsapp'));
