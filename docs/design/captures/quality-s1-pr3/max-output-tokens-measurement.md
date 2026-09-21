# 카드 파생 output_tokens 실측 로그 (회장 리뷰 2026-09-21 MINOR9)

`llm.ts:143~150` 주석 "실측(PR3, 2026-09-21, claude -p 공유 CLI 로 이 프롬프트를 3회
실행): output_tokens 1672 / 1701 / 3816" 은 주석에만 있었고, 그 자리에서 어떤 명령으로
쟀는지·원문 로그가 어디 있는지가 레포에 없었다. 코드리뷰가 근거 없는 숫자로 지적했다
(정당하다 — 주석만으로는 재현 불가능하다).

## 정직한 현재 상태

- 3회 실측 자체는 PR3 작업 중 실제로 돌렸다(그 결과가 `resolveStudioLlmConfig` 의 clamp
  상한(8000) 판단 근거였다).
- 다만 그 실행의 원문 stdout/API 응답 로그 파일은 **그 자리에서 저장해 두지 않았다.**
  그래서 지금 "재현 가능한 로그"를 새로 만들어 내놓는 대신, **재현 가능한 방법**을
  이 디렉터리에 남긴다: `measure-max-output-tokens.sh`.
- 이 저장소·CLI 가 공유 Claude CLI 주간 한도에 걸려 있는 동안(§12 리스크에 이미 기록됨)
  은 다시 돌려 새 로그를 못 뽑는다. 한도가 풀리면 그 스크립트로 재실측하고, 이 파일에
  실제 쿼리 결과를 append 한다.

## 재현 방법

1. 카드 파생 POST(`/api/studio/v1/generations/{jobId}/derivations`, `kinds=["card"]`)를
   같은 학습 정보로 3회 보낸다.
2. `./measure-max-output-tokens.sh <workspace_id>` 로 `usage_events.meta.output_tokens`
   를 최근 3건 조회한다(스키마는 `llm.ts` `StudioLlmUsageLedger.finish()` 가 쓰는 그대로).
3. 결과를 아래 표에 append 한다(덮어쓰지 않는다 — §8 append 최신순 역순).

## 실측 기록

| 일자 | 시도 순번 | output_tokens | end_turn 여부 | 비고 |
|---|---|---|---|---|
| 2026-09-21 | 1 | 1672 | end_turn | PR3 작업 중 실측(원문 로그 미보존, 코드 주석에만 남아 있던 값) |
| 2026-09-21 | 2 | 1701 | end_turn | 상동 |
| 2026-09-21 | 3 | 3816 | end_turn | 상동 |
| (다음 실측 예정) | | | | CLI 주간 한도 리셋 후 `measure-max-output-tokens.sh` 로 재실측하고 여기 append |
