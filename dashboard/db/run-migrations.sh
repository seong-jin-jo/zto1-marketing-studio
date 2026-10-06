#!/usr/bin/env bash
# Explicit OSMU schema migration runner. Historical SQL glob replay is forbidden.
set -euo pipefail

DB_URL_INPUT="${OSMU_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$DB_URL_INPUT" ]; then
  echo "ERROR: OSMU_DATABASE_URL or DATABASE_URL is required" >&2
  exit 2
fi

# Parse the standard PostgreSQL URI into libpq environment fields so the
# credential-bearing URI never appears in psql process argv.
parse_database_url() {
  local raw="${1#*://}" credentials host_path host_port db_query query user_encoded password_encoded
  credentials="${raw%%@*}"
  host_path="${raw#*@}"
  host_port="${host_path%%/*}"
  db_query="${host_path#*/}"
  query="${db_query#*\?}"
  user_encoded="${credentials%%:*}"
  password_encoded="${credentials#*:}"
  export PGUSER="$(printf '%b' "${user_encoded//%/\\x}")"
  export PGPASSWORD="$(printf '%b' "${password_encoded//%/\\x}")"
  export PGHOST="${host_port%:*}"
  export PGPORT="${host_port##*:}"
  export PGDATABASE="${db_query%%\?*}"
  if [ "$query" != "$db_query" ] && [[ "$query" =~ (^|&)sslmode=([^&]+) ]]; then
    export PGSSLMODE="${BASH_REMATCH[2]}"
  fi
}
parse_database_url "$DB_URL_INPUT"
unset OSMU_DATABASE_URL DATABASE_URL DB_URL_INPUT
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql is required" >&2
  exit 2
fi

DB_DIR="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="$DB_DIR/migration-manifest.tsv"
PHASE="${1:-preflight}"
RUNNER_COMMIT="${GITHUB_SHA:-${RUNNER_COMMIT:-0000000000000000000000000000000000000000}}"
if ! [[ "$RUNNER_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: RUNNER_COMMIT must be a 40-character git SHA" >&2
  exit 2
fi

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

fingerprint() {
  psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
WITH expected AS (
  SELECT
    to_regclass('public.studio_generation_idempotency') AS generation_table,
    to_regclass('public.studio_free_regeneration_uses') AS quota_table
), flags AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid=expected.generation_table
        AND c.conname='uq_studio_generation_idempotency_tenant_member_operation_key'
        AND pg_catalog.pg_get_constraintdef(c.oid)='UNIQUE (tenant_id, member_id, operation, idempotency_key)'
        AND i.indisunique AND i.indisvalid AND i.indisready
    ) AS gt,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid=expected.generation_table
        AND c.conname='uq_studio_generation_idempotency_member_operation_key'
        AND pg_catalog.pg_get_constraintdef(c.oid)='UNIQUE (member_id, operation, idempotency_key)'
        AND i.indisunique AND i.indisvalid AND i.indisready
    ) AS gm,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid=expected.quota_table
        AND c.conname='uq_studio_free_regeneration_tenant_member_date'
        AND pg_catalog.pg_get_constraintdef(c.oid)='UNIQUE (tenant_id, member_id, local_date)'
        AND i.indisunique AND i.indisvalid AND i.indisready
    ) AS qt,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid=expected.quota_table
        AND c.conname='uq_studio_free_regeneration_member_date'
        AND pg_catalog.pg_get_constraintdef(c.oid)='UNIQUE (member_id, local_date)'
        AND i.indisunique AND i.indisvalid AND i.indisready
    ) AS qm,
    expected.generation_table IS NULL AS generation_missing,
    expected.quota_table IS NULL AS quota_missing,
    (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid=expected.generation_table
        AND conname IN ('uq_studio_generation_idempotency_tenant_member_operation_key','uq_studio_generation_idempotency_member_operation_key')) AS generation_named,
    (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid=expected.quota_table
        AND conname IN ('uq_studio_free_regeneration_tenant_member_date','uq_studio_free_regeneration_member_date')) AS quota_named
  FROM expected
)
SELECT
  CASE
    WHEN generation_missing THEN 'MISSING'
    WHEN generation_named <> gt::int + gm::int THEN 'X'
    WHEN gt AND NOT gm THEN 'S1' WHEN gt AND gm THEN 'S2' WHEN NOT gt AND gm THEN 'S3' ELSE 'X'
  END || '|' ||
  CASE
    WHEN quota_missing THEN 'MISSING'
    WHEN quota_named <> qt::int + qm::int THEN 'X'
    WHEN qt AND NOT qm THEN 'S1' WHEN qt AND qm THEN 'S2' WHEN NOT qt AND qm THEN 'S3' ELSE 'X'
  END
