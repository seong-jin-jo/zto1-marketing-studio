# 유입 태그 규격: OSMU

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

## 미개통 (2026-09-16 기준)
GA4 property 미생성, 랜딩 미배포. 3칸에서 실문자열을 켤 때까지 이 문서는 규격일 뿐 개통이 아니다.
