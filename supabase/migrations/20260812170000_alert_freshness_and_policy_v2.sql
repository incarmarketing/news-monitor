-- Keep article truth classification separate from new-alert delivery eligibility.
-- Portal URLs and RSS timestamps can change when an old article is re-exposed,
-- so alert delivery uses stable title identity, original publication time, and
-- first discovery time together.

alter table if exists public.news_articles
  add column if not exists alert_identity text,
  add column if not exists source_published_at timestamptz;

update public.news_articles
set alert_identity = lower(
  regexp_replace(
    regexp_replace(
      regexp_replace(coalesce(title, ''), '^\s*\[[^\]]{1,40}\]\s*', '', 'i'),
      '\s+-\s+(www\.)?[a-z0-9.-]+\.[a-z]{2,}\s*$',
      '',
      'i'
    ),
    '[^0-9A-Za-z가-힣]+',
    '',
    'g'
  )
)
where coalesce(alert_identity, '') = '';

-- Repair rows whose portal timestamp moved forward long after first discovery.
update public.news_articles
set
  raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
    '_reexposed_feed_pub_date', pub_date,
    '_historical_reexposure_repaired', true
  ),
  pub_date = discovered_at
where pub_date is not null
  and discovered_at is not null
  and pub_date > discovered_at + interval '24 hours';

create index if not exists idx_news_articles_alert_identity_first_seen
  on public.news_articles (alert_identity, discovered_at asc)
  where coalesce(alert_identity, '') <> '';

create index if not exists idx_news_articles_source_published_at
  on public.news_articles (source_published_at desc)
  where source_published_at is not null;

create schema if not exists private;

create or replace function private.preserve_news_article_observation_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.alert_identity, '') = '' then
    new.alert_identity := lower(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(new.title, ''), '^\s*\[[^\]]{1,40}\]\s*', '', 'i'),
          '\s+-\s+(www\.)?[a-z0-9.-]+\.[a-z]{2,}\s*$',
          '',
          'i'
        ),
        '[^0-9A-Za-z가-힣]+',
        '',
        'g'
      )
    );
  end if;

  if tg_op = 'UPDATE' then
    if old.discovered_at is not null then
      new.discovered_at := old.discovered_at;
    end if;
    if old.pub_date is not null and new.pub_date is not null then
      new.pub_date := least(old.pub_date, new.pub_date);
    elsif old.pub_date is not null then
      new.pub_date := old.pub_date;
    end if;
    if old.source_published_at is not null and new.source_published_at is not null then
      new.source_published_at := least(old.source_published_at, new.source_published_at);
    elsif old.source_published_at is not null then
      new.source_published_at := old.source_published_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_news_article_observation_times() from public;

drop trigger if exists preserve_news_article_discovered_at on public.news_articles;
drop trigger if exists preserve_news_article_observation_times on public.news_articles;
create trigger preserve_news_article_observation_times
before insert or update on public.news_articles
for each row
execute function private.preserve_news_article_observation_times();

insert into public.monitor_context_rules (
  rule_key,
  label,
  category,
  tone,
  trigger_terms,
  required_terms,
  exclude_terms,
  trigger_mode,
  required_mode,
  priority,
  enabled,
  memo,
  rule_group,
  rule_type,
  decision,
  dashboard_visible,
  test_note
) values
  (
    'det_risk_direct_recruiting_criticism',
    '당사 리크루팅·외형성장 직접 비판',
    'own',
    'negative',
    array[
      '막차 리크루팅',
      '영입 경쟁 과열',
      '정착지원금 급증',
      '관리 부실 논란',
      '수만 늘렸나',
      '외형 성장 뒤',
      '과제 직면'
    ],
    array['인카금융서비스','인카금융'],
    array['사실무근','문제 없음','호실적','양호한 실적'],
    'any','any',6,true,
    '당사가 제목 또는 원문 문장에서 리크루팅 과열·관리부실·외형성장 비판의 직접 대상일 때만 경보 후보',
    'risk_event:reputational','guardrail','alert_direct_own_risk',true,
    '정착지원금·GA 제도 일반 기사와 당사 직접 비판 기사를 분리'
  ),
  (
    'det_suppress_comparative_policy_context',
    '비교표·제도 점검의 단순 당사 언급',
    'own',
    'caution',
    array['1200%룰','판매수수료','정착지원금','제도 안착','전격 점검'],
    array['인카금융서비스','인카금융'],
    array[
      '등록 취소','업무 정지','과징금','과태료','보험사기','편취',
      '불완전판매','부당승환','소비자 피해','내부통제 부실','관리 부실'
    ],
    'any','any',12,true,
    '당사가 비교 대상 또는 점검 대상 목록에만 등장하면 부정 경보는 억제하고 규제·점검 주의로 유지',
    'alert_suppression:comparative_policy','guardrail','suppress_negative_alert',true,
    '규제·점검 주의 1건과 당사 직접 부정 사건을 분리'
  )
on conflict (rule_key) do update
set
  label = excluded.label,
  category = excluded.category,
  tone = excluded.tone,
  trigger_terms = excluded.trigger_terms,
  required_terms = excluded.required_terms,
  exclude_terms = excluded.exclude_terms,
  trigger_mode = excluded.trigger_mode,
  required_mode = excluded.required_mode,
  priority = excluded.priority,
  enabled = excluded.enabled,
  memo = excluded.memo,
  rule_group = excluded.rule_group,
  rule_type = excluded.rule_type,
  decision = excluded.decision,
  dashboard_visible = excluded.dashboard_visible,
  test_note = excluded.test_note,
  updated_at = now();