FROM flags;
SQL
}

# 앱이 실제로 지원하는 축별 상태 집합.
#
# 앱은 studio_generation_idempotency / studio_free_regeneration_uses 에 제약 이름을
# 지정하지 않고 ON CONFLICT DO NOTHING 뒤 재조회로 동작한다
# (dashboard/src/lib/studio/generation/repository.ts). 따라서 강제 객체가
# tenant UNIQUE(S1)이든, tenant+member 둘 다(S2)든, member UNIQUE(S3)든 동일하게 동작한다.
# 두 축이 서로 다른 단계에 있는 것(예: S1|S2)은 expand 와 contract 를 축별로 나눠 진행하는
# 이 절차의 정상 중간 상태이지, 앱 비호환 상태가 아니다.
#
# 실제 데이터 안전은 아래 두 가지가 지킨다. 둘 다 fail-closed 로 유지한다.
#   assert_compatibility_ready : 회원 전역 멱등과 무료 몫이 UNIQUE 또는 guard 로 강제되는가
#   assert_no_duplicates       : 회원 범위 중복이 실제로 0인가
# X 는 이름은 있는데 정의나 유효성이 어긋난 상태이므로 계속 거절한다.
SUPPORTED_AXIS_STATES="S1 S2 S3"

axis_supported() {
  local axis="$1" candidate
  for candidate in $SUPPORTED_AXIS_STATES; do
    [ "$axis" = "$candidate" ] && return 0
  done
  return 1
}

# assert_fingerprint [정확히 일치해야 하는 값]
# 인자를 주면 그 값과 정확히 일치해야 한다(단계 사후 검증용).
# 인자가 없으면 두 축이 각각 지원 집합 안에 있기만 하면 된다.
assert_fingerprint() {
  local value expected="${1:-}"
  value="$(fingerprint)"
  if [ -n "$expected" ]; then
    if [ "$value" != "$expected" ]; then
      echo "ERROR: schema fingerprint $value does not match the required $expected" >&2
      exit 3
    fi
    echo "schema_fingerprint=$value"
    return 0
  fi
  if ! axis_supported "${value%%|*}" || ! axis_supported "${value##*|}"; then
    echo "ERROR: unsupported generation/quota schema fingerprint: $value (supported per axis: $SUPPORTED_AXIS_STATES)" >&2
    exit 3
  fi
  echo "schema_fingerprint=$value"
}

# 복구 단계(baseline, apply-legacy, expand-fk)는 아직 제약이 없거나 표 자체가 없는
# 구형 DB에서 시작할 수 있다. 그 단계에서는 관측만 하고 막지 않는다.
report_fingerprint() {
  echo "schema_fingerprint=$(fingerprint)"
}

duplicate_counts() {
  if [ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT (to_regclass('public.studio_generation_idempotency') IS NULL OR to_regclass('public.studio_free_regeneration_uses') IS NULL)::text")" = "t" ]; then
    echo "MISSING|MISSING|MISSING"
    return 0
  fi
  psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT
  (SELECT count(*) FROM (
    SELECT 1 FROM public.studio_generation_idempotency
    GROUP BY member_id,operation,idempotency_key HAVING count(*) > 1
  ) AS generation_duplicates)::text || '|' ||
  (SELECT count(*) FROM (
    SELECT 1 FROM public.studio_free_regeneration_uses
    GROUP BY member_id,local_date HAVING count(*) > 1
  ) AS quota_duplicates)::text || '|' ||
  (SELECT count(*) FROM (
    SELECT 1 FROM public.studio_generation_idempotency
    GROUP BY member_id,operation,idempotency_key
    HAVING count(DISTINCT request_hash) > 1
  ) AS request_hash_divergence)::text;
SQL
}

assert_no_duplicates() {
  local counts
  counts="$(duplicate_counts)"
  if [ "$counts" != "0|0|0" ]; then
    echo "ERROR: member-scope duplicate audit failed: $counts" >&2
    exit 3
  fi
  echo "duplicate_groups=$counts"
}

