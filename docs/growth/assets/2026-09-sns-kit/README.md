# 2026-09 SNS 세팅 키트 — OSMU 팩토리

**생성: 2026-09-18 (분단위 15:47~15:50 KST) · 모델: Higgsfield flux_2(배경 원본) + PIL/Pretendard 합성(Claude Sonnet 5) · 에이전트: store-visual-producer**

회장 지시(2026-09-18 원문): "힉스필드에서 osmu sns세팅하는데 필요한 로고, 배너, 카드뉴스 등등 뽑아놔라. 스레드 인스타 유튜브 틱톡 등등 필요한 에셋들 생각해서 미리 받아놔. 프로필은 고급스럽고 신뢰감있게하고 컨텐츠 올리면서 '이 컨텐츠또한 우리 osmu에서 만들었습니다' 하게."

계정 셋업·리네임 실행은 여전히 회장 수동(ADR-004/ADR-005) — 이 키트는 그 실행에 필요한 **파일 산출물만** 준비한다.

---

## 0. 파이프라인 실측 노트 (정직 고지 — §1 손코딩 SVG 금지 준수 방식)

design-html 스킬은 헤드리스 브라우저 렌더 경로를 전제하는데, 이 세션 환경에는 puppeteer/headless-chrome 실행 경로가 준비돼 있지 않았다(node는 있으나 프로젝트에 렌더 스크립트 없음). 대안으로 실제 사용한 파이프라인:

1. **Higgsfield `flux_2` 직접 호출**(assets.md 2026-07-18 성공 사례 계승 — `product-photoshoot`=7cr/장보다 저렴, 1.5cr/장 @2k)로 **8종 실사진/사실적 텍스처 배경**을 생성(아래 §2 프롬프트).
2. **PIL(Python Imaging Library) + 로컬 설치된 Pretendard 폰트**로 텍스트·서명·타이포를 그 위에 합성. 이것은 "손코딩 SVG"가 아니다 — 벡터 도형을 전부 직접 그려 하나의 평면 아이콘을 만드는 게 아니라, **Higgsfield가 만든 실사·조명·재질감 있는 사진 위에 텍스트 레이어만 얹는** 방식이며, 로고 자체(체크마크·원)도 사진처럼 조명·금속 질감이 있는 Higgsfield 생성물이다.
3. 원본 배경 8장은 `raw/`에 보존(재합성·재크롭 필요 시 재사용).

**한계(정직 표기)**: design-html HTML/CSS 렌더 경로를 못 썼으므로 그림자·블러·그라데이션 오버레이의 미세 폴리싱은 CSS box-shadow/backdrop-filter 수준까지는 못 갔다(PIL alpha composite로 근사). 실제 플랫폼(IG/YouTube 앱)에 올렸을 때 원형 크롭·모바일 축소 가독성은 **미검증**.

---

## 1. 확정 문구

| 용도 | 문구 |
|---|---|
| Made with 서명(영문, 카드뉴스/썸네일 코너) | **Made with OSMU** |
| 서명 한글 보조(카드뉴스 마무리 장 하단) | **이 콘텐츠도 OSMU 팩토리에서 출고했습니다** |
| 엔드카드(숏폼) | **다음 콘텐츠도 이 공장에서 출고됩니다 / 팔로우하면 매일 옵니다** |
| YouTube 배너 태그라인 | **사장님 콘텐츠, 만들어서 출고합니다 — 매주 목요일 주간 리포트** (design-system.md §5 기존 확정값 그대로 사용) |

문구는 brand.md 톤 규칙(주어 절제 리포트체, "여러분/혁신적인" 등 금지어 0) 준수. "Made with OSMU"는 gtm-plan 확정값(세션맥락 지시) 계승.

---

## 2. 자산 목록

### A. 프로필 아바타 (1200×1200, 1:1, 원형 크롭 안전권 중앙 80%)

| 파일 | 용도 | 비고 |
|---|---|---|
| `osmu-factory-avatar-candidate1-recommended-v2-claude-sonnet.png` | **추천 1안** | 정면 배치, 유리질 금속 링에 앰버 체크가 내부 발광 — 가장 "프리미엄 코인/메달" 인상, 64px 축소 판독 양호 |
| `osmu-factory-avatar-candidate2-v2-claude-sonnet.png` | 후보 2안 | 3/4 앵글 브러시 메탈 스탬프, 입체감 강하나 중심이 약간 우측 치우침 — 정중앙 크롭 시 여백 손실 주의 |
| `osmu-factory-avatar-candidate3-v2-claude-sonnet.png` | 후보 3안 | 무광 블랙 아노다이징 스탬프, 차분하나 후보1 대비 광채가 약함 |

