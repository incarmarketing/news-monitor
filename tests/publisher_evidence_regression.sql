begin;
set local role service_role;
insert into public.news_articles(article_hash,report_date,title,source,link,raw)
values ('footer-regression',current_date,'footer fixture','검증신문','https://footer-regression.example/1',
  '{"publisher_evidence":{"name":"검증신문","method":"page_copyright","host":"footer-regression.example","url":"https://footer-regression.example/1"}}');

-- A recollection upsert may replace raw JSON; only publisher evidence survives.
insert into public.news_articles(article_hash,report_date,title,source,link,raw)
values ('footer-regression',current_date,'footer fixture','언론사 확인 필요','https://footer-regression.example/1','{"_tone":"neutral","new_field":42}')
on conflict(article_hash) do update set source=excluded.source,raw=excluded.raw;
do $$ begin
  if (select source from public.news_articles where article_hash='footer-regression') <> '검증신문' then raise exception 'verified source lost on upsert'; end if;
  if (select raw->>'new_field' from public.news_articles where article_hash='footer-regression') <> '42' then raise exception 'incoming raw field lost'; end if;
  if (select raw->>'_tone' from public.news_articles where article_hash='footer-regression') <> 'neutral' then raise exception 'classification overwritten'; end if;
end $$;

-- Explicit new names and manual corrections still win over older evidence.
update public.news_articles set source='새확인신문' where article_hash='footer-regression';
update public.news_articles set source='언론사 확인 필요',raw='{}' where article_hash='footer-regression';
do $$ begin
  if (select source from public.news_articles where article_hash='footer-regression') <> '언론사 확인 필요' then raise exception 'stale mismatched evidence reused'; end if;
end $$;
insert into public.article_publisher_overrides(article_hash,press_name) values('footer-regression','수동확정신문');
update public.news_articles set source='언론사 확인 필요',raw='{}' where article_hash='footer-regression';
do $$ begin
  if (select source from public.news_articles where article_hash='footer-regression') <> '수동확정신문' then raise exception 'manual override lost'; end if;
end $$;
rollback;
select 'publisher evidence recollection regression passed; fixtures rolled back' as result;