compatibility_readiness() {
  if [ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT (to_regclass('public.studio_generation_idempotency') IS NULL OR to_regclass('public.studio_free_regeneration_uses') IS NULL)::text")" = "t" ]; then
    echo "MISSING|MISSING"
    return 0
  fi
  psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
WITH flags AS (
  SELECT
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='public.studio_generation_idempotency'::regclass
        AND conname='uq_studio_generation_idempotency_member_operation_key'
    ) AS generation_member_unique,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='public.studio_free_regeneration_uses'::regclass
        AND conname='uq_studio_free_regeneration_member_date'
    ) AS quota_member_unique,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='public.studio_generation_idempotency'::regclass
        AND tgname='trg_studio_generation_member_guard'
        AND tgenabled <> 'D'
    ) AS generation_guard,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger
      WHERE tgrelid='public.studio_free_regeneration_uses'::regclass
        AND tgname='trg_studio_free_regeneration_member_guard'
        AND tgenabled <> 'D'
    ) AS quota_guard
)
SELECT
  (generation_member_unique OR generation_guard)::text || '|' ||
  (quota_member_unique OR quota_guard)::text
FROM flags;
SQL
}

assert_compatibility_ready() {
  local readiness
  readiness="$(compatibility_readiness)"
  if [ "$readiness" != "true|true" ]; then
    echo "ERROR: compatibility app requires member UNIQUE or enabled E1 guard for generation and quota; readiness=$readiness" >&2
    exit 3
  fi
  echo "compatibility_ready=$readiness"
}

# 배포 preflight 가 요구하는 것과 확장 단계가 요구하는 것은 다르다.
#
# assert_compatibility_ready(true|true) 는 "회원 전역 멱등이 이미 강제된 상태"를 요구한다.
# 그것은 expand-member 를 끝낸 뒤의 목표 상태이지, 배포의 전제가 아니다. 이 둘을 같은
# 것으로 묶어 두면 배포가 스스로를 막는다. 배포 preflight 가 S1 을 거절하고, 그 배포가
# 붙이는 revision 라벨이 없어서 expand-member 도 못 돌고, 그래서 S1 이 영원히 유지된다.
# 2026-08-29 운영에서 실제로 이 순환이 발생했다(readiness=false|true 로 이틀간 정상 가동 중).
#
# 배포가 실제로 요구하는 안전 불변식은 이것 하나다.
#   "멱등 장부와 무료 몫 장부가 최소한 (tenant_id, member_id, ...) 범위에서
#    유효한 UNIQUE 로 강제되고 있고, 실제 중복이 0 이다."
#
# 앱의 읽기 경로가 정확히 그 범위이기 때문이다. repository.ts 의 selectExisting 은
#   WHERE tenant_id = :workspace AND member_id = :member AND operation AND idempotency_key
# 로 조회한다. 따라서 S1(tenant+member UNIQUE)에서 앱은 자기 읽기 범위와 완전히 일치한다.
# 다른 회원이나 다른 작업 공간의 응답이 새어 나오는 경로는 없다.
#
# S1 에서 아직 닫히지 않은 것은 "한 회원이 두 작업 공간에 걸쳐 무료 몫을 두 번 쓸 수 있다"는
# 사업 규칙의 빈틈이며, 데이터 파손이 아니다. 그 빈틈을 닫는 것이 expand-member 이고,
# 그 빈틈은 이 절차가 시작되기 전부터 운영에 있던 상태다. 배포를 막는다고 닫히지 않는다.
#
# 그러므로 여기서는 축별 상태가 지원 집합(S1/S2/S3) 안에 있는지만 fail-closed 로 본다.
# MISSING(표 없음)과 X(정의가 어긋난 제약)는 계속 거절한다. 중복 0 검사와 RLS 감사도
# preflight 에 그대로 남아 있어서 게이트가 얇아지지 않는다.
# 같은 지문이라도 오는 길이 다르다.
#
# 아직 올라가지 않은 S1 은 정상 중간 상태다. 그러나 한 번 올라갔던 강제 객체가
# 사라져서 생긴 S1 은 다른 이야기다. 그것은 누군가 제약을 지웠다는 뜻이고,
# 장부가 "적용됨"이라고 말하는 것과 실제 스키마가 어긋났다는 뜻이다.
# 장부와 스키마의 불일치는 이 게이트 체계가 존재하는 이유 그 자체다
# (같은 계열: verify_entry 의 ledger checksum mismatch).
#
# 그 둘을 가르는 근거가 장부에 있다. 운영 장부에는 20260829_030 이 없다(아직 안 올라감).
# 확장을 끝낸 DB 에는 applied 로 있다. 그러므로 "장부가 적용했다고 말한 단계가 만든
# 물건이 지금도 있는가"를 물으면 두 상태가 정확히 갈린다.
ledger_state() {
  psql -X -qAt -v ON_ERROR_STOP=1 -v id="$1" <<'SQL'
SELECT COALESCE(
  (SELECT state FROM public.osmu_schema_migrations WHERE migration_id=:'id'),
  'absent');
SQL
}