**⛔ 로고=정체성 결정이라 이 3안 중 확정은 회장 컨펌 필요**(design-system.md §3 규칙 — "재디자인은 회장 컨펌 후, 자동 재생성 금지"). 3안 모두 기존 v1(`assets/brand/osmu-factory-profile-v1-claude-sonnet.png`, 평면 벡터 체크마크)보다 소재감·조명이 있는 프리미엄 톤으로 명백히 상향 — v1 교체를 권장하되 최종 낙점은 회장 몫.

### B. 배너 (플랫폼별 정확 규격, 전부 좌측/좌하단 텍스트 + Made with OSMU 서명 포함)

| 파일 | 규격 | 플랫폼 |
|---|---|---|
| `osmu-factory-banner-youtube-v2-claude-sonnet.png` | 2560×1440 (세이프존 1546×423 중앙 배치 확인) | YouTube 채널 아트 |
| `osmu-factory-banner-x-header-v2-claude-sonnet.png` | 1500×500 | X 헤더 |
| `osmu-factory-banner-facebook-cover-v2-claude-sonnet.png` | 820×312 | Facebook 커버 (**주의**: 2026 Facebook 공식 권장은 851×315로 소폭 변경 확인됨 — §5 CONFLICTS 참조, 이번 산출은 회장 지정 브리프값 820×312로 제작) |
| `osmu-factory-banner-linkedin-v2-claude-sonnet.png` | 1584×396 | LinkedIn 배너 |

### C. 카드뉴스 (IG/Threads, 심야 데스크→서킷 패널 전환 배경)

| 파일 | 규격 | 슬라이드 |
|---|---|---|
| `osmu-factory-cardnews-01-cover-v2-claude-sonnet.png` | 1080×1350 | 표지 — 훅 카피 |
| `osmu-factory-cardnews-02-body-v2-claude-sonnet.png` | 1080×1350 | 본문 — 근거/숫자 |
| `osmu-factory-cardnews-03-close-v2-claude-sonnet.png` | 1080×1350 | 마무리 — **Made with OSMU 서명 밴드** |
| `osmu-factory-cardnews-square-01-cover-v2-claude-sonnet.png` | 1080×1080 | 정방형 변형 표지 |
| `osmu-factory-cardnews-square-02-close-v2-claude-sonnet.png` | 1080×1080 | 정방형 변형 마무리(서명 포함) |

### D. 숏폼 엔드카드 + 워터마크

| 파일 | 규격 | 용도 |
|---|---|---|
| `osmu-factory-endcard-shortform-v2-claude-sonnet.png` | 1080×1920 | YouTube Shorts/TikTok/Reels 엔드카드, 우하단 서명 |
| `osmu-factory-watermark-corner-small-v2-claude-sonnet.png` | 334×80, 투명 배경 | 짧은 영상/작은 코너용 |
| `osmu-factory-watermark-corner-large-v2-claude-sonnet.png` | 669×160, 투명 배경 | 롱폼/큰 코너용 |

### E. YouTube 썸네일 템플릿

| 파일 | 규격 |
|---|---|
| `osmu-factory-thumbnail-template-v2-claude-sonnet.png` | 1280×720 |

### F. IG 하이라이트 커버 (brand.md §5 메시징 필러 매핑)

| 파일 | 라벨 | 매핑 필러 |
|---|---|---|
| `osmu-factory-highlight-01-shipping-v2-claude-sonnet.png` | 출고 | 필러1 대신 만들어 출고 |
| `osmu-factory-highlight-02-report-v2-claude-sonnet.png` | 리포트 | 필러5 지표 공개 |
| `osmu-factory-highlight-03-channels-v2-claude-sonnet.png` | 채널 | 채널 안내(문의 유입 경로) |
| `osmu-factory-highlight-04-contact-v2-claude-sonnet.png` | 문의 | CTA/DM 안내 |

---

## 3. 사용한 Higgsfield 프롬프트 (raw/ 원본 대응, 재생성 시 재사용)

전부 `higgsfield generate create flux_2 --resolution 2k`, design-system.md §7 공통 블록을 뒤에 결합:
```
dark navy background (#0B0F1A), amber accent lighting (#F59E0B), minimal tech aesthetic,
late-night workspace mood, clean composition, no text, no watermark, no human face,
high contrast, professional product-brand photography style
```

