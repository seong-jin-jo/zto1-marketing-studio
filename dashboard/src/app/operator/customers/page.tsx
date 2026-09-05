"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetcher, isAuthRequiredError } from "@/lib/api";
import { authHeaders } from "@/lib/auth";
import { OperationalIncidentPanel } from "@/components/operator/OperationalIncidentPanel";

interface Customer {
  id: string;
  slug: string;
  name: string;
  status: string;
  tier: string;
  owner_auth_id: string | null;
  created_at: string;
  last_accessed_at: string | null;
  recent_access_days_30: number | null;
  shared_cli_approved_at: string | null;
  integrations: Array<{ kind: string; label: string | null; has_secret: boolean; connected_at?: string | null }>;
  channel_accounts?: Array<{ provider: string; account_count: number; default_username: string | null; last_connected_at: string | null }>;
  drafts_count: number;
  published_count: number;
  failed_count: number;
  usage_events_count: number;
  last_usage_at: string | null;
  shorts_used: number | null;
  generations_used: number | null;
}

interface OperatorSummary {
  authUsers: number;
  workspaces: number;
  activeWorkspaces: number;
  connectedAccounts: number;
  published: number;
  failed: number;
}

interface OAuthProviderStatus {
  provider: string;
  label: string;
  complete: boolean;
  credentialsConfigured: boolean;
  missing: string[];
  requiredSecrets: string[];
  fields: Array<{
    key: "clientId" | "clientSecret" | "configId";
    env: string;
    label: string;
    secret: boolean;
    configured: boolean;
    maskedValue: string | null;
  }>;
  source: "db" | "env";
  updatedAt: string | null;
  callbackUrl: string;
  consoleUrl: string;
  docsUrl: string;
  setupSteps: string[];
  setupSource: "official" | "generic";
  externalReview: "required" | "unknown";
  unavailableReason?: "credential_store_unavailable";
}

function groupOAuthProvidersForDisplay<
  T extends Pick<OAuthProviderStatus, "credentialsConfigured" | "unavailableReason">,
>(providers: readonly T[]) {
  const groups = [
    {
      key: "unavailable",
      label: "저장소 장애",
      items: providers.filter((item) => Boolean(item.unavailableReason)),
    },
    {
      key: "ready",
      label: "준비 완료",
      items: providers.filter((item) => !item.unavailableReason && item.credentialsConfigured),
    },
    {
      key: "missing",
      label: "미설정",
      items: providers.filter((item) => !item.unavailableReason && !item.credentialsConfigured),
    },
  ] as const;

  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      ...group,
      label: `${group.label} ${group.items.length}개`,
    }));
}

interface AuthUser {
  id: string;
  email: string | null;
  provider: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  confirmation_sent_at: string | null;
  last_sign_in_at: string | null;
  tenant_id: string | null;
  tenant_slug: string | null;
  tenant_status: string | null;
  tenant_shared_ai_approved_at: string | null;
}

// OSMU v1.0.0: 계정(status) 게이트는 paused만(가입 즉시 active) — 레거시 pending도 방어적으로 라벨은 유지.
const STATUS_LABEL: Record<string, string> = { pending: "승인 대기(레거시)", active: "활성", paused: "정지" };
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  active: "bg-success/15 text-success",
  paused: "bg-danger/15 text-danger",
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 16) : d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
}

