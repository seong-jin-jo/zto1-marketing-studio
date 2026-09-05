"use client";

import { useEffect, useState } from "react";

// Multi-Tenant Hub — 여러 openclaw 인스턴스를 탭으로 전환.
// tenants는 /api/tenants 에서 로드 (fork에서 data/tenants.json 박음).
//
// 디자인: 좌측 탭 + 우측 iframe + 우상단 "+ 새 서비스" 버튼.
// CLAUDE.md "서비스 중립" 정합: 브랜드/URL 하드코딩 X.

interface Tenant {
  slug: string;
  name: string;
  emoji?: string;
  dashboardPort: number;
  gatewayPort: number;
  publicUrl: string;
  channels?: string[];
  status?: "active" | "pending" | "waiting-meta-review" | "waiting-legal-opinion" | string;
}

const STATUS_LABEL: Record<string, string> = {
  active: "LIVE",
  pending: "대기",
  "waiting-meta-review": "Meta 검수",
  "waiting-legal-opinion": "Legal 자문",
};

const STATUS_COLOR: Record<string, string> = {
  active: "text-success",
  pending: "text-warning",
  "waiting-meta-review": "text-subtle",
  "waiting-legal-opinion": "text-subtle",
};

export default function ServicesPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => {
        const list: Tenant[] = d.tenants || [];
        setTenants(list);
        if (list.length > 0) setActive(list[0].slug);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const current = tenants.find((t) => t.slug === active);

  if (loading) {
    return (
      <div className="p-region text-subtle">고객 목록 불러오는 중...</div>
    );
  }

  if (error) {
    return (
      <div className="p-region text-subtle">
        <h1 className="text-subheading text-muted mb-pad-inset">전체 서비스</h1>
        <p className="text-danger mb-stack-tight">고객 목록을 불러오지 못했습니다: {error}</p>
        <p className="text-body-sm">
          fork-only data 파일이 박혀있는지 확인. <code className="text-warning">data/tenants.json</code>
        </p>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="p-region text-subtle">
        <h1 className="text-subheading text-muted mb-pad-inset">전체 서비스</h1>
        <p className="mb-stack">등록된 고객이 없습니다.</p>
        <p className="text-body-sm mb-stack-tight">분리 배포에서 <code className="text-warning">data/tenants.json</code> 추가:</p>
        <pre className="bg-surface p-stack text-caption text-muted rounded-chip">{`{
  "tenants": [
    {
      "slug": "service-a",
      "name": "Service A",
      "publicUrl": "https://dash-a.example.com",
      "dashboardPort": 34561,
      "gatewayPort": 18790,
      "status": "active"
    }
  ]
}`}</pre>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-bg">
      {/* 좌측 탭 */}
      <aside className="w-60 border-r border-border bg-surface flex flex-col">
        <div className="p-pad-inset border-b border-border flex items-center justify-between">
          <h2 className="text-caption uppercase tracking-wider text-subtle font-semibold">전체 서비스</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="text-subtle hover:text-success text-lead leading-none w-6 h-6 flex items-center justify-center"
            title="새 서비스 추가"
          >
            +
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-stack-tight">
          {tenants.map((t) => (
            <li key={t.slug}>
              <button
                onClick={() => setActive(t.slug)}
                className={`w-full text-left px-pad-inset py-stack flex items-center gap-stack border-l-2 transition-colors ${
                  active === t.slug
                    ? "bg-surface border-success text-text"
                    : "border-transparent text-subtle hover:bg-surface/50"
                }`}
              >
                <span className="text-lead w-6 text-center">{t.emoji || "•"}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-body-sm truncate">{t.name}</span>
                  <span
                    className={`block text-caption mt-micro tracking-wider ${STATUS_COLOR[t.status || "pending"] || "text-subtle"}`}
                  >
                    {STATUS_LABEL[t.status || ""] || t.status || ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 우측 iframe */}
      <main className="flex-1 bg-surface relative">
        {current ? (
          <iframe
            key={current.slug}
            src={current.publicUrl}
            title={current.name}
            className="w-full h-full border-0"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-subtle">
            서비스를 선택하세요
          </div>
        )}
      </main>

      {/* 추가 모달 */}
      {showAdd && (
        <AddTenantModal onClose={() => setShowAdd(false)} tenants={tenants} />
      )}
    </div>
  );
}

function AddTenantModal({
  onClose,
  tenants,
}: {
  onClose: () => void;
  tenants: Tenant[];
}) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("서비스");
  const [channel, setChannel] = useState("instagram");
  const [domain, setDomain] = useState("");
  const [cmd, setCmd] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const maxDash = Math.max(34560, ...tenants.map((t) => t.dashboardPort));
    const maxGw = Math.max(18789, ...tenants.map((t) => t.gatewayPort));
    const newDash = maxDash + 1;
    const newGw = maxGw + 1;

    const c = `# postAGI: 새 tenant '${slug}' 자동 추가
cd ~/sj_code_master/postAGI/openclaw-auto
bash add-tenant.sh ${slug} ${newDash} ${newGw} ${channel}

# Cloudflare Tunnel 라우트:
#   hostname: ${domain}
#   service: http://localhost:${newDash}

# data/tenants.json 갱신 (add-tenant.sh가 자동 처리)
# 가동:
docker-compose -f docker-compose.postagi-4tenants.yml up -d openclaw-gateway-${slug} openclaw-dashboard-${slug} --build`;
    setCmd(c);

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(c).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 bg-player-surface/75 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-chip p-stack-section w-[480px] max-w-[90vw]">
        <h2 className="text-success mb-pad-inset text-body">새 서비스 추가</h2>
        <form onSubmit={submit} className="space-y-stack">
          <div>
            <label className="block text-caption uppercase tracking-wider text-subtle mb-micro">
              slug (영문 소문자)
            </label>
            <input
              required
              pattern="[a-z0-9]+"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-stack py-stack-tight bg-player-surface border border-border text-muted rounded-chip text-body-sm"
              placeholder="예: nova"
            />
          </div>
          <div>
            <label className="block text-caption uppercase tracking-wider text-subtle mb-micro">
              표시명
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-stack py-stack-tight bg-player-surface border border-border text-muted rounded-chip text-body-sm"
              placeholder="예: Nova App"
            />
          </div>
          <div className="grid grid-cols-2 gap-stack">
            <div>
              <label className="block text-caption uppercase tracking-wider text-subtle mb-micro">
                이모지
              </label>
              <input
                required
                maxLength={2}
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-full px-stack py-stack-tight bg-player-surface border border-border text-muted rounded-chip text-body-sm"
              />
            </div>
            <div>
              <label className="block text-caption uppercase tracking-wider text-subtle mb-micro">
                주 채널
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full px-stack py-stack-tight bg-player-surface border border-border text-muted rounded-chip text-body-sm"
              >
                <option value="instagram">Instagram</option>
                <option value="x">X (Twitter)</option>
                <option value="threads">Threads</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-caption uppercase tracking-wider text-subtle mb-micro">
              dashboard 도메인
            </label>
            <input
              required
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full px-stack py-stack-tight bg-player-surface border border-border text-muted rounded-chip text-body-sm"
              placeholder="예: marketing-nova.example.com"
            />
          </div>
          <div className="flex justify-end gap-stack-tight pt-stack-tight">
            <button
              type="button"
              onClick={onClose}
              className="px-pad-inset py-stack-tight text-subtle text-body-sm hover:text-muted"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-pad-inset py-stack-tight bg-success text-status-fg text-body-sm font-semibold rounded-chip"
            >
              생성 명령 발행
            </button>
          </div>
        </form>
        {cmd && (
          <pre className="mt-pad-inset p-stack bg-player-surface border border-border rounded-chip text-caption text-success whitespace-pre-wrap break-all">
            {cmd}
            {"\n\n"}✓ 클립보드 복사됨. 터미널에 붙여넣기
          </pre>
        )}
      </div>
    </div>
  );
}
