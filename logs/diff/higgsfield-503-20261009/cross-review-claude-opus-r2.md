# PR #136 재리뷰 (Claude Opus 5.5, HEAD 7bf14b29) 판정: BLOCK. 1차 9건 중 7 해소, 2 부분.

1. [CRITICAL] deploy-marketing.yml:496-504 기동 단계에서 러너(비root, sudo 없음)가 root 0700 으로 바뀐(:281-282) ~/.config/higgsfield 아래 mkdir/exec 9> 를 직접 실행 → Permission denied, set -e 로 osmu 포함 배포 매번 중단. 고침 선택: (1) 잠금을 컨테이너 안에서 잡기(docker run -d --name hf-lock-holder -v "$CRED_DIR:/c" <이미지> flock /c/.cli.lock.d/lock sleep 300 → 획득 확인 → compose up → docker rm -f) 권장, 또는 (2) root:<러너gid> 0770 + 잠금파일 0660 (이 경우 OD-3 문구도 수정). CI 계약 테스트에 '비root 러너로 기동 단계' 케이스 추가.
2. [MAJOR-A] higgsfield.ts:57,80,99-117,309-313 만료 5분 기준 vs CLI 1.1.26 실제 갱신 기준 약 60~90초(실측). 61~300초 구간에서 잠금 안 auth token 은 갱신 안 하고, 잠금 밖 실제 명령이 60초 경계 넘으면 잠금 밖 회전 → 이중 사용. 고침: 잠금 안 auth token 뒤 만료 재확인, 여전히 5분 이내면 실제 명령도 잠금 아래 실행(또는 잠금 안 강제 갱신). '잠금 단계가 갱신 안 한 경우' 경계 테스트 추가.
3. [MAJOR-B] scripts/verify-higgsfield-lock.sh:38 임계구역 10ms 는 docker exec 간격보다 짧아 잠금 없이도 겹침 0. 맥 Docker Desktop bind mount 에선 flock 비배타(60/60 겹침), 컨테이너 내부 경로 0/60. report.md:108 '겹침 0 관찰' 을 미검증으로 내리고, 임계구역 0.5초 이상, contender exit 90 을 set -e wait 가 삼키는 문제 수정, 운영과 같은 리눅스 셀프호스트 러너에서 재증거.
4. [MINOR-1] deploy-marketing.yml:429 access 만료·refresh 생존 상태에서 2차 확인 없이 force 진행. 백업 credentials.json.bak-* 보존·정리 규칙 없음.
5. [MINOR-2] generator-monitor-state.sh:22-30 75·127 무한 hold 가능(ADR-007 조용한 실패 금지). N회 연속 hold 시 별도 경보.
