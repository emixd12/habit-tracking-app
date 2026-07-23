begin;

lock table public.push_subscriptions in share row exclusive mode;

with ranked_active_endpoints as (
  select
    id,
    row_number() over (
      partition by endpoint
      order by updated_at desc, created_at desc, id desc
    ) as endpoint_rank
  from public.push_subscriptions
  where active
)
update public.push_subscriptions as subscription
set active = false
from ranked_active_endpoints as ranked
where subscription.id = ranked.id
  and ranked.endpoint_rank > 1;

create unique index push_subscriptions_active_endpoint_key
  on public.push_subscriptions (endpoint)
  where active;

commit;