ledger_applied() {
  local state
  state="$(ledger_state "$1")"
  [ "$state" = "applied" ] || [ "$state" = "baselined" ]
}

# 축이 회원 전역 UNIQUE 를 가지고 있는가. S2 는 tenant 와 member 가 공존하는 확장 중간,
# S3 는 tenant 를 걷어낸 뒤다. 어느 쪽이든 회원 전역 UNIQUE 는 있다.
axis_has_member_unique() { [ "$1" = "S2" ] || [ "$1" = "S3" ]; }

# 확장 단계가 만든 강제 객체가 그 뒤로도 남아 있는지 본다. 되돌림 감지 전용이다.
# 앞으로 가는 단계는 어느 것도 회원 전역 UNIQUE 를 걷어내지 않는다. contract 단계가
# 걷어내는 것은 tenant 범위 제약이다. 그러므로 20260829_030 이 적용된 뒤 회원 전역
# UNIQUE 가 없다면 그것은 절차 밖에서 지워진 것이다.
# 방어 장치는 예외가 하나 있다. 20260905_010_guard_cleanup 이 정당하게 걷어낸다.
assert_ledger_monotonic() {
  local value generation quota checked=0
  value="$(fingerprint)"
  generation="${value%%|*}"
  quota="${value##*|}"

  if ledger_applied "20260829_030_member_unique_expand"; then
    checked=$((checked + 1))
    if ! axis_has_member_unique "$generation" || ! axis_has_member_unique "$quota"; then
      echo "ERROR: ledger says 20260829_030_member_unique_expand is applied but the member-global UNIQUE it created is gone; fingerprint=$value" >&2
      echo "HINT: this is a regression, not a pre-expansion state. Recover the constraint or correct the ledger before deploying." >&2
      exit 3
    fi
  fi

  # 방어 장치(guard 트리거)에는 같은 규칙을 걸지 않는다. 근거가 있다.
  # 20260829_020_generation_guard_expand.sql:104-115 는 회원 전역 UNIQUE 가 "없을 때만"
  # 트리거를 만든다. 즉 방어 장치는 UNIQUE 의 조건부 대체물이라 "적용됨"이 "존재함"을
  # 함의하지 않는다. 없는 것이 정상인 경우가 있으므로 되돌림 판정 근거가 될 수 없다.
  # 방어 장치가 지키던 것(회원 범위 중복)은 assert_no_duplicates 가 직접 센다.
  echo "ledger_monotonic=ok ($checked applied-stage checks)"
}

assert_deploy_compatible() {
  local value generation quota readiness
  value="$(fingerprint)"
  generation="${value%%|*}"
  quota="${value##*|}"
  if ! axis_supported "$generation" || ! axis_supported "$quota"; then
    echo "ERROR: deploy requires a valid tenant+member scoped UNIQUE on both ledgers; fingerprint=$value" >&2
    exit 3
  fi
  # 지원 집합 검사만으로는 "아직 안 올라간 S1"과 "올라갔다가 내려간 S1"을 못 가른다.
  # 되돌림은 장부로 잡는다.
  assert_ledger_monotonic
  readiness="$(compatibility_readiness)"
  echo "deploy_compatible=$value member_global_readiness=$readiness"
  if [ "$readiness" != "true|true" ]; then
    echo "note: member-global enforcement is still expanding (readiness=$readiness). The app reads tenant+member scoped, so this transitional state is supported. Run expand-member to close it."
  fi
}

