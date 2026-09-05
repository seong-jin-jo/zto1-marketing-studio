"use client";

import { useCallback, useEffect, useState } from "react";
import { useUIStore } from "@/store/ui-store";
import { authHeaders } from "@/lib/auth";
import { Button } from "@/components/shared/Button";

// SNS-007: provider당 여러 계정(예: Threads 개인+브랜드)을 목록/추가(Bluesky만 수동)/기본전환/삭제.
// OAuth provider(threads/x/instagram/facebook/youtube 등)는 이 컴포넌트가 아니라
// SocialConnectButton이 새 계정을 추가한다(연결=새 OAuth 왕복=새 channel_accounts 행) —
// 이 컴포넌트는 그렇게 쌓인 계정들을 "관리"만 한다. onAccountsChanged로 부모(연결 상태 카드 등)에
// 갱신을 알린다.

interface AccountRow {
  id: string;
  external_account_id: string;
  display_name: string | null;
  username: string | null;
  is_default: boolean;
  status: string;
  token_expires_at: string | null;
  created_at: string;
  connection_state: "connected" | "reconnect";
  can_be_default: boolean;
  default_blocked_reason: string | null;
}

function accountLabel(a: AccountRow): string {
  if (a.display_name && a.username) return `${a.display_name} (@${a.username})`;
  if (a.display_name) return a.display_name;
  if (a.username) return `@${a.username}`;
  return a.external_account_id;
}

function statusBadge(account: AccountRow): { text: string; className: string } {
  if (account.connection_state === "connected") return { text: "연결됨", className: "text-success" };
  if (account.status === "revoked") return { text: "연결 해제됨", className: "text-danger" };
  return { text: "재연결 필요", className: "text-warning" };
}