export default function OperatorCustomersPage() {
  const { data, error, isLoading, mutate } = useSWR<{
    customers: Customer[];
    authUsers: AuthUser[];
    summary?: OperatorSummary;
    oauthProviders?: OAuthProviderStatus[];
    error?: string;
  }>("/api/operator/customers", fetcher);
  const customers = data?.customers || [];
  const authUsers = data?.authUsers || [];
  const summary = data?.summary;
  const oauthProviders = data?.oauthProviders || [];
  const oauthProviderGroups = groupOAuthProvidersForDisplay(oauthProviders);
  const visibleError = data?.error || (!isAuthRequiredError(error) ? error?.message : null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [userActionMsg, setUserActionMsg] = useState<Record<string, string>>({});
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [oauthActionMsg, setOauthActionMsg] = useState<Record<string, string>>({});
  const [credentialInputs, setCredentialInputs] = useState<Record<string, Record<string, string>>>({});
  const [visibleCredentialInputs, setVisibleCredentialInputs] = useState<Record<string, Record<string, boolean>>>({});
  const [revealedValues, setRevealedValues] = useState<Record<string, Record<string, string>>>({});
  // 등록된 OAuth provider를 기본 접힘으로 둔다. 펼친 카드만 본문을 렌더해 스크롤 압박을 줄인다.
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const toggleProviderExpanded = (provider: string) =>
    setExpandedProviders((prev) => ({ ...prev, [provider]: !prev[provider] }));
  const revealTimers = useRef<Record<string, number>>({});

  useEffect(() => () => {
    for (const timer of Object.values(revealTimers.current)) window.clearTimeout(timer);
  }, []);

  async function copySetupValue(value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(value);
    window.setTimeout(() => setCopiedValue((current) => current === value ? null : current), 1500);
  }

  function updateCredentialInput(provider: string, key: string, value: string) {
    setCredentialInputs((current) => ({
      ...current,
      [provider]: { ...(current[provider] || {}), [key]: value },
    }));
  }

  function toggleCredentialInputVisibility(provider: string, key: string) {
    setVisibleCredentialInputs((current) => ({
      ...current,
      [provider]: {
        ...(current[provider] || {}),
        [key]: !current[provider]?.[key],
      },
    }));
  }

  function hideCredentialInputs(provider: string) {
    setVisibleCredentialInputs((current) => {
      const next = { ...current };
      delete next[provider];
      return next;
    });
  }

  function hideCredentialValues(provider: string) {
    if (revealTimers.current[provider]) window.clearTimeout(revealTimers.current[provider]);
    delete revealTimers.current[provider];
    setRevealedValues((current) => {
      const next = { ...current };
      delete next[provider];
      return next;
    });
  }

  async function saveCredentialSet(item: OAuthProviderStatus) {
    if (busyProvider || item.unavailableReason) return;
    const values = credentialInputs[item.provider] || {};
    if (item.fields.some((field) => !values[field.key]?.trim())) {
      setOauthActionMsg((current) => ({ ...current, [item.provider]: "모든 필드를 한 세트로 입력해주세요." }));
      return;
    }
    setBusyProvider(item.provider);
    setOauthActionMsg((current) => ({ ...current, [item.provider]: "" }));
    try {
      const res = await fetch("/api/operator/oauth-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ provider: item.provider, values }),
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        setOauthActionMsg((current) => ({ ...current, [item.provider]: body.error || `저장 실패 ${res.status}` }));
        return;
      }
      setCredentialInputs((current) => ({ ...current, [item.provider]: {} }));
      hideCredentialInputs(item.provider);
      hideCredentialValues(item.provider);
      setOauthActionMsg((current) => ({ ...current, [item.provider]: "암호화 저장했습니다." }));
      await mutate();
    } catch {
      setOauthActionMsg((current) => ({ ...current, [item.provider]: "저장 요청에 실패했습니다." }));
    } finally {
      setBusyProvider(null);
    }
  }

  async function revealCredentialSet(item: OAuthProviderStatus) {
    if (busyProvider || !item.credentialsConfigured || item.unavailableReason) return;
    const provider = item.provider;
    setBusyProvider(provider);
    setOauthActionMsg((current) => ({ ...current, [provider]: "" }));
    try {
      const res = await fetch("/api/operator/oauth-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "reveal", provider }),
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({})) as {
        error?: string;
        values?: Record<string, string>;
        imported?: boolean;
      };
      if (!res.ok || !body.values) {
        setOauthActionMsg((current) => ({ ...current, [provider]: body.error || `확인 실패 ${res.status}` }));
        return;
      }
      setRevealedValues((current) => ({ ...current, [provider]: body.values || {} }));
      if (revealTimers.current[provider]) window.clearTimeout(revealTimers.current[provider]);
      revealTimers.current[provider] = window.setTimeout(() => {
        hideCredentialValues(provider);
      }, 30_000);
      await mutate();
      setOauthActionMsg((current) => ({
        ...current,
        [provider]: body.imported
          ? "환경변수를 암호화 DB로 옮겼습니다. 원문은 30초 후 자동으로 숨깁니다."
          : "원문은 30초 후 자동으로 숨깁니다.",
      }));
    } catch {
      setOauthActionMsg((current) => ({ ...current, [provider]: "원문 확인 요청에 실패했습니다." }));
    } finally {
      setBusyProvider(null);
    }
  }

  async function deleteCredentialSet(item: OAuthProviderStatus) {
    if (busyProvider || item.source !== "db" || item.unavailableReason) return;
    if (!window.confirm(`${item.label}의 Admin DB 저장값을 삭제하고 운영 환경변수 fallback으로 되돌릴까요?`)) return;
    setBusyProvider(item.provider);
    setOauthActionMsg((current) => ({ ...current, [item.provider]: "" }));
    try {
      const res = await fetch("/api/operator/oauth-credentials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ provider: item.provider }),
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({})) as { error?: string; deleted?: boolean };
      if (!res.ok) {
        setOauthActionMsg((current) => ({ ...current, [item.provider]: body.error || `삭제 실패 ${res.status}` }));
        return;
      }
      hideCredentialValues(item.provider);
      setCredentialInputs((current) => ({ ...current, [item.provider]: {} }));
      hideCredentialInputs(item.provider);
      setOauthActionMsg((current) => ({
        ...current,
        [item.provider]: body.deleted ? "DB 저장값을 삭제했습니다." : "삭제할 DB 저장값이 없습니다.",
      }));
      await mutate();
    } catch {
      setOauthActionMsg((current) => ({ ...current, [item.provider]: "삭제 요청에 실패했습니다." }));
    } finally {
      setBusyProvider(null);
    }
  }

  async function postCustomerAction(
    userId: string,
    action: "pause_user" | "resume_user" | "approve_shared_ai" | "revoke_shared_ai",
  ) {
    if (busyUserId) return;
    setBusyUserId(userId);
    setUserActionMsg((p) => ({ ...p, [userId]: "" }));
    try {
      const res = await fetch("/api/operator/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action, user_id: userId }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string; status?: string; shared_ai_approved?: boolean };
      if (!res.ok) {
        setUserActionMsg((p) => ({ ...p, [userId]: body.error || `실패 ${res.status}` }));
        return;
      }
      const msg = body.status ? `상태 변경됨: ${body.status}` : `공유 AI 승인: ${body.shared_ai_approved ? "허용" : "회수"}`;
      setUserActionMsg((p) => ({ ...p, [userId]: msg }));
      mutate();
    } catch (e) {
      setUserActionMsg((p) => ({ ...p, [userId]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="px-region py-stack-section">
      <div className="flex items-end justify-between gap-pad-inset mb-stack-section">
        <div>
          <h2 className="text-subheading font-semibold text-text mb-micro">유저 관리자</h2>
          <p className="text-body-sm text-subtle">가입자, 워크스페이스, 연결 앱, 사용량, 생성·발행 현황을 봅니다.</p>
          <p className="text-caption text-subtle mt-micro">고객 인증은 Google OAuth 전용입니다. 비밀번호 원문은 조회하지 않습니다.</p>
        </div>
        <a href="/operator" className="text-caption text-subtle hover:text-muted">운영자 토큰 재입력</a>
      </div>

      {isLoading && <p className="text-body-sm text-subtle">불러오는 중…</p>}
      {visibleError && (
        <div className="rounded-control border border-danger/30 bg-danger/10 p-stack text-caption text-danger mb-pad-inset">
          {visibleError}
        </div>
      )}

      {summary && (
        <section className="mb-stack-section grid grid-cols-2 gap-stack-tight md:grid-cols-3 xl:grid-cols-6" aria-label="운영 요약">
          {[
            ["가입자", summary.authUsers],
            ["워크스페이스", summary.workspaces],
            ["활성", summary.activeWorkspaces],
            ["연결 계정", summary.connectedAccounts],
            ["발행", summary.published],
            ["실패", summary.failed],
          ].map(([label, value]) => (
            <div key={label} className="card p-stack">
              <p className="text-caption text-subtle">{label}</p>
              <p className="mt-micro text-subheading font-semibold text-text">{value}</p>
            </div>
          ))}
        </section>
      )}

      <OperationalIncidentPanel />

      <section className="mb-stack-section">
        <div className="mb-stack flex items-center justify-between gap-stack">
          <div>
            <h3 className="text-body-sm font-semibold text-text">중앙 OAuth 개발자 앱</h3>
            <p className="mt-micro text-caption text-subtle">운영자 전용 암호화 저장소입니다. 기본 화면은 마스킹하며, 원문은 명시적으로 확인한 뒤 30초 후 자동 삭제합니다.</p>
          </div>
          <span className="text-caption text-subtle">{oauthProviders.filter((item) => item.credentialsConfigured).length}/{oauthProviders.length} 준비</span>
        </div>
        <div className="space-y-stack-section">
          {oauthProviderGroups.map((group) => (
            <section key={group.key} aria-labelledby={`oauth-provider-group-${group.key}`}>
              <h4 id={`oauth-provider-group-${group.key}`} className="mb-stack-tight text-caption font-semibold text-text">
                {group.label}
              </h4>
              <div className="grid gap-stack xl:grid-cols-2">
                {group.items.map((item) => {
                  const isExpanded = Boolean(expandedProviders[item.provider]);
                  return (
                  <div key={item.provider} data-oauth-provider={item.provider} className="card p-pad-inset">
              <h5>
              <button
                type="button"
                onClick={() => toggleProviderExpanded(item.provider)}
                aria-expanded={isExpanded}
                aria-controls={`oauth-provider-panel-${item.provider}`}
                id={`oauth-provider-trigger-${item.provider}`}
                aria-label={`${item.label} 자격증명 카드 ${isExpanded ? "접기" : "펼치기"}`}
                className="flex min-h-control-touch w-full items-start justify-between gap-stack text-left"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium capitalize text-text">
                    <span className="mr-micro inline-block text-subtle">{isExpanded ? "▾" : "▸"}</span>
                    {item.label}
                  </p>
                  <p className="mt-micro break-words text-caption text-subtle">
                    {item.unavailableReason
                      ? "자격증명 저장소 장애입니다. 기존 값을 다시 입력하지 마세요. DB 복구 후 새로고침하세요."
                      : item.credentialsConfigured
                        ? item.source === "db"
                          ? "Admin DB에서 완전한 세트 확인"
                          : "완전한 세트가 환경변수로 보호되어 있습니다. 원문 확인 시 암호화 DB로 옮긴 뒤 표시합니다."
                        : `미설정/불완전: ${item.missing.join(", ")}`}
                  </p>
                  <p className="mt-micro text-caption text-subtle">출처 {item.source.toUpperCase()} · 갱신 {fmtDate(item.updatedAt)}</p>
                </div>
                <span className={`shrink-0 rounded-chip px-stack-tight py-micro text-caption ${item.unavailableReason ? "bg-danger/15 text-danger" : item.credentialsConfigured ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                  {item.unavailableReason ? "저장소 장애" : item.credentialsConfigured ? "준비" : "차단"}
                </span>
              </button>
              </h5>
              {isExpanded && (
              <div
                id={`oauth-provider-panel-${item.provider}`}
                aria-labelledby={`oauth-provider-trigger-${item.provider}`}
                className="mt-stack space-y-stack"
              >
                <div>
                  <p className="text-caption font-medium uppercase tracking-wide text-subtle">콜백 주소</p>
                  <div className="mt-micro flex items-start gap-stack-tight">
                    <code className="min-w-0 flex-1 break-all rounded-chip bg-surface-2 px-stack-tight py-stack-tight text-caption text-muted">
                      {item.callbackUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copySetupValue(item.callbackUrl)}
                      className="shrink-0 rounded-chip border border-border px-stack-tight py-stack-tight text-caption text-accent hover:bg-surface-2"
                    >
                      {copiedValue === item.callbackUrl ? "복사됨" : "복사"}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-stack-tight">
                    <p className="text-caption font-medium uppercase tracking-wide text-subtle">필수 항목</p>
                    {revealedValues[item.provider] ? (
                      <button type="button" onClick={() => hideCredentialValues(item.provider)} className="text-caption text-danger hover:underline">
                        숨기기
                      </button>
                    ) : item.credentialsConfigured && !item.unavailableReason ? (
                      <button
                        type="button"
                        onClick={() => void revealCredentialSet(item)}
                        disabled={busyProvider === item.provider}
                        className="text-caption text-accent hover:underline disabled:opacity-50"
                      >
                        원문 확인
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-stack-tight grid gap-stack-tight">
                    {item.fields.map((field) => {
                      const revealed = revealedValues[item.provider]?.[field.key];
                      return (
                        <div key={field.key} className="rounded-chip border border-border bg-surface-2 p-stack-tight">
                          <div className="flex flex-wrap items-center justify-between gap-stack-tight">
                            <label htmlFor={`${item.provider}-${field.key}`} className="text-caption font-medium text-muted">
                              {field.label}
                            </label>
                            <div className="flex items-center gap-stack-tight">
                              <button
                                type="button"
                                onClick={() => void copySetupValue(field.env)}
                                className="font-mono text-caption text-subtle hover:text-accent"
                                title={`${field.env} 이름 복사`}
                              >
                                {field.env}{copiedValue === field.env ? " ✓" : ""}
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleCredentialInputVisibility(item.provider, field.key)}
                                aria-label={`${field.label} ${visibleCredentialInputs[item.provider]?.[field.key] ? "입력값 숨김" : "입력값 표시"}`}
                                className="text-caption text-accent hover:underline"
                              >
                                {visibleCredentialInputs[item.provider]?.[field.key] ? "입력값 숨김" : "입력값 표시"}
                              </button>
                            </div>
                          </div>
                          <p className={`mt-micro break-all font-mono text-caption ${revealed ? "text-danger" : "text-subtle"}`}>
                            {revealed || field.maskedValue || "미설정"}
                          </p>
                          <input
                            id={`${item.provider}-${field.key}`}
                            type={visibleCredentialInputs[item.provider]?.[field.key] ? "text" : "password"}
                            autoComplete="new-password"
                            value={credentialInputs[item.provider]?.[field.key] || ""}
                            onChange={(event) => updateCredentialInput(item.provider, field.key, event.target.value)}
                            disabled={Boolean(item.unavailableReason)}
                            placeholder={item.unavailableReason ? "저장소 복구 후 사용" : field.configured ? "새 값으로 교체" : `${field.label} 입력`}
                            className="mt-stack-tight w-full rounded-chip border border-border bg-surface px-stack-tight py-stack-tight text-caption text-text outline-none focus:border-accent"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-caption font-medium uppercase tracking-wide text-subtle">콘솔 설정</p>
                  <ol className="mt-micro list-decimal space-y-micro pl-pad-inset text-caption leading-relaxed text-subtle">
                    {item.setupSteps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  {item.setupSource === "generic" && (
                    <p className="mt-micro text-caption text-warning">일반 경로: 외부 콘솔 UI가 바뀔 수 있어 공식 문서와 현재 화면을 함께 확인하세요.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-stack-tight">
                  <div className="flex flex-wrap gap-stack-tight">
                    <button
                      type="button"
                      onClick={() => void saveCredentialSet(item)}
                      disabled={Boolean(item.unavailableReason) || busyProvider === item.provider}
                      className="rounded-chip bg-accent px-stack py-stack-tight text-caption text-accent-fg hover:opacity-90 disabled:opacity-50"
                    >
                      {busyProvider === item.provider ? "처리 중…" : item.credentialsConfigured ? "전체 세트 업데이트" : "전체 세트 저장"}
                    </button>
                    {item.source === "db" && !item.unavailableReason && (
                      <button
                        type="button"
                        onClick={() => void deleteCredentialSet(item)}
                        disabled={busyProvider === item.provider}
                        className="rounded-chip border border-danger/30 px-stack py-stack-tight text-caption text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        DB 저장값 삭제
                      </button>
                    )}
                  </div>
                  {oauthActionMsg[item.provider] && <p className="text-caption text-subtle">{oauthActionMsg[item.provider]}</p>}
                </div>
                <div className="flex flex-wrap gap-stack text-caption">
                  <a href={item.consoleUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
                    개발자 콘솔 ↗
                  </a>
                  <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
                    공식 문서 ↗
                  </a>
                </div>
              </div>
              )}
                  </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="mb-stack-section">
        <div className="flex items-center justify-between mb-stack">
          <h3 className="text-body-sm font-semibold text-text">인증 가입자</h3>
          <span className="text-caption text-subtle">{authUsers.length}명</span>
        </div>
        <div className="grid gap-stack-tight">
          {authUsers.map((u) => {
            const confirmed = Boolean(u.email_confirmed_at);
            return (
              <div key={u.id} className="card p-stack">
                <div className="flex flex-wrap items-start justify-between gap-stack">
                  <div>
                    <div className="flex flex-wrap items-center gap-stack-tight">
                      <b className="text-body-sm text-text">{u.email || "(email 없음)"}</b>
                      <span className={`text-caption px-stack-tight py-micro rounded-chip ${confirmed ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                        {confirmed ? "이메일 확인됨" : "이메일 미확인"}
                      </span>
                      <span className="text-caption px-stack-tight py-micro rounded-chip bg-surface-2 text-subtle">{u.provider || "provider 없음"}</span>
                      {u.tenant_status && (
                        <span className={`text-caption px-stack-tight py-micro rounded-chip ${STATUS_CLASS[u.tenant_status] || "bg-surface-2 text-subtle"}`}>
                          {STATUS_LABEL[u.tenant_status] || u.tenant_status}
                        </span>
                      )}
                      <span className={`text-caption px-stack-tight py-micro rounded-chip ${u.tenant_shared_ai_approved_at ? "bg-success/15 text-success" : "bg-surface-2 text-subtle"}`}>
                        공유 AI {u.tenant_shared_ai_approved_at ? "승인됨" : "미승인"}
                      </span>
                    </div>
                    <p className="text-caption text-subtle mt-micro">auth {u.id}</p>
                    <p className="text-caption text-subtle">
                      tenant {u.tenant_slug || "없음"} · 가입 {fmtDate(u.created_at)} · 최근 로그인 {fmtDate(u.last_sign_in_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex flex-wrap justify-end gap-stack-tight">
                      {u.tenant_shared_ai_approved_at ? (
                        <button
                          onClick={() => postCustomerAction(u.id, "revoke_shared_ai")}
                          disabled={busyUserId === u.id}
                          className="px-stack py-stack-tight rounded-chip bg-danger/15 text-caption text-danger hover:bg-danger/25 disabled:opacity-50"
                        >
                          {busyUserId === u.id ? "처리 중..." : "공유 AI 회수"}
                        </button>
                      ) : (
                        <button
                          onClick={() => postCustomerAction(u.id, "approve_shared_ai")}
                          disabled={busyUserId === u.id}
                          className="px-stack py-stack-tight rounded-chip bg-success/15 text-caption text-success hover:bg-success/25 disabled:opacity-50"
                        >
                          {busyUserId === u.id ? "처리 중..." : "✓ 공유 AI 승인"}
                        </button>
                      )}
                      {u.tenant_status === "paused" ? (
                        <button
                          onClick={() => postCustomerAction(u.id, "resume_user")}
                          disabled={busyUserId === u.id}
                          className="px-stack py-stack-tight rounded-chip bg-success/15 text-caption text-success hover:bg-success/25 disabled:opacity-50"
                        >
                          {busyUserId === u.id ? "처리 중..." : "▶ 재개"}
                        </button>
                      ) : (
                        <button
                          onClick={() => postCustomerAction(u.id, "pause_user")}
                          disabled={busyUserId === u.id}
                          className="px-stack py-stack-tight rounded-chip bg-danger/15 text-caption text-danger hover:bg-danger/25 disabled:opacity-50"
                        >
                          {busyUserId === u.id ? "처리 중..." : "⏸ 정지"}
                        </button>
                      )}
                    </div>
                    {userActionMsg[u.id] && <p className="mt-micro text-caption text-subtle">{userActionMsg[u.id]}</p>}
                  </div>
                </div>
              </div>
            );
          })}
          {!isLoading && authUsers.length === 0 && !data?.error && (
            <p className="text-body-sm text-subtle">가입자가 없습니다.</p>
          )}
        </div>
      </section>

      <div className="flex items-center justify-between mb-stack">
        <h3 className="text-body-sm font-semibold text-text">워크스페이스</h3>
        <span className="text-caption text-subtle">{customers.length}개</span>
      </div>
      <div className="grid gap-stack">
        {customers.map((c) => {
          const channels = c.integrations.filter((i) => i.kind === "channel" && i.has_secret);
          const channelAccounts = c.channel_accounts || [];
          const anthropic = c.integrations.some((i) => i.kind === "anthropic" && i.has_secret);
          return (
            <div key={c.id} className="card p-pad-inset">
              <div className="flex flex-wrap items-start justify-between gap-stack">
                <div>
                  <div className="flex items-center gap-stack-tight">
                    <h3 className="text-body-sm font-semibold text-text">{c.name}</h3>
                    <span className="text-caption px-stack-tight py-micro rounded-chip bg-surface-2 text-subtle">{c.tier}</span>
                    <span className={`text-caption px-stack-tight py-micro rounded-chip ${c.status === "active" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{c.status}</span>
                  </div>
                  <p className="text-caption text-subtle mt-micro">{c.slug} · {c.id}</p>
                  <p className="text-caption text-subtle">가입 {fmtDate(c.created_at)} · auth {c.owner_auth_id || "-"}</p>
                </div>
                <div className="text-right text-caption text-subtle">
                  {c.last_accessed_at ? (
                    <>
                      <p>최근 접속 {fmtDate(c.last_accessed_at)}</p>
                      <p>{c.recent_access_days_30 == null ? "최근 30일 접속 기록 없음" : `최근 30일 접속 ${c.recent_access_days_30}일`}</p>
                    </>
                  ) : (
                    <p>접속 기록 없음</p>
                  )}
                  <p>최근 AI 사용 {fmtDate(c.last_usage_at)}</p>
                  <p>AI 사용 기록 {c.usage_events_count} · 초안 {c.drafts_count} · 발행 {c.published_count} · 실패 {c.failed_count}</p>
                  <p>생성 {c.generations_used ?? 0} · 쇼츠 {c.shorts_used ?? 0}</p>
                </div>
              </div>
              <div className="mt-stack flex flex-wrap gap-stack-tight">
                <span className={`text-caption px-stack-tight py-micro rounded-chip ${anthropic ? "bg-success/15 text-success" : "bg-surface-2 text-subtle"}`}>
                  Anthropic {anthropic ? "연결" : "공유 엔진"}
                </span>
                {!anthropic && (
                  <span className={`text-caption px-stack-tight py-micro rounded-chip ${c.shared_cli_approved_at ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                    공유 AI {c.shared_cli_approved_at ? "승인됨" : "미승인"}
                  </span>
                )}
                {channelAccounts.length ? channelAccounts.map((account) => (
                  <span key={account.provider} className="text-caption px-stack-tight py-micro rounded-chip bg-accent-soft text-accent" title={`최근 연결 ${fmtDate(account.last_connected_at)}`}>
                    {account.provider} {account.account_count}개{account.default_username ? ` · 기본 @${account.default_username}` : ""}
                  </span>
                )) : channels.length ? channels.map((ch) => (
                  <span key={`${ch.kind}:${ch.label}`} className="text-caption px-stack-tight py-micro rounded-chip bg-accent-soft text-accent">
                    {ch.label} 연결(legacy)
                  </span>
                )) : (
                  <span className="text-caption px-stack-tight py-micro rounded-chip bg-surface-2 text-subtle">연결 앱 없음</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && customers.length === 0 && !data?.error && (
        <p className="text-body-sm text-subtle">등록된 워크스페이스가 없습니다.</p>
      )}
    </div>
  );
}
