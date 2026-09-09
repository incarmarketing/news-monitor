import json
from pathlib import Path
import unittest
from unittest.mock import patch, Mock

from media_byline import extract_bylines
from tools.sync_media_registry import inspect_article, public_url
import supabase_store
import publisher_identity
from tools import sync_media_registry


class MediaBylineTests(unittest.TestCase):
    def test_daum_can_be_checked_but_portal_brand_is_never_registered(self):
        url = "https://v.daum.net/v/20260909165149886"
        page = (Path(__file__).parent / 'fixtures/daum_publisher.html').read_text(encoding='utf-8')
        robots = Mock(can_fetch=lambda *args: True, crawl_delay=lambda *args: 1)
        for row in [ {'article_hash': 'x', 'link': url},
                     {'article_hash': 'x', 'link': 'https://news.google.com/rss/articles/abc', 'publisher_evidence_url': url} ]:
            with patch.dict(sync_media_registry._robots, {'v.daum.net': robots}, clear=True), patch.object(sync_media_registry, 'fetch_document', return_value=(page,url)) as fetch, patch.object(sync_media_registry.time, 'sleep'):
                result = inspect_article(row)
            fetch.assert_called_once_with(url)
            self.assertEqual(result['publisher_evidence']['name'], '아시아경제')
            self.assertEqual(result['authors'], [])

    def test_metadata_and_public_byline_contact(self):
        rows = extract_bylines('<meta name="author" content="홍길동 기자"><div class="article-writer"><span>홍길동 기자</span> press@example.com</div>')
        self.assertEqual(rows, [{"name": "홍길동", "method": "author_meta", "email": "press@example.com"}])

    def test_interview_subject_and_footer_are_not_authors(self):
        self.assertEqual(extract_bylines('<h1>김숙희 지점장 인터뷰</h1><p>홍길동 기자는 말했다.</p><footer><div class="writer">김철수 기자 editor@example.com</div></footer>'), [])

    def test_jsonld_only_article_author_not_publisher_or_subject(self):
        body = {"@graph": [{"@type": "Person", "name": "김대표"}, {"@type": "NewsArticle", "author": [{"@type": "Person", "name": "이영희"}, {"@type": "Organization", "name": "한국뉴스"}], "publisher": {"name": "대표이사"}}]}
        self.assertEqual(extract_bylines(f'<script type="application/ld+json">{json.dumps(body)}</script>'), [{"name": "이영희", "method": "article_jsonld"}])

    def test_multiple_authors_do_not_share_an_email(self):
        rows = extract_bylines('<div class="byline">홍길동 기자, 이영희 기자 one@example.com</div>')
        self.assertEqual({r["name"] for r in rows}, {"홍길동", "이영희"})
        self.assertFalse(any("email" in r for r in rows))

    def test_primary_author_cannot_take_a_second_authors_email(self):
        rows = extract_bylines('<meta name="author" content="홍길동"><div class="byline">홍길동 기자, 김철수 기자 second@example.com</div>')
        self.assertEqual(rows,[{"name":"홍길동","method":"author_meta"}])

    def test_generic_author_and_article_body_ignored(self):
        self.assertEqual(extract_bylines('<meta name="author" content="온라인뉴스팀"><div class="article-info">' + ('홍길동 기자 ' * 100) + '</div>'), [])

    def test_malformed_jsonld_is_not_fatal(self):
        self.assertEqual(extract_bylines('<script type="application/ld+json">{bad}</script><meta name="author" content="김민수">')[0]["name"], "김민수")

    def test_publisher_names_and_subscription_controls_are_not_people(self):
        self.assertEqual(extract_bylines('<meta name="author" content="뉴시스"><meta name="author" content="스포츠월드"><div class="reporter">구독한 기자</div>'), [])

    def test_senior_reporter_title_belongs_to_name(self):
        self.assertEqual(extract_bylines('<div class="byline">최현태 선임기자 press@example.com</div>'), [{"name": "최현태", "method": "byline", "email": "press@example.com"}])

    def test_related_article_reporters_do_not_join_primary_author(self):
        html = '<meta name="author" content="김경동 기자"><div class="byline">김경동 기자</div><div class="article-info">김태현 기자</div><div class="article-info">정진영 기자</div>'
        self.assertEqual([r['name'] for r in extract_bylines(html)], ['김경동'])

    def test_department_is_not_a_person(self):
        self.assertEqual(extract_bylines('<meta name="author" content="문화체육부">'), [])

    def test_article_publisher_override_wins_over_rss_identity(self):
        row = {"source": "google", "rss_source_name": "뉴스1", "raw": {"publisher_manual_override": "검증언론"}}
        self.assertEqual(publisher_identity.resolve_publisher(row)["name"], "검증언론")

    @patch("tools.sync_media_registry.fetch_document")
    def test_portal_not_fetched_or_guessed(self, fetch):
        self.assertEqual(inspect_article({"article_hash": "x", "link": "https://news.google.com/rss/articles/test"})["status"], "needs_original")
        fetch.assert_not_called()

    def test_publisher_recovery_reuses_byline_fetch_without_inventing_reporter(self):
        row = {'article_hash': 'x', 'source': publisher_identity.UNKNOWN, 'link': 'https://new-press.example/1'}
        page = '<footer>Copyright © 디지털타임스.</footer>'
        robots = Mock(can_fetch=lambda *args: True, crawl_delay=lambda *args: 1)
        with patch.dict(sync_media_registry._robots, {'new-press.example': robots}, clear=True), patch.object(sync_media_registry, 'fetch_document', return_value=(page, row['link'])) as fetch, patch.object(sync_media_registry.time, 'sleep'):
            result = inspect_article(row)
        fetch.assert_called_once_with(row['link'])
        self.assertEqual(result['publisher_evidence']['name'], '디지털타임스')
        self.assertEqual(result['authors'], [])
        self.assertEqual(result['status'], 'not_found')

    def test_known_publisher_keeps_existing_byline_flow(self):
        row = {'article_hash': 'x', 'source': '보험매일', 'link': 'https://new-press.example/1'}
        robots = Mock(can_fetch=lambda *args: True, crawl_delay=lambda *args: 1)
        with patch.dict(sync_media_registry._robots, {'new-press.example': robots}, clear=True), patch.object(sync_media_registry, 'fetch_document', return_value=('<meta name="author" content="홍길동">', row['link'])), patch.object(sync_media_registry.time, 'sleep'), patch.object(publisher_identity, 'publisher_from_html') as parse:
            result = inspect_article(row)
        parse.assert_not_called()
        self.assertEqual(result['authors'][0]['name'], '홍길동')
        self.assertNotIn('publisher_evidence', result)

    def test_publisher_conflict_is_not_marked_complete_and_evidence_is_not_a_byline_column(self):
        result = {'article_hash': 'x', 'authors': [], 'status': 'not_found', 'publisher_evidence': {'name': '검증신문'}}
        for outcome in ['conflict', 'failed', 'updated']:
            with self.subTest(outcome=outcome), patch('sys.argv', ['sync_media_registry', '--input', 'fixture.json', '--apply']), patch.object(sync_media_registry.Path, 'read_text', return_value='[{"article_hash":"x"}]'), patch.object(sync_media_registry.Path, 'write_text'), patch.object(sync_media_registry.Path, 'mkdir'), patch.object(sync_media_registry, 'inspect_article', return_value=result), patch.object(sync_media_registry, 'save_page_evidence', return_value=outcome), patch.object(supabase_store, 'request') as request:
                sync_media_registry.main()
                if outcome == 'updated':
                    request.assert_called_once()
                    self.assertNotIn('publisher_evidence', request.call_args.kwargs['json'][0])
                else:
                    request.assert_not_called()

    @patch("tools.sync_media_registry.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 80))])
    def test_private_addresses_rejected(self, _):
        with self.assertRaises(ValueError): public_url("https://internal.test/news")

    def test_scheme_rejected(self):
        with self.assertRaises(ValueError): public_url("file:///secrets")

    @patch("supabase_store.request")
    def test_own_mention_seeds_any_category_preserving_manual(self, request):
        supabase_store.save_own_media_relations([
            {"source": "보험저널", "category": "industry", "own_mentioned": True},
            {"source": "보험저널", "category": "own", "own_mentioned": True},
            {"source": "허위매체", "category": "own", "own_mentioned": False},
            {"source": "언론사 확인 필요", "own_mentioned": True},
            {"source": "example.com", "own_mentioned": True},
        ])
        request.assert_called_once()
        self.assertEqual([r["name"] for r in json.loads(request.call_args.kwargs["data"])], ["보험저널"])
        self.assertIn("ignore-duplicates", request.call_args.kwargs["headers"]["Prefer"])


if __name__ == "__main__":
    unittest.main()
