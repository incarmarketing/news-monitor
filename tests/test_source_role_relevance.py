import unittest

import analyzer
import classification_normalizer


class SourceRoleRelevanceTests(unittest.TestCase):
    def tearDown(self):
        analyzer.configure_context_rules([])

    def test_incidental_roles_are_noise_even_with_insurance_query(self):
        cases = [
            ('듀오, 청년층 데이트 불황 분석',
             '한화손해보험 펨테크연구소가 의뢰한 미혼 남녀 조사에서 연애 의향에 응답했다.'),
            ('남자배구, 태국에 또 패배',
             '차영석(KB손해보험)의 블로킹과 서브 에이스로 3세트를 만회했다.'),
            ('소비자민원평가-통신, 불완전판매 분쟁',
             '가입부터 해지까지 통신 상품 민원이 쏟아졌다.'),
        ]
        for title, description in cases:
            with self.subTest(title=title):
                article = dict(title=title, description=description,
                               keyword='인카금융서비스 보험상품', keyword_category='competitor',
                               summary='보험상품 GA 업계 분석')
                self.assertTrue(analyzer.source_role_noise_reason(article))
                self.assertTrue(analyzer.is_non_business_noise(article))
                self.assertEqual(analyzer.categorize(article), 'other')
                context = analyzer.apply_context_safety_guardrails(article, {
                    'category': 'competitor', 'tone': 'caution', 'own_mentioned': False,
                })
                self.assertEqual(context['category'], 'other')
                self.assertFalse(context['alert_eligible'])
                self.assertTrue(context['classification_decision_path']['relevance_exclusion_reason'])

    def test_material_insurance_and_sponsorship_are_preserved(self):
        cases = [
            ('3954만개 계정 털린 티빙, 사이버보험 필요성', 'KB손해보험 개인정보배상책임보험 보장 한도'),
            ('미혼 남녀 결혼 의향 조사', '한화손해보험 연구소 조사로 보험상품 보장 수요를 분석했다.'),
            ('통신 상품 불완전판매 분쟁', '휴대폰 보험계약의 불완전판매도 확인됐다.'),
            ('배구 V-리그 스폰서 계약', '흥국생명이 후원 계약을 맺고 블로킹 기부 행사를 진행한다.'),
            ('남자배구 선수 인터뷰', 'KB손해보험 소속 선수가 보험사기 혐의로 제재를 받았다.'),
            ('상금왕 경쟁, 골프 대회', '인카금융서비스 소속 선수의 대회 성적'),
            ('GA 설계사 보험사기 제재', '인카금융서비스 전직 설계사 제재'),
        ]
        for title, description in cases:
            with self.subTest(title=title):
                self.assertEqual(analyzer.source_role_noise_reason(dict(title=title, description=description)), '')

    def test_raw_source_body_can_preserve_insurance_context(self):
        article = dict(title='통신 불완전판매 분쟁', raw={'body': '실제 보험계약과 보험료 분쟁도 포함됐다.'})
        self.assertEqual(analyzer.source_role_noise_reason(article), '')

    def test_insufficient_evidence_is_not_a_noise_decision(self):
        self.assertEqual(analyzer.source_role_noise_reason({'title': '연애와 결혼의 미래'}), '')

    def test_archived_category_and_context_are_corrected_together(self):
        original = dict(title='통신 민원, 불완전판매 분쟁', category='regulation',
                        _ai_context={'category': 'regulation', 'tone': 'caution'})
        normalized = classification_normalizer.normalize_article(original)
        self.assertEqual(normalized['category'], 'other')
        self.assertEqual(normalized['_ai_context']['category'], 'other')
        self.assertEqual(original['category'], 'regulation')
        self.assertEqual(original['_ai_context']['category'], 'regulation')

    def test_new_display_guard_respects_manual_feedback(self):
        article = dict(title='통신 민원, 불완전판매 분쟁', category='regulation', _feedback_applied=True)
        self.assertEqual(classification_normalizer.normalize_article(article)['category'], 'regulation')


if __name__ == '__main__':
    unittest.main()
