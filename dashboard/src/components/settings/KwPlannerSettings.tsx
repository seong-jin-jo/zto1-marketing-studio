"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";

interface KwConfig {
  configured: boolean;
  clientId: string;
  clientSecret: string;
  customerId: string;
}

interface DatalabConfig {
  configured: boolean;
  clientId: string;
  clientSecret: string;
}

export function KwPlannerSettings() {
  const { data: kwCfg, mutate: mutateKw } = useSWR<KwConfig>("/api/kw-planner-config", fetcher);
  const { data: dlCfg, mutate: mutateDl } = useSWR<DatalabConfig>("/api/naver-datalab-config", fetcher);
  const { showToast } = useToast();

  const [kwForm, setKwForm] = useState<Partial<KwConfig>>({});
  const [dlForm, setDlForm] = useState<Partial<DatalabConfig>>({});
  const [editingKw, setEditingKw] = useState(false);
  const [editingDl, setEditingDl] = useState(false);
  const [showKwSecret, setShowKwSecret] = useState(false);
  const [showDlSecret, setShowDlSecret] = useState(false);

  const saveKw = async () => {
    try {
      await apiPost("/api/kw-planner-config", {
        clientId: kwForm.clientId || kwCfg?.clientId || "",
        clientSecret: kwForm.clientSecret || kwCfg?.clientSecret || "",
        customerId: kwForm.customerId || kwCfg?.customerId || "",
      });
      showToast("Keyword Planner config saved", "success");
      mutateKw();
      setEditingKw(false);
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  const saveDl = async () => {
    try {
      await apiPost("/api/naver-datalab-config", {
        clientId: dlForm.clientId || dlCfg?.clientId || "",
        clientSecret: dlForm.clientSecret || dlCfg?.clientSecret || "",
      });
      showToast("Naver Datalab config saved", "success");
      mutateDl();
      setEditingDl(false);
    } catch (e) {
      showToast(`Error: ${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="space-y-pad-inset">
      {/* Naver Search Ad (Keyword Planner) */}
      <div className="card p-pad-inset">
        <div className="flex items-center justify-between mb-stack">
          <div className="flex items-center gap-stack-tight">
            <span className="w-5 h-5 rounded-chip bg-success flex items-center justify-center text-caption font-bold text-status-fg">N</span>
            <span className="text-body-sm font-medium text-text">네이버 키워드 찾기</span>
          </div>
          <div className="flex items-center gap-stack-tight">
            <span className={`text-caption px-stack-tight py-micro rounded-pill ${kwCfg?.configured ? "bg-success/15 text-success" : "bg-surface-2 text-subtle"}`}>
              {kwCfg?.configured ? "Connected" : "Not set"}
            </span>
            {kwCfg?.configured && !editingKw && (
              <button onClick={() => setEditingKw(true)} className="text-caption text-accent hover:text-accent">수정</button>
            )}
          </div>
        </div>
        {(() => {
          const isEditable = !kwCfg?.configured || editingKw;
          const clientIdVal = kwForm.clientId ?? kwCfg?.clientId ?? "";
          const clientSecretVal = kwForm.clientSecret ?? kwCfg?.clientSecret ?? "";
          const customerIdVal = kwForm.customerId ?? kwCfg?.customerId ?? "";
          return (
            <div className="space-y-stack-tight">
              <div>
                <label className="text-caption text-subtle block mb-micro">API Key (Client ID)</label>
                <input
                  value={clientIdVal}
                  readOnly={!isEditable}
                  onChange={(e) => setKwForm({ ...kwForm, clientId: e.target.value })}
                  placeholder="API Key (Client ID)"
                  title={clientIdVal}
                  className={`w-full ${isEditable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight text-caption text-muted placeholder-gray-600 font-mono`}
                />
              </div>
              <div>
                <label className="text-caption text-subtle block mb-micro">Secret Key</label>
                <div className="relative">
                  <input
                    type={showKwSecret ? "text" : "password"}
                    value={clientSecretVal}
                    readOnly={!isEditable}
                    onChange={(e) => setKwForm({ ...kwForm, clientSecret: e.target.value })}
                    placeholder="보안 키"
                    title={clientSecretVal}
                    className={`w-full ${isEditable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight pr-wide text-caption text-muted placeholder-gray-600 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKwSecret(!showKwSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-caption text-subtle hover:text-muted"
                  >
                    {showKwSecret ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-caption text-subtle block mb-micro">Customer ID</label>
                <input
                  value={customerIdVal}
                  readOnly={!isEditable}
                  onChange={(e) => setKwForm({ ...kwForm, customerId: e.target.value })}
                  placeholder="고객 식별자"
                  title={customerIdVal}
                  className={`w-full ${isEditable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight text-caption text-muted placeholder-gray-600 font-mono`}
                />
              </div>
              <p className="text-caption text-subtle">searchad.naver.com &rarr; Tools &rarr; API &rarr; Credentials</p>
              {isEditable && (
                <div className="flex gap-stack-tight">
                  <button onClick={saveKw} className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">
                    {kwCfg?.configured ? "Update" : "Save"}
                  </button>
                  {editingKw && <button onClick={() => setEditingKw(false)} className="px-stack py-stack-tight text-caption bg-surface-2 text-muted rounded-chip">취소</button>}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Naver Datalab */}
      <div className="card p-pad-inset">
        <div className="flex items-center justify-between mb-stack">
          <div className="flex items-center gap-stack-tight">
            <span className="w-5 h-5 rounded-chip bg-success flex items-center justify-center text-caption font-bold text-status-fg">D</span>
            <span className="text-body-sm font-medium text-text">Naver Datalab</span>
          </div>
          <div className="flex items-center gap-stack-tight">
            <span className={`text-caption px-stack-tight py-micro rounded-pill ${dlCfg?.configured ? "bg-success/15 text-success" : "bg-surface-2 text-subtle"}`}>
              {dlCfg?.configured ? "Connected" : "Not set"}
            </span>
            {dlCfg?.configured && !editingDl && (
              <button onClick={() => setEditingDl(true)} className="text-caption text-accent hover:text-accent">수정</button>
            )}
          </div>
        </div>
        {(() => {
          const isEditable = !dlCfg?.configured || editingDl;
          const clientIdVal = dlForm.clientId ?? dlCfg?.clientId ?? "";
          const clientSecretVal = dlForm.clientSecret ?? dlCfg?.clientSecret ?? "";
          return (
            <div className="space-y-stack-tight">
              <div>
                <label className="text-caption text-subtle block mb-micro">Client ID</label>
                <input
                  value={clientIdVal}
                  readOnly={!isEditable}
                  onChange={(e) => setDlForm({ ...dlForm, clientId: e.target.value })}
                  placeholder="클라이언트 식별자"
                  title={clientIdVal}
                  className={`w-full ${isEditable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight text-caption text-muted placeholder-gray-600 font-mono`}
                />
              </div>
              <div>
                <label className="text-caption text-subtle block mb-micro">Client Secret</label>
                <div className="relative">
                  <input
                    type={showDlSecret ? "text" : "password"}
                    value={clientSecretVal}
                    readOnly={!isEditable}
                    onChange={(e) => setDlForm({ ...dlForm, clientSecret: e.target.value })}
                    placeholder="클라이언트 보안 키"
                    title={clientSecretVal}
                    className={`w-full ${isEditable ? "bg-surface" : "bg-surface/50 cursor-default"} border border-border rounded-chip px-stack py-stack-tight pr-wide text-caption text-muted placeholder-gray-600 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowDlSecret(!showDlSecret)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-caption text-subtle hover:text-muted"
                  >
                    {showDlSecret ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <p className="text-caption text-subtle">developers.naver.com &rarr; Application &rarr; Datalab</p>
              {isEditable && (
                <div className="flex gap-stack-tight">
                  <button onClick={saveDl} className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">
                    {dlCfg?.configured ? "Update" : "Save"}
                  </button>
                  {editingDl && <button onClick={() => setEditingDl(false)} className="px-stack py-stack-tight text-caption bg-surface-2 text-muted rounded-chip">취소</button>}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
