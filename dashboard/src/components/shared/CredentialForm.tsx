"use client";

import { useState } from "react";
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
      <label className="text-caption text-subtle block mb-micro">
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
          className={`w-full ${editable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight pr-wide text-caption text-muted placeholder-subtle font-mono`}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-caption text-subtle hover:text-muted"
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
  /** 연결됨 표시 — OAuth 연결(토큰이 integrations에 있어 keys가 비어도)이나 키 저장으로 연결된 상태. */
  connected?: boolean;
  /** Group fields with section headers and borders (e.g., X's Consumer Keys / Access Token) */
  fieldGroups?: CredFieldGroup[];
}

export function CredentialForm({ channelKey, fields, labels, currentKeys, onSave, title, badge, connectLabel, connected, fieldGroups }: CredentialFormProps) {
  const hasKeys = Object.values(currentKeys).some((v) => v);
  const [editing, setEditing] = useState(!hasKeys);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    fields.forEach((f) => (v[f] = currentKeys[f] || ""));
    return v;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(values);
      setEditing(false);
    } finally {
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
        onChange={(val) => setValues((prev) => ({ ...prev, [f]: val }))}
      />
    );
  };

  return (
    <div>
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
            <button onClick={() => setEditing(true)} className="text-caption text-accent hover:text-accent">
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
            className="flex-1 py-stack-tight bg-accent text-accent-fg text-body-sm rounded-chip hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "확인 중..." : hasKeys ? "수정 내용 저장" : (connectLabel || "연결")}
          </button>
          {hasKeys && (
            <button
              onClick={() => {
                setEditing(false);
                const v: Record<string, string> = {};
                fields.forEach((f) => (v[f] = currentKeys[f] || ""));
                setValues(v);
              }}
              className="px-pad-inset py-stack-tight bg-surface-2 text-muted text-body-sm rounded-chip hover:bg-surface-2"
            >
              취소
            </button>
          )}
        </div>
      )}
    </div>
  );
}