# 앱이 실제로 읽고 쓰는 필수 relation 과 테넌트 격리 상태를 한 번에 관측한다.
# 정본은 dashboard/db/rls.sql 의 테넌트 스코프 목록이다. 여기서 벗어난 표가 생기면
# 이 목록도 함께 고쳐야 한다.
RUNTIME_REQUIRED_TENANT_TABLES="brand_guides integrations channel_accounts drafts studio_generation_jobs studio_generation_idempotency studio_free_regeneration_uses studio_generation_candidate_rejections shorts_factory_runs shorts_factory_concept_runs published_posts engagement_items operational_incidents queue_posts schedules growth_metrics viral_signals wiki_docs usage_events subscriptions usage_quotas"

runtime_schema_report() {
  local list
  list="$(printf '%s' "$RUNTIME_REQUIRED_TENANT_TABLES" | tr ' ' '\n' | sed "s/^/('/;s/$/')/" | paste -sd, -)"
  psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
WITH required(name) AS (VALUES $list)
SELECT required.name || ' ' ||
  CASE
    WHEN c.oid IS NULL THEN 'missing-relation'
    WHEN NOT c.relrowsecurity THEN 'rls-disabled'
    WHEN NOT c.relforcerowsecurity THEN 'rls-not-forced'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_iso'
    ) THEN 'tenant-iso-policy-missing'
    ELSE 'ok'
  END
FROM required
LEFT JOIN pg_catalog.pg_class c
  ON c.oid = to_regclass('public.' || required.name)
ORDER BY required.name;
SQL
}

# 앱 role 이 RLS 를 우회하면 위의 정책은 장식일 뿐이다.
service_role_report() {
  psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='osmu_service') THEN 'osmu_service missing-role'
  WHEN (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='osmu_service') THEN 'osmu_service bypasses-rls'
  ELSE 'osmu_service ok'
END;
SQL
}

assert_runtime_schema() {
  local report failures
  report="$(runtime_schema_report; service_role_report)"
  failures="$(printf '%s\n' "$report" | grep -v ' ok$' || true)"
  if [ -n "$failures" ]; then
    echo "ERROR: runtime schema audit failed" >&2
    printf '%s\n' "$failures" >&2
    exit 3
  fi
  echo "runtime_schema=ok ($(printf '%s\n' "$report" | grep -c . ) checks)"
}

ensure_ledger() {
  psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.osmu_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  sha256 CHAR(64) NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('baseline','expand','contract','cleanup')),
  state TEXT NOT NULL CHECK (state IN ('baselined','running','applied','failed')),
  runner_commit CHAR(40) NOT NULL,
  started_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
REVOKE ALL ON public.osmu_schema_migrations FROM PUBLIC;
DO $revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='osmu_service') THEN
    REVOKE ALL ON public.osmu_schema_migrations FROM osmu_service;
  END IF;
END
$revoke$;
SQL
}

manifest_entry() {
  awk -F '\t' -v wanted="$1" '$1 !~ /^#/ && $2 == wanted { print; found=1 } END { if (!found) exit 1 }' "$MANIFEST"
}

require_applied() {
  local migration_id="$1" state
  state="$(psql -X -qAt -v ON_ERROR_STOP=1 -v id="$migration_id" <<'SQL'
SELECT state FROM public.osmu_schema_migrations WHERE migration_id=:'id';
SQL
)"
  if [ "$state" != "applied" ] && [ "$state" != "baselined" ]; then
    echo "ERROR: prerequisite migration $migration_id is not applied" >&2
    exit 5
  fi
}

