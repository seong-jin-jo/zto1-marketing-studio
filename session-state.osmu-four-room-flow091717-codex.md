# OSMU 네 방 기본 흐름 QA v22 핸드오프

작성: 2026-09-17 14:25 KST

라인: osmu-four-room-flow091717-codex

## 무엇을 어디까지 했나

- 회장 요청 원문을 primary handoff basis로 사용했다. canonical `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`였다.
- localhost 실행 앱 커밋 `426bfb4c`에서 기본 흐름 최초와 최종 11/11, 네 방 4/4, Studio v1 14/14를 관찰했다.
- 390 라이트·다크, 768, 1024, 1440에서 네 방 20화면과 성과실에서 생성실 복귀 5/5를 관찰했다.
- 전체 Vitest 첫 실행의 YouTube 동시 요청 테스트 timeout을 비결정적 대기 결함으로 좁히고 `0c596b03`으로 수정했다. 전용 테스트 5회 85/85와 전체 374파일·2,414건을 재통과했다.
- TypeScript, 격리 production build 184/184, schema·seed·RLS, 디자인 lint를 통과했다.
- 제품 소스는 수정하지 않았다. QA 보고서와 원본 증거는 `docs/qa/osmu-four-room-basic-flow-v22-gpt-codex.md`, `logs/diff/osmu-four-room-flow-20260917-v22/`다.

## 남은 이슈와 다음 행동

- 과제 기준 v63과 canonical 승인 디자인 핀 v68이 충돌한다.
- v63과 현재 라이트 화면 16개는 배치 속성이 불일치하거나 동일 콘텐츠 상태가 아니다.
- 운영 동적 URL의 배포 SHA와 외부 채널 실발행은 미검증이다.
- 컨트롤러와 product-designer가 단일 승인 핀과 동일 콘텐츠 상태 화면을 확정한 뒤 QA가 16화면 정합과 운영 실발행을 재검증한다.

## 검증했나

- 관찰됨: localhost health HTTP 200, 기본 흐름 11/11, 네 방 4/4, 네 폭 화면 20/20, 복귀 5/5, Studio v1 14/14.
- 테스트됨: Vitest 374파일·2,414건, TypeScript 종료 0, production build 184/184, seed·RLS, 디자인 lint 위반 0.
- 근거 확인: v63 프로토타입, 요구 대장, 사업 좌표, 디자인 README, 화면 목록, 사용자 흐름, captures manifest.
- 미검증: 운영 배포 버전, 외부 채널 실발행, 단일 승인 디자인 핀 기준의 동일 상태 16화면 정합.
