-- Live sync between the POS and dashboard for table status specifically
-- needs the table added to Supabase's realtime publication — client-side
-- .channel().on('postgres_changes', ...) subscriptions get nothing without this.
alter publication supabase_realtime add table restaurant_tables;
