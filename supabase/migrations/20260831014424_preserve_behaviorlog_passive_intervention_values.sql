begin;

-- These are passive imported observations. Operational reminder_deliveries
-- retain their existing browser/email channels and delivery-state contract.
alter table public.imported_interventions
  drop constraint imported_interventions_channel_check,
  add constraint imported_interventions_channel_check check (
    channel in (
      'browser_push', 'email', 'sms', 'mobile_push', 'in_app',
      'calendar_notification', 'voice_assistant', 'webhook', 'other', 'none'
    )
  ),
  drop constraint imported_interventions_delivery_status_check,
  add constraint imported_interventions_delivery_status_check check (
    delivery_status in (
      'pending', 'sent', 'delivered', 'failed', 'cancelled', 'suppressed', 'unknown'
    )
  );

-- BehaviorLog's planned value continues to use the existing pending storage
-- representation. No stored observation, policy, privilege, or provider changes.
commit;