require_verified_app() {
  if ! [[ "${VERIFIED_APP_IMAGE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || ! [[ "${VERIFIED_APP_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "ERROR: phase requires an observed running app image digest and commit" >&2
    exit 5
  fi
}

validate_rollback_manifest() {
  local path="${ROLLBACK_MANIFEST_PATH:-}" expected="${ROLLBACK_MANIFEST_SHA256:-}" actual
  if [ ! -f "$path" ] || ! [[ "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    echo "ERROR: contract and cleanup require a checksummed rollback manifest" >&2
    exit 5
  fi
  actual="$(checksum "$path")"
  if [ "$actual" != "$expected" ] || grep -q 'pending' "$path"; then
    echo "ERROR: rollback manifest checksum mismatch or pending value" >&2
    exit 5
  fi
  grep -q "${VERIFIED_APP_IMAGE_DIGEST}" "$path" \
    && grep -q "${VERIFIED_APP_COMMIT}" "$path" \
    || { echo "ERROR: rollback manifest does not match the observed app" >&2; exit 5; }
  grep -Eq '"generation"[[:space:]]*:[[:space:]]*0' "$path" \
    && grep -Eq '"quota"[[:space:]]*:[[:space:]]*0' "$path" \
    || { echo "ERROR: rollback manifest duplicate audit is not zero" >&2; exit 5; }
}

validate_cleanup_deadline() {
  local deadline allowed
  deadline="$(sed -nE 's/.*"rollback_deadline_utc"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$ROLLBACK_MANIFEST_PATH")"
  [ -n "$deadline" ] || { echo "ERROR: rollback deadline missing" >&2; exit 5; }
  allowed="$(psql -X -qAt -v ON_ERROR_STOP=1 -v deadline="$deadline" <<'SQL'
SELECT (now() >= :'deadline'::timestamptz)::text;
SQL
)"
  [ "$allowed" = "true" ] || { echo "ERROR: cleanup is forbidden before rollback deadline" >&2; exit 5; }
}

verify_entry() {
  local id="$1" file="$2" expected="$3" actual
  actual="$(checksum "$DB_DIR/$file")"
  if [ "$actual" != "$expected" ]; then
    echo "ERROR: manifest checksum mismatch for $id" >&2
    exit 4
  fi
  local recorded recorded_state
  recorded="$(psql -X -qAt -v ON_ERROR_STOP=1 -v id="$id" <<'SQL'
SELECT sha256 FROM public.osmu_schema_migrations WHERE migration_id=:'id';
SQL
)"
  recorded_state="$(psql -X -qAt -v ON_ERROR_STOP=1 -v id="$id" <<'SQL'
SELECT state FROM public.osmu_schema_migrations WHERE migration_id=:'id';
SQL
)"
  if [ -n "$recorded" ] && [ "$recorded" != "$expected" ]; then
    # 적용된 기록의 체크섬이 달라졌다면 실제 스키마와 장부가 어긋난 것이므로 계속 거절한다.
    # 반대로 failed 기록은 스키마를 바꾸지 못한 시도의 흔적이다. 그 시도의 체크섬 때문에
    # 고쳐진 migration 이 영원히 못 돌면 재진입 경로가 사라진다(코드리뷰 run-migrations.sh:415).
    if [ "$recorded_state" != "failed" ]; then
      echo "ERROR: ledger checksum mismatch for $id (state=$recorded_state)" >&2
      exit 4
    fi
    echo "ledger_supersede=$id previous_state=failed previous_sha256=$recorded new_sha256=$expected"
  fi
}

adopt_baseline() {
  local row id phase file expected
  row="$(manifest_entry baseline)"
  IFS=$'\t' read -r id phase file expected <<<"$row"
  verify_entry "$id" "$file" "$expected"
  psql -X -q -v ON_ERROR_STOP=1 \
    -v id="$id" -v sha="$expected" -v commit="$RUNNER_COMMIT" <<'SQL'
INSERT INTO public.osmu_schema_migrations
  (migration_id, sha256, phase, state, runner_commit, started_at, applied_at, details)
VALUES
  (:'id', :'sha', 'baseline', 'baselined', :'commit', now(), now(), '{"historical_sql_executed":false}'::jsonb)
ON CONFLICT (migration_id) DO NOTHING;
SQL
}

apply_legacy_manifest() {
  local id phase file expected state begin_count commit_count body_tmp transaction_tmp
  while IFS=$'\t' read -r id phase file expected; do
    [ "$phase" = "legacy" ] || continue
    verify_entry "$id" "$file" "$expected"
    state="$(psql -X -qAt -v ON_ERROR_STOP=1 -v id="$id" <<'SQL'
SELECT state FROM public.osmu_schema_migrations WHERE migration_id=:'id';
SQL
)"
    if [ "$state" = "applied" ]; then
      echo "legacy_migration=$id state=applied action=checksum-only"
      continue
    fi
    begin_count="$(grep -c '^BEGIN;$' "$DB_DIR/$file" || true)"
    commit_count="$(grep -c '^COMMIT;$' "$DB_DIR/$file" || true)"
    if [ "$begin_count" != "1" ] || [ "$commit_count" != "1" ]; then
      echo "ERROR: legacy migration $id must contain exactly one top-level BEGIN/COMMIT pair" >&2
      exit 4
    fi
    body_tmp="$(mktemp)"
    transaction_tmp="$(mktemp)"
    sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' "$DB_DIR/$file" >"$body_tmp"
    {
      echo '\set ON_ERROR_STOP on'
      echo 'BEGIN;'
      printf "\\i '%s'\n" "$body_tmp"
      if [ "${OSMU_TEST_FAIL_AFTER_LEGACY_ID:-}" = "$id" ]; then
        echo 'SELECT 1/0;'
      fi
      cat <<'SQL'
INSERT INTO public.osmu_schema_migrations
  (migration_id,sha256,phase,state,runner_commit,started_at,applied_at,details)
VALUES (:'id',:'sha','baseline','applied',:'commit',now(),now(),'{"explicit_historical_apply":true,"atomic_with_ledger":true}'::jsonb)
ON CONFLICT (migration_id) DO UPDATE
SET state='applied',runner_commit=EXCLUDED.runner_commit,applied_at=now(),details=EXCLUDED.details;
COMMIT;
SQL
    } >"$transaction_tmp"
    if ! psql -X -q -v ON_ERROR_STOP=1 \
      -v id="$id" -v sha="$expected" -v commit="$RUNNER_COMMIT" -f "$transaction_tmp"; then
      rm -f "$body_tmp" "$transaction_tmp"
      echo "ERROR: legacy migration $id and ledger transaction rolled back" >&2
      exit 6
    fi
    rm -f "$body_tmp" "$transaction_tmp"
  done <"$MANIFEST"
}

