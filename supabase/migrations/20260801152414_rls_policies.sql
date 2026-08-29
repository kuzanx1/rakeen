-- Row-Level Security: tenant isolation on every table, plus screen-permission
-- gating via has_permission(). Child tables with no business_id of their own
-- (recipe lines, box slots, modifier options, the menu<->modifier join) check
-- through their parent row's business_id instead.

alter table businesses enable row level security;
create policy businesses_select on businesses for select
  using (id = current_business_id());
create policy businesses_update on businesses for update
  using (id = current_business_id() and exists (
    select 1 from profiles where id = auth.uid() and user_type = 'owner'
  ))
  with check (id = current_business_id());

alter table profiles enable row level security;
create policy profiles_select on profiles for select
  using (business_id = current_business_id());
create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_update_by_manager on profiles for update
  using (
    business_id = current_business_id()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.user_type in ('owner','manager'))
  )
  with check (business_id = current_business_id());

alter table user_permissions enable row level security;
create policy user_permissions_select on user_permissions for select
  using (exists (
    select 1 from profiles p where p.id = user_permissions.user_id and p.business_id = current_business_id()
  ));
create policy user_permissions_manage on user_permissions for all
  using (
    exists (select 1 from profiles me where me.id = auth.uid() and me.user_type in ('owner','manager'))
    and exists (select 1 from profiles target where target.id = user_permissions.user_id and target.business_id = current_business_id())
  )
  with check (
    exists (select 1 from profiles me where me.id = auth.uid() and me.user_type in ('owner','manager'))
    and exists (select 1 from profiles target where target.id = user_permissions.user_id and target.business_id = current_business_id())
  );

-- Reused per business-scoped table: select/insert/update/delete all gated on
-- (right tenant) and (this employee was granted the relevant screen).
alter table stock_items enable row level security;
create policy stock_items_select on stock_items for select
  using (business_id = current_business_id() and has_permission('screen:inventory'));
create policy stock_items_insert on stock_items for insert
  with check (business_id = current_business_id() and has_permission('screen:inventory'));
create policy stock_items_update on stock_items for update
  using (business_id = current_business_id() and has_permission('screen:inventory'))
  with check (business_id = current_business_id() and has_permission('screen:inventory'));
create policy stock_items_delete on stock_items for delete
  using (business_id = current_business_id() and has_permission('screen:inventory'));

alter table menu_categories enable row level security;
create policy menu_categories_all on menu_categories for all
  using (business_id = current_business_id() and has_permission('screen:menu'))
  with check (business_id = current_business_id() and has_permission('screen:menu'));

alter table menu_items enable row level security;
create policy menu_items_all on menu_items for all
  using (business_id = current_business_id() and has_permission('screen:menu'))
  with check (business_id = current_business_id() and has_permission('screen:menu'));

alter table menu_item_recipe_lines enable row level security;
create policy menu_item_recipe_lines_all on menu_item_recipe_lines for all
  using (exists (
    select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ))
  with check (exists (
    select 1 from menu_items m where m.id = menu_item_recipe_lines.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ));

alter table menu_item_box_eligible_items enable row level security;
create policy menu_item_box_eligible_items_all on menu_item_box_eligible_items for all
  using (exists (
    select 1 from menu_items m where m.id = menu_item_box_eligible_items.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ))
  with check (exists (
    select 1 from menu_items m where m.id = menu_item_box_eligible_items.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ));

alter table menu_item_box_default_mix enable row level security;
create policy menu_item_box_default_mix_all on menu_item_box_default_mix for all
  using (exists (
    select 1 from menu_items m where m.id = menu_item_box_default_mix.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ))
  with check (exists (
    select 1 from menu_items m where m.id = menu_item_box_default_mix.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ));

alter table modifier_groups enable row level security;
create policy modifier_groups_all on modifier_groups for all
  using (business_id = current_business_id() and has_permission('screen:menu'))
  with check (business_id = current_business_id() and has_permission('screen:menu'));

alter table modifier_options enable row level security;
create policy modifier_options_all on modifier_options for all
  using (exists (
    select 1 from modifier_groups g where g.id = modifier_options.group_id
    and g.business_id = current_business_id() and has_permission('screen:menu')
  ))
  with check (exists (
    select 1 from modifier_groups g where g.id = modifier_options.group_id
    and g.business_id = current_business_id() and has_permission('screen:menu')
  ));

alter table menu_item_modifier_groups enable row level security;
create policy menu_item_modifier_groups_all on menu_item_modifier_groups for all
  using (exists (
    select 1 from menu_items m where m.id = menu_item_modifier_groups.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ))
  with check (exists (
    select 1 from menu_items m where m.id = menu_item_modifier_groups.menu_item_id
    and m.business_id = current_business_id() and has_permission('screen:menu')
  ));

alter table fixed_costs enable row level security;
create policy fixed_costs_all on fixed_costs for all
  using (business_id = current_business_id() and has_permission('screen:accounting'))
  with check (business_id = current_business_id() and has_permission('screen:accounting'));

alter table suppliers enable row level security;
create policy suppliers_all on suppliers for all
  using (business_id = current_business_id() and has_permission('screen:accounting'))
  with check (business_id = current_business_id() and has_permission('screen:accounting'));

alter table purchase_invoices enable row level security;
create policy purchase_invoices_all on purchase_invoices for all
  using (business_id = current_business_id() and has_permission('screen:accounting'))
  with check (business_id = current_business_id() and has_permission('screen:accounting'));

alter table expense_categories enable row level security;
create policy expense_categories_all on expense_categories for all
  using (business_id = current_business_id() and has_permission('screen:accounting'))
  with check (business_id = current_business_id() and has_permission('screen:accounting'));

alter table general_expenses enable row level security;
create policy general_expenses_all on general_expenses for all
  using (business_id = current_business_id() and has_permission('screen:accounting'))
  with check (business_id = current_business_id() and has_permission('screen:accounting'));
