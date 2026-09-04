-- The customer-facing "edit your note after submitting" feature on the
-- order-tracking page was removed per merchant feedback — the note should
-- only ever be entered once, at checkout, never revisited. Revoking anon
-- execute here (not just removing the UI button) means a customer can't
-- call the RPC directly either.
revoke execute on function update_order_note(uuid, text) from anon;