assert_exact_rollback_indexes() {
  psql -X -q -v ON_ERROR_STOP=1 -f "$DB_DIR/verify-rollback-indexes.sql"
  echo "rollback_indexes=exact-valid-ready"
}

apply_phase() {
  local wanted="$1" row id manifest_phase file expected ledger_phase tmp
  row="$(manifest_entry "$wanted")"
  IFS=$'\t' read -r id manifest_phase file expected <<<"$row"
  case "$manifest_phase" in
    expand-fk|expand-guard|expand-member|prepare-rollback|expand-export-queue) ledger_phase="expand" ;;
    contract-generation|contract-quota) ledger_phase="contract" ;;
    cleanup) ledger_phase="cleanup" ;;
    *) echo "ERROR: phase $manifest_phase is not executable" >&2; exit 2 ;;
  esac
  verify_entry "$id" "$file" "$expected"

  case "$manifest_phase" in
    expand-fk)
      require_applied "20260828_020_engagement_items"
      require_applied "20260828_030_operational_incidents"
      require_applied "20260828_040_shorts_factory_runs"
      require_applied "20260828_050_shorts_factory_run_leases"
      require_applied "20260828_060_code_review_tenant_fk"
      ;;
    expand-guard) require_applied "20260829_010_studio_generation_expand_contract" ;;
    expand-member)
      require_applied "20260829_010_studio_generation_expand_contract"
      require_verified_app
      ;;
    prepare-rollback)
      require_applied "20260829_030_member_unique_expand"
      require_verified_app
      ;;
    contract-generation)
      require_applied "20260829_035_rollback_indexes_expand"
      require_verified_app
      assert_exact_rollback_indexes
      validate_rollback_manifest
      ;;
    contract-quota)
      echo "ERROR: contract-quota is disabled until an approved R27 member-scope and UTC contract artifact is pinned" >&2
      exit 5
      ;;
    cleanup)
      require_applied "20260829_045_quota_tenant_unique_contract"
      require_verified_app
      validate_rollback_manifest
      validate_cleanup_deadline
      ;;
  esac

  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN
  {
    echo '\set ON_ERROR_STOP on'
    echo "SELECT pg_advisory_lock(hashtext('osmu-schema-migration-v1'));"
    printf "INSERT INTO public.osmu_schema_migrations (migration_id,sha256,phase,state,runner_commit,started_at,details) VALUES ('%s','%s','%s','running','%s',now(),jsonb_build_object('app_image_digest','%s','app_commit','%s','rollback_manifest_sha256','%s')) ON CONFLICT (migration_id) DO UPDATE SET state='running',runner_commit=EXCLUDED.runner_commit,started_at=now(),details=EXCLUDED.details;\n" "$id" "$expected" "$ledger_phase" "$RUNNER_COMMIT" "${VERIFIED_APP_IMAGE_DIGEST:-}" "${VERIFIED_APP_COMMIT:-}" "${ROLLBACK_MANIFEST_SHA256:-}"
    printf "\\i '%s/%s'\n" "$DB_DIR" "$file"
    printf "UPDATE public.osmu_schema_migrations SET state='applied',applied_at=now() WHERE migration_id='%s' AND sha256='%s';\n" "$id" "$expected"
    echo "SELECT pg_advisory_unlock(hashtext('osmu-schema-migration-v1'));"
  } >"$tmp"

  if ! psql -X -q -f "$tmp"; then
    psql -X -q -v ON_ERROR_STOP=1 -v id="$id" <<'SQL' || true
