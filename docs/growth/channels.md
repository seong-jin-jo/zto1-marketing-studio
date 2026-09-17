# OpenClaw 마케팅 레인 (OSMU) 운영 채널 정의서 v0.2.0

> 인지도 관문 정의 계열. 계정 식별자·연결 상태의 정본은 `wiki/4-reference/channel-status.md` 와 `wiki/5-hubs/hub-mkt/channels/`. 여기엔 레인이 읽을 요약만 둔다. 비밀값 기록 금지.
> v0.2.0 (2026-09-18, 3칸 개통): 링크 표면·완성 링크·개통 상태 열 추가. 근거 = `campaigns/2026-09/03-개통.md`.

| 채널 | 브랜드 | 계정 상태 (2026-09-18) | 링크 표면 | 완성 링크 (실문자열) | 링크 개통 상태 |
|---|---|---|---|---|---|
| Threads | OSMU 팩토리 (naming.md) | 운영 계정 존재(Live), 리브랜딩 미완 | 프로필 링크 필드 1개 | `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/?utm_source=threads&utm_medium=bio&utm_campaign=osmu-factory` | 발급됨 · 게시 회장 대기 (ADR-005 수동) |
| Instagram | 동일 | 운영 계정 존재(Connected), 리브랜딩 미완 | 프로필 링크 1번째 자리 (최대 5개) | `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/?utm_source=instagram&utm_medium=bio&utm_campaign=osmu-factory` | 발급됨 · 게시 회장 대기 (기존 티스토리 링크 제거 추천) |
| Threads·IG 게시물·첫 댓글 | 동일 | 발행 없음(제품 실발행 관찰 전) | 본문 첫 댓글 / 캡션 유도 | `…?utm_source={threads\|instagram}&utm_medium=post&utm_campaign=osmu-2026-09-<slug>` | 규격만 예약 · 미개통 |
| X · YouTube · TikTok | 동일 | 핸들 미확보 | 없음 | 없음 | 미개통 |

## 도착지
- 도착 페이지 = 운영 랜딩 `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/` (임시 호스트, osmu.kr 미등록). GA4 태그 전 페이지 적재, 동의 후 `page_view`. UTM 은 도착지 URL 에 보존됨(2026-09-18 curl 실측).
- 도메인 등록 후에는 301 리다이렉트로 쿼리를 보존해야 한다. 쿼리를 떨어뜨리는 리다이렉트는 개통 취소와 같다.

## 소유와 실행
- 계정·브랜드 정의는 OSMU 가 소유한다. 발행은 OSMU 제품 자체(도그푸딩)가 한다. 외주에 계정 권한을 주지 않는다.
- 이 벤처의 특이점: **콘텐츠 제작·발행 주체가 곧 제품이다.** 4칸 "외주"는 OpenClaw 크론(제품)이다.
- 계정 셋업·리네임·bio·링크 편집은 회장 수동 전용(ADR-005 7항). 절차서는 `campaigns/2026-09/03-개통.md` §5.
