# Agent Handoff Rules

This repository is shared by Claude, Codex, and human operators. Treat the
repository files as the durable handoff layer between sessions.

## Start / Resume / Take Over

1. Read `CLAUDE.md`.
2. Read `wiki/ops/session-state.md`.
3. Check `git status --short --untracked-files=no` and the relevant diffs.
4. Before starting or continuing a non-trivial task, check whether an existing
   tmux pane for this repo/task could be a live handoff source:
   `tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} active=#{pane_active} current=#{pane_current_command} cwd=#{pane_current_path} title=#{pane_title}'`
   then `tmux capture-pane -p -t <target-pane> -S -160`.
   If both tmux pane context and `wiki/ops/session-state.md` are possible, or
   the correct basis is unclear, ask the user which handoff source to follow
   before proceeding. Do not choose the basis by inference unless the user
   explicitly names it or only one source is available.
5. When working under a subdirectory, read any local `AGENTS.md` or `CLAUDE.md`
   there before editing.

## During Work

- Do not revert unrelated user changes.
- Keep edits scoped to the requested task and existing project patterns.
- Keep `wiki/ops/session-state.md` current enough that another agent can resume
  within 30 seconds even if control transfers mid-task.
- Update `wiki/ops/session-state.md` at every handoff boundary: before stopping,
  before switching to a new task, after materially changing direction, after a
  meaningful implementation chunk, and whenever you have created uncommitted
  changes that another agent may need to interpret.
- When Codex/Claude continues from tmux or from `session-state.md`, record the
  user-confirmed handoff basis, the pane id inspected if any, and the interpreted
  next action in `wiki/ops/session-state.md`.
- If implementation changes behavior, update the relevant `wiki/` page.

## Before Reporting Done

1. Run the relevant test, build, or E2E command for the touched surface.
2. Record verification, blockers, deployment status, and next steps in
   `wiki/ops/session-state.md`.
3. If handing control back to an existing tmux Claude/Codex session, make sure
   `wiki/ops/session-state.md` is sufficient for that session to resume without
   relying on this chat transcript.
4. If you started a fresh task in Codex and Claude may later continue it, record
   the current task, files touched, tests run or still needed, and the exact next
   action before reporting.
5. Report what changed, what was verified, and anything still blocked.

## 그로스 레인

이 벤처의 마케팅은 5칸 레인으로 돈다: 전략 → 우선순위 → 자산·계측 준비 → 발주·제작 → 검수·집행.
판독은 레인 밖(회고)이다. 절차 = `/growth-lane` · 규격 = `~/.claude/standards/growth-loop.md` §7.2
산출물 = `docs/growth/campaigns/<스프린트>/01~06.md` (**브랜치 말고 main**. 대시보드가 작업 트리를 읽는다)
진행 판정 = frontmatter `status` (파일 존재는 완료가 아니다, §7.2.1)
그로스 진행을 `pipeline-state` 에 적지 마라(§7.9). 게이트 파일 = `growth-state.<스프린트>.md`, 서사 = `session-state.growth.md`.
이 벤처의 특이점: 4칸 "외주"는 OpenClaw 크론, 즉 제품 자체다(도그푸딩). 캠페인 컨셉 = 메타 데모(회장 2026-09-16).

