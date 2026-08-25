create index occurrence_sync_state_batch_order_idx
  on public.occurrence_sync_state (
    stale desc,
    synced_through_local_date asc nulls first,
    updated_at asc,
    user_id asc
  );
