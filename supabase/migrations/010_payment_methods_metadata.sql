-- Add metadata for payment method details (Klarna, Cash App, etc.)
alter table payment_methods add column if not exists pm_metadata jsonb default '{}';
comment on column payment_methods.pm_metadata is 'Extra PM details: Klarna, scheme, etc.';
