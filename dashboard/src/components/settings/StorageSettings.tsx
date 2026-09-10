"use client";

import { useState } from "react";
import { useR2Config } from "@/hooks/useChannelConfig";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

function CredField({ id, label, isSecret, value, editable, savedHint }: {
  id: string; label: string; isSecret?: boolean; value: string; editable: boolean; savedHint?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-caption text-subtle block mb-micro">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isSecret && !show ? "password" : "text"}
          defaultValue={value}
          placeholder={savedHint ? "저장돼 있습니다. 바꿀 때만 입력하세요" : label}
          readOnly={!editable}
          className={`w-full ${editable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight pr-wide text-caption text-muted placeholder-gray-600 font-mono`}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-caption text-subtle hover:text-muted"
          >
            {show ? "가리기" : "보기"}
          </button>
        )}
      </div>
    </div>
  );
}

export function StorageSettings() {
  const { data, mutate } = useR2Config();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 서버는 자격증명 원문을 내려주지 않는다. 설정 여부(boolean)와 비밀이 아닌 값만 받는다.
  const r2 = (data || {}) as {
    bucket?: string; endpoint?: string;
    accessKeyIdSet?: boolean; secretAccessKeySet?: boolean;
  };
  const r2Connected = !!(r2.bucket && r2.endpoint && r2.accessKeyIdSet && r2.secretAccessKeySet);
  const editable = editing || !r2Connected;

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      accessKeyId: (document.getElementById("r2-access-key") as HTMLInputElement)?.value?.trim(),
      secretAccessKey: (document.getElementById("r2-secret-key") as HTMLInputElement)?.value?.trim(),
      bucket: (document.getElementById("r2-bucket") as HTMLInputElement)?.value?.trim(),
      endpoint: (document.getElementById("r2-endpoint") as HTMLInputElement)?.value?.trim(),
    };
    try {
      const r = await apiPost<{ ok: boolean }>("/api/r2-config", payload);
      if (r?.ok) {
        showToast("R2 저장소 설정을 저장했습니다", "success");
        setEditing(false);
        mutate();
      }
    } catch (e) { showToast((e as Error).message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <p className="text-caption text-subtle mb-pad-inset">Instagram, Threads 등 이미지 발행 시 공용 업로드 저장소. 모든 채널에서 사용됩니다.</p>
      <div className="card p-stack-section">
        <div className="flex items-center justify-between mb-stack">
          <h3 className="text-body-sm font-medium text-muted">Cloudflare R2</h3>
          <span className={`text-caption px-stack-tight py-micro rounded-chip ${r2Connected ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
            {r2Connected ? "연결됨" : "설정 안 됨"}
          </span>
        </div>
        <details className="mb-stack text-caption">
          <summary className="text-accent hover:text-accent cursor-pointer">R2 설정 방법</summary>
          <div className="mt-stack-tight p-stack rounded-chip bg-surface/50 text-subtle space-y-stack-tight">
            <p className="font-medium text-subtle">1. 버킷 생성</p>
            <p className="pl-stack">Cloudflare 대시보드 &gt; R2 &gt; 버킷 만들기</p>
            <p className="font-medium text-subtle">2. 비공개 유지</p>
            <p className="pl-stack">공개 개발 URL과 사용자 도메인은 켜지 않습니다. 이미지는 우리 서명 배달 주소로만 제공합니다.</p>
            <p className="font-medium text-subtle">3. API 자격증명</p>
            <p className="pl-stack">R2 개요 &gt; 계정 세부 정보 &gt; S3 API &gt; 관리 &gt; 계정 API 토큰 만들기</p>
            <p className="pl-stack">객체 읽기와 쓰기 권한을 선택하고 사용할 버킷을 지정합니다.</p>
            <p className="pl-stack text-warning">시크릿 액세스 키는 생성 시 한 번만 표시됩니다.</p>
            <p className="font-medium text-subtle">4. 아래 입력</p>
            <p className="pl-stack">액세스 키 ID, 시크릿 액세스 키, 버킷 이름, S3 엔드포인트</p>
          </div>
        </details>
        <div className="flex items-center justify-between mb-stack">
          <span className="text-caption text-subtle">자격증명</span>
          {r2Connected && !editing && (
            <button onClick={() => setEditing(true)} className="text-caption text-accent hover:text-accent">수정</button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-stack">
          <CredField id="r2-access-key" label="액세스 키 ID" value="" editable={editable} savedHint={r2.accessKeyIdSet} />
          <CredField id="r2-secret-key" label="시크릿 액세스 키" isSecret value="" editable={editable} savedHint={r2.secretAccessKeySet} />
          <CredField id="r2-bucket" label="버킷 이름" value={r2.bucket || ""} editable={editable} />
          <CredField id="r2-endpoint" label="S3 엔드포인트" value={r2.endpoint || ""} editable={editable} />
        </div>
        {editable && (
          <div className="flex gap-stack-tight mt-pad-inset">
            <button onClick={handleSave} disabled={saving} className="flex-1 py-stack-tight bg-accent text-accent-fg text-body-sm rounded-chip hover:bg-accent-hover disabled:opacity-50">
              {saving ? "저장하는 중" : r2Connected ? "수정 저장" : "연결하기"}
            </button>
            {r2Connected && editing && (
              <button onClick={() => setEditing(false)} className="px-pad-inset py-stack-tight bg-surface-2 text-muted text-body-sm rounded-chip hover:bg-surface-2">취소</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
