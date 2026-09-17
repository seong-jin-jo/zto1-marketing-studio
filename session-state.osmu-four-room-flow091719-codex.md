# OSMU 네 방 기본 흐름 QA v23 핸드오프

작성: 2026-09-17 19:20 KST

라인: osmu-four-room-flow091719-codex

## 무엇을 어디까지 했나

- 사용자 요청 원문을 handoff 기준으로 사용했다. canonical `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`였다.
- localhost 기본 흐름 11/11, 네 방 4/4, Studio v1 14/14를 실제 요청으로 관찰했다.
- 390 라이트·다크, 768, 1024, 1440에서 네 방 20화면과 성과실에서 생성실 복귀 5/5를 실제 링크 클릭으로 관찰했다.
- 전체 Vitest 374파일·2,416건, `npx tsc --noEmit`, 격리 production build 184/184, schema·seed·RLS, 디자인 lint를 통과했다.
- v63 성과실 원본 PNG와 dev 1440 성과실 PNG를 원본 해상도로 각각 열어 대조했다. v63은 결론 카드와 비교 막대 중심이고 dev는 단계 머리, 연결 안내, 표본 부족 상태 중심이라 디자인 NG를 유지했다.
- 제품 소스는 수정하지 않았다. QA 보고서와 증거 커밋은 `8bd06a5f`다.
- 정본 보고서는 `docs/qa/osmu-four-room-basic-flow-v23-gpt-codex.md`, 원본 증거는 `logs/diff/osmu-four-room-flow-20260917-v23/`다.

## 남은 이슈·블로커

- 과제 기준 v63과 canonical 승인 디자인 핀 v68이 충돌한다.
- v63과 현재 라이트 화면 16개는 배치 속성이 불일치하거나 동일 콘텐츠 상태가 아니다.
- 운영 동적 URL의 배포 SHA와 외부 채널 실발행은 미검증이다.
- `verify-agent-quality.sh`는 운영 host 접촉 증거 0건으로 로컬 QA 출고를 반려했다.
- 현재 bg-agents에 보이는 code-builder, tech-architect, eng-design-reviewer는 이 QA 세션이 띄운 위임이 아니라 다른 osmu 트랙 작업이다. 결과를 회수하거나 등록을 해제하지 않는다.

## 다음에 칠 명령

단일 승인 디자인 핀이 확정되고 stage 또는 운영 배포 SHA가 나온 뒤 아래 순서로 재검증한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
node scripts/verify-basic-flow-e2e.mjs
node scripts/probe-four-room-flow.mjs
node scripts/verify-studio-v1-e2e.mjs
npm run test
npx tsc --noEmit
```

종료 증거는 단일 디자인 기준에 대한 동일 콘텐츠 상태 16화면 정합 PASS, stage 또는 운영 health 응답의 배포 SHA, 외부 발행이 승인된 경우 실제 permalink다.

## 검증했나

- 관찰됨: localhost health HTTP 200, DB up, 기본 흐름 11/11, 네 방 4/4, 네 폭 화면 20/20, 복귀 5/5, Studio v1 14/14.
- 테스트됨: Vitest 374파일·2,416건, TypeScript 종료 0, production build 184/184, schema·seed·RLS, 디자인 lint 위반 0.
- 근거 확인: v63 프로토타입, 요구 대장, 사업 좌표, 디자인 README, 화면 목록, 사용자 흐름, captures manifest, v63과 dev 1440 성과실 원본 PNG 두 장.
- 미검증: 운영 배포 버전, 외부 채널 실발행, 단일 승인 디자인 핀 기준의 동일 상태 16화면 정합.
