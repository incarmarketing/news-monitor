-- Run as service_role inside a rollback-only transaction. No external sends.
begin;
set local role service_role;
insert into public.news_articles(article_hash,report_date,title,source,link,category,own_mentioned,raw)
values ('registry-test-a',current_date,'registry fixture','언론사 확인 필요','https://registry-test.example/a','industry',true,'{}'),
 ('registry-test-b',current_date,'registry fixture','언론사 확인 필요','https://registry-test.example/b','own',false,'{}'),
 ('registry-test-c',current_date,'registry fixture','언론사 확인 필요','https://news.google.com/registry-test','industry',true,'{}');
insert into public.media_relations(name,memo,owner) values('검증언론','수동 메모 보존','수동담당');
insert into public.press_aliases(host,press_name) values('registry-test.example','검증언론');
insert into public.reporters(name,media,memo,email) values('홍길동','검증언론','수동 기자 메모','manual@example.com');
insert into public.article_byline_evidence(article_hash,authors,status,evidence_url)
values ('registry-test-a','[{"name":"홍길동","email":"byline@example.com","method":"byline"}]','verified','https://registry-test.example/a');
update public.article_byline_evidence set authors=authors where article_hash='registry-test-a';
insert into public.article_publisher_overrides(article_hash,press_name) values('registry-test-c','기사별언론');
update public.news_articles set source='google',raw='{}' where article_hash='registry-test-c';
do $$
declare v jsonb;
begin
  if not public.media_portal_host('www.msn.com') or not public.media_publisher_unknown('네이버 뉴스') then raise exception 'portal registry parity failed'; end if;
  if (select source from public.news_articles where article_hash='registry-test-a') <> '검증언론' then raise exception 'alias backfill failed'; end if;
  if (select source from public.news_articles where article_hash='registry-test-c') <> '기사별언론' then raise exception 'article override lost'; end if;
  if (select raw->>'publisher_manual_override' from public.news_articles where article_hash='registry-test-c') <> '기사별언론' then raise exception 'override provenance lost'; end if;
  if (select memo from public.media_relations where name='검증언론') <> '수동 메모 보존' then raise exception 'manual media overwritten'; end if;
  if (select count(*) from public.reporters where media='검증언론' and name='홍길동') <> 1 then raise exception 'duplicate reporter'; end if;
  if (select email from public.reporters where media='검증언론' and name='홍길동') <> 'manual@example.com' then raise exception 'manual reporter overwritten'; end if;
  v := public.get_media_registry('media','검증언론',0);
  if (v->>'total')::int <> 1 then raise exception 'own mention criterion failed'; end if;
  if v::text like '%byline@example.com%' or v::text like '%manual@example.com%' then raise exception 'contact data exposed'; end if;
  if (public.get_media_registry('reporter','["검증언론","홍길동"]',0)->>'total')::int <> 1 then raise exception 'author history failed'; end if;
  if jsonb_array_length(public.get_media_registry('media','검증언론',30)->'rows') <> 0 then raise exception 'pagination failed'; end if;
  begin
    insert into public.press_aliases(host,press_name) values('news.google.com','위험한일괄매핑');
    raise exception 'portal alias was accepted';
  exception when others then
    if sqlerrm <> 'portal_requires_article_resolution' then raise; end if;
  end;
end $$;
update public.news_articles set source='언론사 확인 필요',raw='{}' where article_hash='registry-test-a';
do $$ begin
  if (select source from public.news_articles where article_hash='registry-test-a') <> '검증언론' then raise exception 'alias lost after recollection'; end if;
  if (select jsonb_array_length(authors) from public.article_byline_evidence where article_hash='registry-test-a') <> 1 then raise exception 'byline lost after recollection'; end if;
end $$;
rollback;
select 'media registry regression passed; fixtures rolled back' as result;
