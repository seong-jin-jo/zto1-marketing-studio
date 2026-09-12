# OSMU 최근 24시간 코드 리뷰 메인 핸드오프

## 무엇을 어디까지 했나

- 대상 범위를 `8652fb5b29fecad7aa688b99ad1c2bab534d2fc4..39d32c58510565df52f330d01c0ac0d96cb0256d`로 고정해 47개 커밋과 185개 파일을 검토했다.
- 승인 프로토타입 v63, pipeline 승인 핀, DESIGN.md, 회장 확정 요구 대장, OSMU 사업 좌표, 결정·실수 원장을 읽고 대조했다.
- 제품 코드는 수정하지 않았다. MAJOR 23건, MINOR 5건으로 `REVIEW_VERDICT: BLOCK`을 기록했다.
- 리뷰 문서: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md`
- QA 원장과 공용 인계 기록까지 커밋했다. 커밋은 `b8eb120d`, `c0d72ade`다.

## 남은 이슈·블로커

- 실제 Compose가 빌드하는 queue 복제본에 claim 안전장치가 없고, 취소와 외부 공급자 호출 사이가 원자적이지 않다.
- 부분 실패를 성공으로 보이는 API와 UI, 공급자 batch 한도 밖 성과의 영구 실패 오분류가 남아 있다.
- 예약 취소 고객 경로가 proxy allowlist에서 빠졌고, 무료 글자 카드와 image-purpose 토큰의 편집·발행·만료 복구가 단절됐다.
- 승인 v63의 학습 화면 구조와 근거 표시 및 버튼 문구가 구현과 다르다.
- 별도 code-builder 위임이 같은 리뷰 문서의 지적을 수정 중이다. 이 핸드오프는 그 작업 결과를 완료로 간주하지 않는다.

## 다음에 칠 명령

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
git show --stat c0d72ade
sed -n '1,180p' docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md
cd dashboard
npm run test
npx tsc --noEmit
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

수정 후에는 실제 Compose 이미지의 queue 도구, 취소와 공급자 호출 경합, 부분 실패 응답, 101건과 51건 성과 경계, 만료 image-purpose 토큰을 각각 재현해야 한다.

## 검증했나

- localhost:3456에서 지정 작업 공간의 health, metrics, learned-rules, queue가 HTTP 200인 것을 관찰했다.
- 현재 공유 작업 트리에서 Vitest 311파일 2,077건 통과와 3건 스킵, TypeScript 통과, 기본 흐름 11/11, Studio v1 14/14를 확인했다.
- 위 검증은 후속 미커밋 수정이 섞인 공유 작업 트리 기준이며 리뷰 대상 커밋의 결함 해소 증거가 아니다.
- 돈 경계 fixture 정규식 단절과 Higgsfield 페이지 객체 파싱 실패를 직접 재현했다.
- 운영 배포와 외부 채널 실발행은 미검증이다.