UPDATE public.osmu_schema_migrations
SET state='failed',details=details||jsonb_build_object('failed_at',now())
WHERE migration_id=:'id' AND state <> 'applied';
SQL
    echo "ERROR: migration $id failed; catalog state must be re-evaluated before retry" >&2
    exit 6
  fi
}

case "$PHASE" in
  audit)
    # 읽기 전용. 아무것도 바꾸지 않고, 스키마 상태 때문에 실패하지도 않는다.
    # 운영 DB에 접속하지 않고는 다음 단계를 정할 수 없어서 만든 관측 전용 경로다.
    report_fingerprint
    echo "duplicate_groups=$(duplicate_counts)"
    echo "compatibility_readiness=$(compatibility_readiness)"
    echo "--- runtime schema ---"
    runtime_schema_report
    service_role_report
    echo "--- migration ledger ---"
    psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL' || echo "(ledger table absent)"
SELECT migration_id || ' ' || state || ' ' || phase
FROM public.osmu_schema_migrations ORDER BY migration_id;
SQL
    ;;
  preflight)
    assert_fingerprint
    assert_no_duplicates
    assert_deploy_compatible
    assert_runtime_schema
    ;;
  bootstrap)
    if psql -X -qAt -c "SELECT to_regclass('public.tenants') IS NOT NULL" | grep -qx t; then
      echo "ERROR: bootstrap is only allowed on an empty database" >&2
      exit 3
    fi
    psql -X -q -v ON_ERROR_STOP=1 -f "$DB_DIR/schema.sql"
    psql -X -q -v ON_ERROR_STOP=1 -f "$DB_DIR/rls.sql"
    assert_fingerprint
    assert_no_duplicates
    ensure_ledger
    adopt_baseline
    ;;
  baseline|apply-legacy|expand-fk)
    # 복구 단계다. 표나 제약이 아직 없는 구형 DB에서 시작할 수 있으므로 관측만 한다.
    report_fingerprint
    ensure_ledger
    adopt_baseline
    if [ "$PHASE" = "apply-legacy" ]; then
      apply_legacy_manifest
    elif [ "$PHASE" != "baseline" ]; then
      apply_phase "$PHASE"
    fi
    report_fingerprint
    ;;
  expand-guard|expand-member|prepare-rollback|expand-export-queue|contract-generation|contract-quota|cleanup)
    if [ "$PHASE" = "contract-quota" ]; then assert_fingerprint "S3|S2"; else assert_fingerprint; fi
    assert_no_duplicates
    ensure_ledger
    adopt_baseline
    apply_phase "$PHASE"
    # 회원 전역 강제는 expand-member 의 사후 조건이지 배포의 사전 조건이 아니다.
    # 이 단계가 실제로 그 상태를 만들었는지를 여기서 fail-closed 로 확인한다.
    if [ "$PHASE" = "expand-member" ]; then assert_compatibility_ready; fi
    if [ "$PHASE" = "prepare-rollback" ]; then assert_exact_rollback_indexes; fi
    if [ "$PHASE" = "contract-generation" ]; then assert_fingerprint "S3|S2"; else assert_fingerprint; fi
    ;;
  *)
    echo "usage: $0 {audit|preflight|bootstrap|baseline|apply-legacy|expand-fk|expand-guard|expand-member|prepare-rollback|expand-export-queue|contract-generation|contract-quota|cleanup}" >&2
    exit 2
    ;;
esac
