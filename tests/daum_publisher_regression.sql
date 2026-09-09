begin;
set local role service_role;
insert into public.news_articles(article_hash,report_date,title,source,link,own_mentioned,raw)
values ('daum-footer-regression',current_date,'Daum footer fixture','아시아경제','https://news.google.com/rss/articles/daum-fixture',true,
  '{"publisher_evidence":{"name":"아시아경제","method":"page_copyright","host":"v.daum.net","url":"https://v.daum.net/v/20260909165149886","signals":["daum_site_name","article_copyright"]}}');
insert into public.article_byline_evidence(article_hash,status,evidence_url,attempts)
values ('daum-footer-regression','needs_original','https://news.google.com/rss/articles/daum-fixture',1);
do $$ begin
  if not exists(select 1 from jsonb_array_elements(public.get_media_byline_candidates(1000)) x
                where x->>'article_hash'='daum-footer-regression' and x->>'publisher_evidence_url'='https://v.daum.net/v/20260909165149886')
  then raise exception 'verified Daum URL not queued'; end if;
end $$;
update public.news_articles set source='언론사 확인 필요',raw='{"_tone":"neutral","new_field":42}'
where article_hash='daum-footer-regression';
do $$ begin
  if (select source from public.news_articles where article_hash='daum-footer-regression') <> '아시아경제'
  then raise exception 'Daum source lost on recollection'; end if;
  if (select raw->>'new_field' from public.news_articles where article_hash='daum-footer-regression') <> '42'
  then raise exception 'other incoming fields overwritten'; end if;
end $$;
update public.news_articles set raw=jsonb_set(raw,'{publisher_evidence,signals}','["article_copyright"]')
where article_hash='daum-footer-regression';
update public.news_articles set source='언론사 확인 필요',raw='{}' where article_hash='daum-footer-regression';
do $$ begin
  if (select source from public.news_articles where article_hash='daum-footer-regression') <> '언론사 확인 필요'
  then raise exception 'uncorroborated portal copyright accepted'; end if;
end $$;
insert into public.article_publisher_overrides(article_hash,press_name) values('daum-footer-regression','수동확정신문');
update public.news_articles set source='언론사 확인 필요',raw='{}' where article_hash='daum-footer-regression';
do $$ begin
  if (select source from public.news_articles where article_hash='daum-footer-regression') <> '수동확정신문'
  then raise exception 'manual correction overwritten'; end if;
  if has_function_privilege('anon','public.get_media_byline_candidates(integer)','execute')
     or has_function_privilege('authenticated','public.get_media_byline_candidates(integer)','execute')
  then raise exception 'private enrichment queue exposed'; end if;
end $$;
rollback;
select 'Daum publisher recovery and recollection regression passed; fixtures rolled back' as result;
