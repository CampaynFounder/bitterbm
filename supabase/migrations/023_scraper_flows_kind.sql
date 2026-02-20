-- Add kind to scraper_flows so we can store scraper, superset_flow, superset_site_config, retrieval_flow, autoscrape_flow
alter table public.scraper_flows add column if not exists kind text not null default 'scraper';
create index if not exists scraper_flows_kind on public.scraper_flows(kind);
comment on column public.scraper_flows.kind is 'Flow type: scraper | superset_flow | superset_site_config | retrieval_flow | autoscrape_flow';
