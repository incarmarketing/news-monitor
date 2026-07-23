alter table public.news_articles
  add column if not exists classification_ruleset_version text,
  add column if not exists document_type text not null default 'other',
  add column if not exists own_role text not null default 'absent',
  add column if not exists risk_event_type text not null default 'none',
  add column if not exists alert_eligible boolean not null default false,
  add column if not exists classification_decision_path jsonb not null default '{}'::jsonb;

alter table public.monitor_context_rules
  add column if not exists trigger_mode text not null default 'any',
  add column if not exists required_mode text not null default 'any';

create index if not exists idx_news_articles_alert_eligible_observed
  on public.news_articles (coalesce(pub_date, created_at) desc)
  where alert_eligible is true;

create index if not exists idx_news_articles_ruleset_version
  on public.news_articles (classification_ruleset_version);

comment on column public.news_articles.document_type is
  'Classification contract: risk_event, routine_statistics, brand_reputation, certified_agent, sponsorship, regulatory, industry_news, company_profile, other';
comment on column public.news_articles.own_role is
  'Classification contract: primary, secondary, incidental, absent';
comment on column public.news_articles.risk_event_type is
  'Classification contract: sanction, fraud, consumer_harm, legal, governance, reputational, market, none';
comment on column public.news_articles.alert_eligible is
  'True only when the article passes the direct own-company risk alert contract';
comment on column public.monitor_context_rules.trigger_mode is
  'How trigger_terms are evaluated: any or all';
comment on column public.monitor_context_rules.required_mode is
  'How required_terms are evaluated: any or all';
