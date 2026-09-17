# 유입 태그 규격: OpenClaw 마케팅 레인 (OSMU)

> 상위 정본: `wiki/5-hubs/hub-mkt/gtm-plan.md` §2 (GA4 이벤트 4종·UTM 고정). 이 문서는 그 규격을 그로스 레인 3칸(개통)이 읽는 형태로 옮긴 것이다.

## 기준과 범위
- 기준 목적지: 단계 3(waitlist 랜딩) 전 = 브랜드 계정 프로필. 랜딩 라이브 후 = 랜딩 URL (미확정, `osmu.kr` 도메인 미등록).
- 운영 채널: `wiki/4-reference/channel-status.md` 가 정본. 이 문서에 계정 식별자를 복제하지 않는다.
- 값은 소문자 영문·숫자·하이픈만.

## 문자열 규격
| 항목 | 규격 | 예시 |
|---|---|---|
| `utm_source` | 플랫폼 | `threads`, `instagram`, `x`, `youtube` |
| `utm_medium` | 링크 표면 | `bio`, `post`, `watermark`, `organic` |
| `utm_campaign` | 콘텐츠 묶음 | `osmu-factory` (gtm-plan 고정값) 또는 `osmu-<sprint>-<slug>` |

정규식: `^osmu-[a-z0-9]+(?:-[a-z0-9]+)*$`

## GA4 이벤트 (gtm-plan §2 그대로)
`waitlist_submit` · `cta_click` · `sns_outbound` · `page_view`

## 개통 상태 (2026-09-18 실측, 3칸 `campaigns/2026-09/03-개통.md`)
- GA4 측정 ID: 운영 번들에 인라인돼 있음(`deploy-marketing.yml` 시크릿 주입). 속성 소유·수신은 회장 콘솔 확인 대기.
- 도착지: 운영 랜딩 `/` (임시 호스트). UTM 3개 도착지 보존 확인. 동의(Consent Mode v2) 후에만 `page_view` 발행.
- 발급 링크: `utm_source=threads|instagram` × `utm_medium=bio` × `utm_campaign=osmu-factory` 2건. 실문자열은 `channels.md`.
- 코드에 있는 이벤트: `page_view`·`cta_click`(cta_id=generate_ideas 만). **`waitlist_submit`·`sns_outbound` 는 코드에 없다.** 획득 관문 바퀴에서 제품 레인 발주.
- 예약 캠페인 값(정규식 통과): `osmu-2026-09-receipt`(가설 C) · `osmu-2026-09-report`(가설 D). 집행 전까지 변경 가능, 집행 뒤 변경 금지.
