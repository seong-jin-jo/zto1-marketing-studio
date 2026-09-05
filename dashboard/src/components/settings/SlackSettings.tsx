"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

interface SlackConfig {
  configured: boolean;
  webhookUrl: string;
}

interface SlackTemplate {
  template: string;
}

interface SlackReportPreview {
  report: string;
  variables: Record<string, string | number>;
}

export function SlackSettings() {
  const { data: config, mutate: mutateConfig } = useSWR<SlackConfig>("/api/slack-config", fetcher);
  const { data: tmpl, mutate: mutateTmpl } = useSWR<SlackTemplate>("/api/slack-template", fetcher);
  const { showToast } = useToast();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [template, setTemplate] = useState("");
  const [editingTmpl, setEditingTmpl] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const saveWebhook = async () => {
    try {
      await apiPost("/api/slack-config", { webhookUrl });
      showToast("Slack webhook saved", "success");
      mutateConfig();
      setEditing(false);
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  const testWebhook = async () => {
    try {
      await apiPost("/api/slack-test");
      showToast("Test message sent", "success");
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  const saveTemplate = async () => {
    try {
      await apiPost("/api/slack-template", { template });
      showToast("Template saved", "success");
      mutateTmpl();
      setEditingTmpl(false);
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  const loadPreview = async () => {
    try {
      const res = await fetch("/api/slack-report-preview");
      const data: SlackReportPreview = await res.json();
      setPreview(data.report);
    } catch {
      setPreview("Failed to generate preview");
    }
  };

  const sendReport = async () => {
    setSending(true);
    try {
      await apiPost("/api/slack-send-custom");
      showToast("Report sent to Slack", "success");
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-pad-inset">
      <h3 className="text-body-sm font-medium text-text">Slack 알림</h3>

      {/* Webhook Config */}
      <div className="card p-pad-inset">
        <div className="flex items-center justify-between mb-stack">
          <span className="text-caption text-subtle">웹훅 주소</span>
          <div className="flex items-center gap-stack-tight">
            <span className={`text-caption px-stack-tight py-micro rounded-pill ${config?.configured ? "bg-success/15 text-success" : "bg-surface-2 text-subtle"}`}>
              {config?.configured ? "Connected" : "Not set"}
            </span>
            {config?.configured && !editing && (
              <button onClick={() => setEditing(true)} className="text-caption text-accent hover:text-accent">수정</button>
            )}
          </div>
        </div>
        <div className="space-y-stack-tight">
          <div className="relative">
            <input
              type={showWebhook ? "text" : "password"}
              value={webhookUrl || config?.webhookUrl || ""}
              readOnly={!(!config?.configured || editing)}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              title={webhookUrl || config?.webhookUrl || ""}
              className={`w-full ${!config?.configured || editing ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight pr-wide text-caption text-muted placeholder-gray-600 font-mono`}
            />
            <button
              type="button"
              onClick={() => setShowWebhook(!showWebhook)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-caption text-subtle hover:text-muted"
            >
              {showWebhook ? "Hide" : "Show"}
            </button>
          </div>
          {!config?.configured || editing ? (
            <div className="flex gap-stack-tight">
              <button onClick={saveWebhook} className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">
                {config?.configured ? "Update" : "Save"}
              </button>
              {editing && (
                <button onClick={() => setEditing(false)} className="px-stack py-stack-tight text-caption bg-surface-2 text-muted rounded-chip">취소</button>
              )}
            </div>
          ) : (
            <div className="flex gap-stack-tight">
              <button onClick={testWebhook} className="px-stack py-stack-tight text-caption bg-success text-status-fg rounded-chip hover:bg-success">테스트</button>
            </div>
          )}
        </div>
      </div>

      {/* Template */}
      <div className="card p-pad-inset">
        <div className="flex items-center justify-between mb-stack">
          <span className="text-caption text-subtle">보고서 양식</span>
          {!editingTmpl && (
            <button onClick={() => { setTemplate(tmpl?.template || ""); setEditingTmpl(true); }} className="text-caption text-accent hover:text-accent">수정</button>
          )}
        </div>
        {editingTmpl ? (
          <div className="space-y-stack-tight">
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={10}
              className="w-full bg-surface-2 text-muted text-caption p-stack rounded-chip border border-border font-mono"
            />
            <p className="text-caption text-subtle">
              Variables: {"{blog_articles}"}, {"{blog_views}"}, {"{blog_delta}"}, {"{blog_top}"},
              {"{gsc_clicks}"}, {"{gsc_impressions}"}, {"{gsc_ctr}"}, {"{gsc_top_keywords}"},
              {"{ga_sessions}"}, {"{ga_pageviews}"}, {"{dashboard_url}"}
            </p>
            <div className="flex gap-stack-tight">
              <button onClick={saveTemplate} className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">저장</button>
              <button onClick={() => setEditingTmpl(false)} className="px-stack py-stack-tight text-caption bg-surface-2 text-muted rounded-chip">취소</button>
            </div>
          </div>
        ) : (
          <pre className="text-caption text-subtle whitespace-pre-wrap max-h-32 overflow-auto">{tmpl?.template?.slice(0, 300)}...</pre>
        )}
      </div>

      {/* Preview & Send */}
      {config?.configured && (
        <div className="card p-pad-inset">
          <div className="flex items-center gap-stack-tight mb-stack">
            <span className="text-caption text-subtle">보고서 미리 보기와 보내기</span>
          </div>
          <div className="flex gap-stack-tight mb-stack">
            <button onClick={loadPreview} className="px-stack py-stack-tight text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">보고서 미리보기</button>
            <button onClick={sendReport} disabled={sending} className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover disabled:opacity-50">
              {sending ? "Sending..." : "Send to Slack"}
            </button>
          </div>
          {preview && (
            <pre className="bg-surface-2 text-muted text-caption p-stack rounded-chip whitespace-pre-wrap max-h-48 overflow-auto">{preview}</pre>
          )}
        </div>
      )}
    </div>
  );
}
