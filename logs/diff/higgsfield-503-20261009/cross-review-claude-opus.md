# PR #136 교차 리뷰 (Claude Opus 5.5 code-reviewer, 2026-10-09 14:0x KST) 판정: BLOCK

1. [CRITICAL] dashboard/scripts/run-higgsfield-locked.sh:68-73 mkdir 잠금의 오래된 잠금 회수(판정→mv 사이 틈)로 두 프로세스가 동시 진입. 컨테이너 재현: 경쟁자 4개, 오래된 잠금 시작 4/20 겹침, 깨끗한 시작 1/20·3/60 겹침. 겹치면 같은 refresh token 동시 갱신으로 OD-2026-10-09-3 장애 재발. 고침: /usr/bin/flock (exec 9>"$lock_file"; flock -w "$wait" 9 || exit 75; exec "$@"), 자식은 timeout 으로 감싸 고아 무한점유 방지. owner 메타·PID 비교·회수 코드 제거. scripts/verify-higgsfield-lock.sh 를 경쟁자 4개 이상·50회 반복·겹침 0 으로. (BashFAQ/045)
2. [MAJOR] .github/workflows/deploy-marketing.yml:339,391 force 경로가 살아 있는 서버 자격증명을 백업 없이 rename 으로 덮어씀, 쓰기 후 확인 단계도 제거됨. 고침: 잠금 안에서 credentials.json.bak-<UTC>(0600) 백업 후 교체, CRED_STATE=unexpired 면 별도 2차 확인 입력 없이는 force 거절, 교체 후 계정 확인 실패 시 백업 복원.
3. [MAJOR] scripts/lib/generator-monitor-state.sh:16-23 가 종료코드 75(잠금 사용 중)와 127(옛 이미지에 wrapper 없음)을 down 으로 판정 → osmu-generator-monitor.yml:146 '로그인 만료' 경보가 'force 배포' 를 안내해 2번 파괴 경로로 연결. 고침: 75·127 은 hold, 경보 문구를 '서버 재로그인 후 새 시크릿 발급 후 force 배포' 로.
4. [MAJOR] dashboard/src/lib/higgsfield.ts:265 hfRun 전체(create 45s, get 20s, status 20s)를 잠금으로 감싸 처리량 1, 동시 상한 3 무력화, 대기 10s 후 GENERATOR_BUSY 503. studio/page.tsx:1627-1633 접수는 BUSY 에 자동 재시도 없음, 문구는 '자동으로 다시 시도' 라고 거짓. 고침: expires_at 이 5분 이상 남으면 잠금 없이 실행, 만료 임박 시에만 잠금 아래 auth token 으로 선갱신. 접수 화면 BUSY 시 지연 후 자동 재시도, 문구 정정.
5. [MINOR] deploy-marketing.yml:329 JSON.parse 실패 메시지가 시크릿 일부를 로그에 노출(Node20 실측). try/catch 고정 문구.
6. [MINOR] 배포 docker compose up 전 같은 잠금을 잡고 대기(갱신 중 CLI 강제 종료 방지), diagnose-generator.yml:174 timeout 30s 도 같은 위험.
7. [MINOR] 자격증명 파일 없을 때 stat 오류로 원인불명 종료 → 명확한 메시지.
8. [MINOR] higgsfield.ts:242 75 무조건 BUSY 해석 → 잠금 timeout 전용 코드 또는 stderr 표식.
9. [MINOR] 브랜치 결정.md 의 OD-2026-10-09-1 ID 가 main 체크아웃의 OD-2026-10-09-1(export worker)과 충돌. Higgsfield 결정은 main 의 OD-2026-10-09-3 으로 맞추고, OD-1 ②(맥 스냅샷 force 덮어쓰기)는 OD-3 로 폐기(supersede) 표기.