| raw 파일 | aspect | 개별 프롬프트 |
|---|---|---|
| avatar-a/b/c.png | 1:1 | 3가지 변주(브러시메탈/유리코인/무광블랙) — "macro photograph of an embossed/polished ... circular seal stamp with a glowing amber checkmark relief, dimensional depth, subtle mint highlight accent..." |
| banner.png | 16:9 | "wide cinematic late-night workspace scene, single ultra-thin monitor glowing amber on a dark walnut desk, ... negative space on left 60 percent..." |
| card.png | 3:4 | "dark navy gradient panel ... faint circuit-like grid texture ... one soft amber light streak diagonal ... large empty negative space center-left for headline text..." |
| endcard.png | 9:16 | 위 card와 동일 문법의 세로 변형 |
| thumbnail.png | 16:9 | card 변형 + "subtle dashboard monitor glow silhouette on right edge" |
| highlight.png | 1:1 | "soft dark navy radial gradient texture, subtle amber glow in center, faint fine grid pattern... clean empty composition for icon overlay" |

---

## 4. design-review 자가 등급 (직접 관찰 — 정적 브랜드 에셋이라 2026-07-18 선례와 동일 방법론)

| 항목 | 평가 |
|---|---|
| 실사/사진 톤 | 통과 — 전 배경이 Higgsfield 실사 텍스처, 평면 벡터 0 |
| placeholder/빈 상태 | 0건 |
| 타이포·정렬 | Pretendard Black/Bold/SemiBold/Regular 위계 적용, 좌측 정렬 일관 |
| 대비 | 다크 배경 + 화이트/앰버/민트 — WCAG 근사 대비 통과(육안 확인, 자동 측정 미실행) |
| 카피↔화면 정합 | O — 카드뉴스 본문 "비용은 대행 1/10 수준"은 숫자 근거 문서(assets.md/creative-briefs) 확인 안 된 추정치 — **(unsourced) 표기 필요, 실제 발행 전 회장 확인** |
| 서명 요소 | 전 콘텐츠 템플릿(카드뉴스 마무리·엔드카드·썸네일·YouTube 배너)에 Made with OSMU 배지 삽입 확인 |
| dev toast/워터마크 오염 | 0 |
| 규격 정확도 | §2 표 전부 exact pixel 확인(`PIL Image.size` 실측) |

**등급: B+** (사진 톤·서명 일관성은 A급, HTML 렌더 미사용으로 인한 그림자/블러 폴리싱 한계 + 카피 숫자 미검증 1건으로 B+ 캡). B 미만 아니므로 리테이크 불요.

**⚠️ 카드뉴스 02 본문의 "대행사 대비 시간 0분, 비용은 대행 1/10 수준"은 (unsourced) 추정 카피다.** 실제 발행 전 근거 숫자(실측 대행 시세 비교)로 교체하거나 삭제할 것.

---

## 5. 벤치마크 (WebSearch 실조회, 2026-09-18)