function formatTokenExpiry(value: string | null): string {
  if (!value) return "제공되지 않음";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function defaultBlockedReason(reason: string | null): string {
  if (reason === "status_revoked") return "연결이 해제되어 기본으로 지정할 수 없습니다. 다시 연결해 주세요.";
  if (reason === "status_inactive") return "비활성 상태라 기본으로 지정할 수 없습니다.";
  if (reason === "token_expiry_missing" || reason === "token_expiry_invalid") {
    return "토큰 만료 시각을 확인할 수 없어 기본으로 지정할 수 없습니다. 다시 연결해 주세요.";
  }
  return "토큰이 만료되어 기본으로 지정할 수 없습니다. 다시 연결해 주세요.";
}

export function AccountManager({
  provider,
  label,
  allowManualAdd = false,
  onAccountsChanged,
}: {
  provider: string;
  label: string;
  allowManualAdd?: boolean;
  onAccountsChanged?: () => void;
}) {
  const { activeWorkspace } = useUIStore();
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  const refresh = useCallback(async () => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/channels/${provider}/accounts?tenant_id=${activeWorkspace.id}`, {
        headers: authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `${r.status}`);
      setAccounts(d.accounts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계정 목록을 불러오지 못했습니다.");
      setAccounts(null);
    } finally {
      setLoading(false);
    }
  }, [provider, activeWorkspace]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setDefault = async (id: string) => {
    if (!activeWorkspace || busyId) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/channels/${provider}/accounts/${id}/default?tenant_id=${activeWorkspace.id}`, {
        method: "POST",
        headers: authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `${r.status}`);
      await refresh();
      onAccountsChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "기본계정 전환에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (account: AccountRow) => {
    if (!activeWorkspace || busyId) return;
    const name = accountLabel(account);
    if (!window.confirm(`${name} 계정 연결을 해제할까요? 이 작업은 되돌릴 수 없으며 이 계정으로 예약된 발행은 실패로 처리됩니다.`)) return;
    setBusyId(account.id);
    try {
      const r = await fetch(`/api/channels/${provider}/accounts/${account.id}?tenant_id=${activeWorkspace.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `${r.status}`);
      await refresh();
      onAccountsChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "계정 삭제에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  };

  const addManual = async () => {
    if (!activeWorkspace || addBusy) return;
    setAddBusy(true);
    setAddMsg("");
    try {
      const r = await fetch(`/api/channels/${provider}/accounts?tenant_id=${activeWorkspace.id}`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ handle, appPassword }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `${r.status}`);
      setAddMsg(`${d.account || handle} 연결 완료.`);
      setHandle("");
      setAppPassword("");
      setShowAdd(false);
      await refresh();
      onAccountsChanged?.();
    } catch (e) {
      setAddMsg(e instanceof Error ? e.message : "계정 추가에 실패했습니다.");
    } finally {
      setAddBusy(false);
    }
  };

  if (!activeWorkspace) return null;
  if (loading) {
    return <p className="text-caption text-subtle" data-testid={`account-manager-loading-${provider}`}>계정 목록 확인 중…</p>;
  }
  if (error) {
    return (
      <p className="text-caption text-danger" data-testid={`account-manager-error-${provider}`}>
        {error}
      </p>
    );
  }
  if (!accounts || accounts.length === 0) {
    return allowManualAdd ? (
      <ManualAddBlock
        provider={provider}
        label={label}
        showAdd={showAdd}
        setShowAdd={setShowAdd}
        handle={handle}
        setHandle={setHandle}
        appPassword={appPassword}
        setAppPassword={setAppPassword}
        addBusy={addBusy}
        addMsg={addMsg}
        addManual={addManual}
      />
    ) : null;
  }

  return (
    <div className="mt-stack" data-testid={`account-manager-${provider}`}>
      <div className="mb-stack-tight space-y-micro">
        <p className="text-caption font-semibold text-muted">연결된 {label} 계정 ({accounts.length})</p>
        <p className="text-caption text-subtle" data-testid={`account-default-help-${provider}`}>
          기본 계정은 이 플랫폼에 올릴 때 사용하는 계정입니다.
        </p>
      </div>
      <ul className="space-y-stack-tight">
        {accounts.map((a) => {
          const badge = statusBadge(a);
          const blockedReason = a.can_be_default ? "" : defaultBlockedReason(a.default_blocked_reason);
          const blockedReasonId = `account-default-blocked-${provider}-${a.id}`;
          return (
            <li
              key={a.id}
              data-testid={`account-row-${provider}-${a.id}`}
              className="flex flex-col gap-stack-tight rounded-control border border-border bg-surface-2 px-stack py-stack-tight text-caption md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-stack-tight">
                  <span className="truncate text-text">{accountLabel(a)}</span>
                  {a.is_default && (
                    <span
                      data-testid={`account-default-badge-${provider}-${a.id}`}
                      className="shrink-0 rounded-chip bg-accent/20 px-stack-tight py-micro text-caption text-accent"
                    >
                      기본
                    </span>
                  )}
                </div>
                <dl className="mt-micro flex flex-wrap gap-x-stack gap-y-micro text-caption">
                  <div className="flex gap-micro">
                    <dt className="text-subtle">상태</dt>
                    <dd className={badge.className}>{badge.text}</dd>
                  </div>
                  <div className="flex gap-micro">
                    <dt className="text-subtle">토큰 만료</dt>
                    <dd className="text-muted">
                      {a.token_expires_at ? (
                        <time dateTime={a.token_expires_at}>{formatTokenExpiry(a.token_expires_at)}</time>
                      ) : formatTokenExpiry(null)}
                    </dd>
                  </div>
                </dl>
                {blockedReason && (
                  <p id={blockedReasonId} className="mt-micro text-caption text-warning">
                    {blockedReason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-stack-tight">
                {!a.is_default && (
                  <Button
                    size="sm"
                    onClick={() => setDefault(a.id)}
                    disabled={busyId !== null || !a.can_be_default}
                    aria-describedby={!a.can_be_default ? blockedReasonId : undefined}
                    data-testid={`account-set-default-${provider}-${a.id}`}
                    className="min-w-0"
                  >
                    기본으로 지정
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => remove(a)}
                  disabled={busyId !== null}
                  aria-label={`${accountLabel(a)} 계정 연결 해제`}
                  data-testid={`account-delete-${provider}-${a.id}`}
                  className="min-w-0"
                >
                  연결 해제
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {allowManualAdd && (
        <div className="mt-stack-tight">
          <ManualAddBlock
            provider={provider}
            label={label}
            showAdd={showAdd}
            setShowAdd={setShowAdd}
            handle={handle}
            setHandle={setHandle}
            appPassword={appPassword}
            setAppPassword={setAppPassword}
            addBusy={addBusy}
            addMsg={addMsg}
            addManual={addManual}
          />
        </div>
      )}
    </div>
  );
}

function ManualAddBlock({
  provider,
  label,
  showAdd,
  setShowAdd,
  handle,
  setHandle,
  appPassword,
  setAppPassword,
  addBusy,
  addMsg,
  addManual,
}: {
  provider: string;
  label: string;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  handle: string;
  setHandle: (v: string) => void;
  appPassword: string;
  setAppPassword: (v: string) => void;
  addBusy: boolean;
  addMsg: string;
  addManual: () => void;
}) {
  return (
    <div>
      <Button
        size="sm"
        onClick={() => setShowAdd(!showAdd)}
        data-testid={`account-add-toggle-${provider}`}
        className="min-w-0"
      >
        {showAdd ? "닫기" : `${label} 계정 추가(App Password)`}
      </Button>
      {showAdd && (
        <div className="mt-stack-tight space-y-stack-tight rounded-control border border-border bg-surface p-stack">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle.bsky.social"
            data-testid={`account-add-handle-${provider}`}
            className="w-full rounded-chip border border-border bg-surface-2 px-stack-tight py-micro text-caption text-text"
          />
          <input
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder="앱 비밀번호"
            type="password"
            data-testid={`account-add-password-${provider}`}
            className="w-full rounded-chip border border-border bg-surface-2 px-stack-tight py-micro text-caption text-text"
          />
          <Button
            size="sm"
            onClick={addManual}
            disabled={addBusy || !handle || !appPassword}
            data-testid={`account-add-submit-${provider}`}
            className="w-full min-w-0"
          >
            {addBusy ? "연결 중…" : "계정 추가"}
          </Button>
          {addMsg && <p className="text-caption text-subtle">{addMsg}</p>}
        </div>
      )}
    </div>
  );
}
