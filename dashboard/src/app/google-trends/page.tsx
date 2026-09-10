"use client";

import { BackButton } from "@/components/shared/BackButton";

export default function GoogleTrendsPage() {
  return (
    <div className="px-region py-stack-section">
      <div className="mb-stack-section">
        <BackButton />
        <h2 className="text-subheading font-bold text-text">Google Trends</h2>
        <p className="text-caption text-subtle mt-micro">Google Trends 데이터 확인</p>
      </div>

      <div className="card p-stack-section text-center">
        <p className="text-body-sm text-subtle mb-stack">
          Google Trends API는 현재 Alpha 단계로 직접 연동이 불가합니다.
        </p>
        <p className="text-caption text-subtle mb-pad-inset">
          아래 링크에서 트렌드를 확인하세요. 교육 카테고리가 기본 설정되어 있습니다.
        </p>
        <a
          href="https://trends.google.com/trends/explore?geo=KR&cat=958"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-pad-inset py-stack-tight text-body-sm bg-accent text-accent-fg rounded-chip hover:bg-accent-hover"
        >
          Google Trends 열기
        </a>
      </div>

      <div className="card p-pad-inset mt-stack-section">
        <h3 className="text-body-sm font-medium text-muted mb-stack">활용 가이드</h3>
        <ul className="text-caption text-subtle space-y-stack-tight">
          <li>• 타겟 키워드의 검색량 추이를 확인하여 시즌별 콘텐츠 전략 수립</li>
          <li>• "관련 검색어"에서 떠오르는 키워드를 키워드 목록에 추가</li>
          <li>• 지역별 관심도를 확인하여 타겟 지역 콘텐츠 제작</li>
          <li>• Naver Trends와 비교하여 플랫폼별 검색 패턴 차이 분석</li>
        </ul>
      </div>
    </div>
  );
}