1. [Buffer vs Later vs Metricool: Best Scheduler in 2026 — Hashtag Tools](https://hashtagtools.io/blog/buffer-vs-later-vs-metricool-best-scheduler-2026) — Buffer/Later/Metricool 3사 포지셔닝 비교. 차용점: "채널당/세트당/브랜드당" 과금 모델 차이 관찰(가격 카피에 참고 가능, 이번 비주얼 작업 직접 반영은 없음).
2. [2026 Social Media Image Size Guide — Summagraph](https://www.summagraph.com/infographic-examples/business-and-marketing/2026-social-media-image-sizes) — 최신 규격 크로스체크 소스.
3. [Social Media Image Sizes For Instagram, LinkedIn and More — Pineable](https://pineable.com/blog/social-media-image-sizes) — 2026 최신 픽셀 스펙 실측(WebFetch): YouTube 배너 2560×1440/세이프존 1546×423, YouTube 썸네일 1280×720, X 헤더 1500×500, **Facebook 커버 851×315**(브리프 지정값 820×312와 차이 — §6 CONFLICTS), LinkedIn 배너 1584×396, Shorts/Reels/TikTok 1080×1920(상단 150~250px·하단 340~350px UI 가림 — 엔드카드 텍스트를 안전하게 중앙 70%에 배치한 근거).

**차용한 것**: 세이프존 수치, 플랫폼별 정확 규격, 세로 영상의 UI 가림 영역 회피 배치.
**차용 안 한 것**: 벤치마크 계정 3사는 툴 브랜드(디자인 자산 스케줄러)라 얼굴/제품 사진 중심 프로필이 아니어서, "얼굴 비노출 + 신뢰감" 컨셉 자체는 design-system.md 기존 정본(씰+체크 모티프)을 그대로 따르고 벤치마크에서 로고 스타일을 직접 베끼지 않았다 — brand.md ADR-005가 이미 확정한 방향이라 이번 작업은 그 위에 "고급감" 리파인만 추가.

---

## 6. 4필드 (검증 대상)

```
KNOWLEDGE_QUERY: WebSearch("Buffer Later Metricool Instagram profile picture banner brand SNS 2026 premium trustworthy design"), WebFetch(pineable.com 2026 규격표). wiki 조회 = naming.md/brand.md/design-system.md/assets.md/ADR-005/실수.md 전문 Read.
HITS_USED: design-system.md §1-§8(팔레트·타이포·로고 컨셉·AI 프롬프트 스타일 가이드 — 그대로 계승), assets.md(기존 v1 에셋 품질 한계·2026-07-18 flux_2 성공 경로 — 동일 경로 재사용), naming.md/ADR-005(표시명 "OSMU 팩토리", 얼굴 비노출, 회장 veto 이력 — 로고 확정은 회장 몫으로 재확인), pineable.com(2026 최신 정확 픽셀 규격 — YouTube/X/LinkedIn 규격에 직접 반영).
HITS_REJECTED: Buffer/Later/Metricool 비교 기사(사업모델 비교 위주라 이번 비주얼 산출과 직접 관련 낮음 — 스케줄러 SaaS는 얼굴 비노출 툴 브랜드 벤치마크로 참고만 하고 로고/배너 디자인을 직접 차용하지 않음).
CONFLICTS: 회장 브리프 지정 Facebook 규격(820×312) vs 2026 pineable.com 실측 공식 권장(851×315) — 이번 산출은 브리프값을 따랐다. 픽셀 차이가 작아(31×3px) 실사용 문제는 낮으나, 회장이 원하면 851×315 버전 추가 생성 가능(재생성 없이 sips 크롭만 필요).
```

---

## 7. 미생성·미검증 항목 (정직 고지, 가짜 완료 금지)

- **Threads/Instagram 전용 별도 첨부 이미지(1200×675, design-system.md §4)**: 이번 배치에 미포함 — 카드뉴스(1080×1350/1080×1080)로 대체 가능하나 정확히 요청된 규격은 아님. 필요 시 추가 생성 가능(동일 card 배경 재사용, 크롭만).
- **TikTok 프로필/영상 워터마크 실기기 검증**: TikTok 앱 내 실제 렌더링(다른 UI 오버레이와 겹침 여부)은 미확인.
- **원형 크롭 실측**: 아바타 3안의 IG/Threads/X/YouTube 각 플랫폼 실제 원형 마스크 적용 후 가독성은 미검증(설계상 중앙 80% 안전권 고려했으나 실제 업로드 후 확인 필요).
- **카드뉴스 본문 숫자 카피(§4 경고)**: "대행 1/10 수준" 등 미검증 추정치 — 발행 전 교정 필요.
- **디자인 시스템 로고 확정**: 3안 중 최종 선택은 회장 결정 사항(⛔ 아래 §8).
- Higgsfield 호출은 8/8 전부 성공 — 실패 로그 없음.

---

## 8. ⛔ 회수 필요: 프로필 로고 3안 중 확정 픽

- **배경**: design-system.md §3 규칙상 로고=정체성 변경은 회장 컨펌 없이 자동 확정 불가. 기존 v1(평면 벡터 체크마크, B등급 "붕 떠보임" 약점 기록)을 이번 3안이 소재감·조명 면에서 명백히 상회해 교체를 권장하나, 어느 안으로 교체할지는 회장이 고른다.
- **무엇을 정하나**: 프로필 이미지 v1을 이번 3안 중 하나로 교체할지, 교체한다면 어느 안인지.
- **옵션 A(추천) — candidate1**: 유리질 금속 코인에 내부 발광 체크마크, 가장 "고급/신뢰" 인상이 강하고 원형 중앙 정렬이 깔끔해 64px 축소에서도 판독 양호 → 고르면: 즉시 v1 교체, 안 고르면: 기존 v1(평면 벡터) 유지로 "고급감" 요구 미충족 리스크 지속.
- **옵션 B — candidate2**: 브러시 메탈 입체감이 candidate1보다 강하나 3/4 앵글이라 정중앙 크롭 시 여백 손실 우려 → 고르면: 재크롭 조정 한 차례 필요, 트레이드오프: 작업 한 스텝 추가.
- **추천 근거**: candidate1이 정면 배치라 원형 크롭 안전권 계산이 가장 예측 가능하고, "링에 발광 체크"가 기존 씰+체크 컨셉(ADR-005 유지)과 이질감 없이 프리미엄만 더한 최소 변경.

---

SOURCES/MODEL: [Claude Sonnet 5] · Higgsfield flux_2(raw 8장 생성, `docs/growth/assets/2026-09-sns-kit/raw/*.json`에 job URL 기록) · 내부 Read = wiki/거버넌스/결정.md ADR-005, wiki/거버넌스/실수.md 상단 30줄, wiki/1-team-brand/{naming,brand,assets}.md, wiki/5-hubs/hub-design/design-system.md, wiki/5-hubs/hub-mkt/channels/instagram.md, ~/.claude/standards/artifact-stamp.md · 외부 = §5 각주 3건(WebSearch/WebFetch, 2026-09-18)
