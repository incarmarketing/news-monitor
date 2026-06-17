update public.monitor_keywords
   set category = 'industry',
       subcategory = 'insurance_company',
       entity_type = 'keyword',
       require_article_mention = false,
       default_tone = 'neutral',
       updated_at = now()
 where category = 'competitor'
   and keyword in ('손해보험', '생명보험');

update public.monitor_keywords
   set category = 'competitor',
       subcategory = 'ga_competitor',
       entity_type = 'organization',
       require_article_mention = true,
       default_tone = 'neutral',
       updated_at = now()
 where category = 'industry'
   and keyword in (
     '글로벌금융',
     '메가',
     'GA코리아',
     '굿리치',
     '사랑모아금융서비스',
     '에이플러스에셋',
     '영진에셋',
     '유퍼스트',
     '한금서',
     '한화생명금융서비스'
   );

