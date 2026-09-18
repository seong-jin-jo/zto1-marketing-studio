"use client";

import { useEffect, useRef, useState } from "react";
import { isSecretConfigKey } from "@/lib/secret-mask";

interface CredFieldProps {
  id: string;
  label: string;
  desc?: string;
  isSecret?: boolean;
  value: string;
  editable: boolean;
  onChange: (val: string) => void;
}

function CredField({ id, label, desc, isSecret = false, value, editable, onChange }: CredFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="text-caption text-subtle block mb-micro">
        {label} {desc && <span className="text-subtle">{desc}</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isSecret && !visible ? "password" : "text"}
          value={value}
          placeholder={label}
          readOnly={!editable}
          onChange={(e) => onChange(e.target.value)}
          title={isSecret && value ? "저장된 연결 정보" : value}
          className={`min-h-control-touch w-full ${editable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight pr-wide text-caption text-muted placeholder-subtle font-mono`}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="ds-touch-target absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-caption text-subtle hover:text-muted"
          >
            {visible ? "숨기기" : "보기"}
          </button>
        )}
      </div>
    </div>
  );
}

interface CredFieldGroup {
  title: string;
  fieldIndices: number[];
}

interface CredentialFormProps {
  channelKey: string;
  fields: string[];
  labels: string[];
  currentKeys: Record<string, string>;
  onSave: (keys: Record<string, string>) => Promise<void>;
  title?: string;
  badge?: { text: string; color: string };
  connectLabel?: string;
  submitLabel?: string;
  /** 연결됨 표시 — OAuth 연결(토큰이 integrations에 있어 keys가 비어도)이나 키 저장으로 연결된 상태. */
  connected?: boolean;
  /** Group fields with section headers and borders (e.g., X's Consumer Keys / Access Token) */
  fieldGroups?: CredFieldGroup[];
}

export function CredentialForm({ channelKey, fields, labels, currentKeys, onSave, title, badge, connectLabel, submitLabel, connected, fieldGroups }: CredentialFormProps) {
  const hasKeys = Object.values(currentKeys).some((v) => v);
  const [editing, setEditing] = useState(!hasKeys);
  const dirtyRef = useRef(false);
  const lastChannelRef = useRef(channelKey);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    fields.forEach((f) => (v[f] = currentKeys[f] || ""));
    return v;
  });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const keySignature = fields.map((field) => currentKeys[field] || "").join("\u0000");

  // SWR 설정은 폼 첫 렌더 뒤에 도착한다. 서버 값이 바뀌어도 현재 입력을 덮어쓰지 않되,
  // 아직 손대지 않은 폼은 저장된 마스킹 값과 편집 상태를 따라가야 한다.
  useEffect(() => {
    const channelChanged = lastChannelRef.current !== channelKey;
    lastChannelRef.current = channelKey;
    if (dirtyRef.current && !channelChanged) return;
    dirtyRef.current = false;
    const next: Record<string, string> = {};
    fields.forEach((field) => { next[field] = currentKeys[field] || ""; });
    setValues(next);
    setEditing(!Object.values(next).some(Boolean));
  }, [channelKey, keySignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(values);
      dirtyRef.current = false;
      setEditing(false);
      setSaveError(false);
    } catch {
      // 호출 화면이 구체적인 사유를 알리고, 폼은 입력값을 보존해 재시도하게 한다.
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const renderField = (fieldIdx: number) => {
    const f = fields[fieldIdx];
    return (
      <CredField
        key={f}
        id={`ch-${channelKey}-${f}`}
        label={labels[fieldIdx]}
        isSecret={isSecretConfigKey(f)}
        value={values[f] || ""}
        editable={editing}
        onChange={(val) => {
          dirtyRef.current = true;
          setValues((prev) => ({ ...prev, [f]: val }));
        }}
      />
    );
  };

  return (
    <div>
      {saveError && <p role="alert" className="mb-stack text-caption text-warning">연결 정보를 저장하지 못했습니다. 입력값을 확인하고 다시 시도해 주세요.</p>}
      <div className="flex items-center justify-between mb-stack">
        <h3 className="text-body-sm font-medium text-muted">{title || "연결 정보"}</h3>
        <div className="flex items-center gap-stack-tight">
          {connected && (
            <span className="text-caption px-stack-tight py-micro rounded-pill bg-success/15 text-success border border-success/30">
              연결됨
            </span>
          )}
          {badge && (
            <span className="text-caption px-stack-tight py-micro rounded-chip bg-accent-soft text-accent border border-accent/30">
              {badge.text}
            </span>
          )}
          {hasKeys && !editing && (
            <button onClick={() => setEditing(true)} className="inline-flex items-center min-h-control-touch text-caption text-accent hover:text-accent">
              연결 정보 수정
            </button>
          )}
        </div>
      </div>
      {fieldGroups ? (
        <div className="space-y-pad-inset">
          {fieldGroups.map((group, gi) => (
            <div key={gi} className={gi < fieldGroups.length - 1 ? "border-b border-border/50 pb-stack" : ""}>
              <p className="text-caption text-subtle uppercase tracking-wide mb-stack-tight">{group.title}</p>
              {group.fieldIndices.map((idx, j) => (
                <div key={fields[idx]} className={j > 0 ? "mt-stack-tight" : ""}>
                  {renderField(idx)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-stack">
          {fields.map((f, i) => renderField(i))}
        </div>
      )}
      {editing && (
        <div className="flex gap-stack-tight mt-pad-inset">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 min-h-control-touch py-stack-tight bg-accent text-accent-fg text-body-sm rounded-chip hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "확인 중..." : submitLabel || (hasKeys ? "수정 내용 저장" : (connectLabel || "연결"))}
          </button>
          {hasKeys && (
            <button
              onClick={() => {
                dirtyRef.current = false;
                setEditing(false);
                const v: Record<string, string> = {};
                fields.forEach((f) => (v[f] = currentKeys[f] || ""));
                setValues(v);
              }}
              className="px-pad-inset py-stack-tight min-h-control-touch bg-surface-2 text-muted text-body-sm rounded-chip hover:bg-surface-2"
            >
              취소
            </button>
          )}
        </div>
      )}
    </div>
  );
}
