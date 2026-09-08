// Legacy "competitor" includes both insurers and insurance agencies.
const GA_CONTEXT = /\bGA\b|법인보험대리점|보험대리점|굿리치|에이플러스에셋|리치앤코|한화생명금융서비스|마이금융파트너|DB금융서비스|메가금융서비스|글로벌금융판매|지에이코리아|한국보험금융|프라임에셋|리더스금융판매|유퍼스트|피플라이프|메트라이프금융서비스|삼성생명금융서비스|더블유에셋|에즈금융서비스|인카금융서비스/i;
const INSURER_CONTEXT = /삼성생명|한화생명|교보생명|신한라이프|미래에셋생명|KB라이프|농협생명|흥국생명|동양생명|ABL생명|AIA생명|라이나생명|메트라이프생명|DB생명|KDB생명|하나생명|삼성화재|현대해상|DB손해보험|DB손보|KB손해보험|KB손보|메리츠화재|한화손해보험|한화손보|흥국화재|롯데손해보험|롯데손보|농협손해보험|농협손보|MG손해보험|AXA손해보험|악사손보|AIG손해보험|캐롯손해보험|카카오페이손해보험/;

export function isInsurerOnlyContext(article = {}) {
  const text = `${article.title || ""} ${article.summary || ""}`;
  return INSURER_CONTEXT.test(text) && !GA_CONTEXT.test(text);
}
