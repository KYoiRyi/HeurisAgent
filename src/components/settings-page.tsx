"use client";

import React, { useState, useEffect } from "react";
import {
  Settings, Zap, CheckCircle2, XCircle, Loader2,
  Eye, EyeOff, Globe, Key, BookOpen, Save, RefreshCw
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TestStatus = "idle" | "testing" | "ok" | "fail";

interface SavedSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Load current settings from server
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json: { success: boolean; data: SavedSettings }) => {
        if (json.success) {
          const s = json.data;
          setBaseUrl(s.baseUrl || "");
          setModel(s.model || "");
          setApiKey(s.apiKey || "");
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSettings(false));
  }, []);

  const handleTest = async () => {
    setTestStatus("testing");
    setTestError("");
    setAvailableModels([]);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", baseUrl, apiKey, model }),
      });
      const json = await res.json();
      if (json.success) {
        setTestStatus("ok");
        setAvailableModels(json.models ?? []);
      } else {
        setTestStatus("fail");
        setTestError(json.error || "连接失败");
      }
    } catch (err) {
      setTestStatus("fail");
      setTestError(String(err));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "custom", // simplified, let backend auto-resolve provider from URL
          baseUrl,
          apiKey,
          model,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 mt-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-7 w-7 text-primary" />
          AI 提供商设置
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          配置底层大模型接口。支持 OpenAI 格式的代理地址 (如 Ollama, DeepSeek) 以及官方 API。
        </p>
      </div>

      <Card className="shadow-none border-border">
        <CardHeader className="bg-muted/30 pb-4 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            接口配置
          </CardTitle>
          <CardDescription>
            配置保存在服务器本地的 data/settings.json 中
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {/* Base URL */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-muted-foreground" />
              API Base URL
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="例如: http://localhost:11434/v1 或 https://api.openai.com/v1"
              className="font-mono text-sm"
            />
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Key className="h-4 w-4 text-muted-foreground" />
              API Key
            </label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-... (本地无验证可留空或填任意值)"
                className="font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              默认模型
            </label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如: qwen2.5:7b, gpt-4o, deepseek-chat"
              className="font-mono text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={testStatus === "testing" || !baseUrl}
              className="gap-2 w-32"
            >
              {testStatus === "testing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              测试连接
            </Button>

            <Button
              onClick={handleSave}
              disabled={saving || !baseUrl || !model}
              className="gap-2 w-32"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "已保存" : "保存配置"}
            </Button>

            {/* Test status badge */}
            {testStatus === "ok" && (
              <div className="ml-auto flex items-center gap-1.5 text-sm text-emerald-600 font-medium bg-emerald-500/10 px-3 py-1.5 rounded-full">
                <CheckCircle2 className="h-4 w-4" />
                连接成功
              </div>
            )}
            {testStatus === "fail" && (
              <div className="ml-auto flex items-center gap-1.5 text-sm text-red-600 font-medium bg-red-500/10 px-3 py-1.5 rounded-full">
                <XCircle className="h-4 w-4" />
                连接失败
              </div>
            )}
          </div>

          {/* Error detail */}
          {testStatus === "fail" && testError && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 font-mono break-all">
              {testError}
            </div>
          )}

          {/* Available models list */}
          {testStatus === "ok" && availableModels.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-4 mt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                <RefreshCw className="h-3.5 w-3.5" />
                检测到的后端模型 (点击应用)
              </p>
              <div className="flex flex-wrap gap-2">
                {availableModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`
                      text-xs font-mono px-3 py-1.5 rounded-full border transition-colors
                      ${model === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:border-primary/50"
                      }
                    `}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
