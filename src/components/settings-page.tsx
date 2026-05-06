"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Settings, Zap, CheckCircle2, XCircle, Loader2,
  Eye, EyeOff, ExternalLink, ChevronDown, RefreshCw,
  Cpu, Globe, Key, BookOpen, AlertCircle, Save,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ─── Provider presets ────────────────────────────────────────────────────────

interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
  description: string;
  color: string;
  models: string[];
  requiresKey: boolean;
}

const PROVIDERS: ProviderPreset[] = [
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:7b",
    apiKeyPlaceholder: "ollama",
    docsUrl: "https://ollama.com",
    description: "本地运行的开源 LLM，无需 API Key",
    color: "from-emerald-500 to-teal-600",
    models: ["qwen2.5:7b", "qwen2.5:14b", "llama3.2:3b", "llama3.1:8b", "deepseek-r1:8b", "mistral:7b", "gemma2:9b"],
    requiresKey: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com",
    description: "OpenAI 官方 API",
    color: "from-green-500 to-emerald-600",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    requiresKey: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    apiKeyPlaceholder: "sk-...",
    docsUrl: "https://platform.deepseek.com",
    description: "DeepSeek API，支持 V3 / R1",
    color: "from-blue-500 to-indigo-600",
    models: ["deepseek-chat", "deepseek-reasoner"],
    requiresKey: true,
  },
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    defaultModel: "MiniMax-M2.7",
    apiKeyPlaceholder: "sk-...",
    docsUrl: "https://www.minimaxi.com",
    description: "MiniMax 海螺 AI 大模型",
    color: "from-pink-500 to-rose-600",
    models: ["MiniMax-M2.7"],
    requiresKey: true,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    apiKeyPlaceholder: "lm-studio",
    docsUrl: "https://lmstudio.ai",
    description: "LM Studio 本地服务器",
    color: "from-purple-500 to-violet-600",
    models: ["local-model"],
    requiresKey: false,
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    apiKeyPlaceholder: "sk-...",
    docsUrl: "https://siliconflow.cn",
    description: "国内高性价比 API，支持 Qwen/DeepSeek 等",
    color: "from-orange-500 to-amber-600",
    models: ["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1"],
    requiresKey: true,
  },
  {
    id: "custom",
    label: "自定义",
    baseUrl: "",
    defaultModel: "",
    apiKeyPlaceholder: "API Key (如不需要则留空)",
    docsUrl: "",
    description: "任意 OpenAI 兼容接口",
    color: "from-slate-500 to-gray-600",
    models: [],
    requiresKey: false,
  },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type TestStatus = "idle" | "testing" | "ok" | "fail";

interface SavedSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  label?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState("ollama");
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
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const preset = PROVIDERS.find((p) => p.id === selectedProvider) ?? PROVIDERS[0];

  // Load current settings from server
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json: { success: boolean; data: SavedSettings }) => {
        if (json.success) {
          const s = json.data;
          setSelectedProvider(s.provider || "ollama");
          setBaseUrl(s.baseUrl || "");
          setModel(s.model || "");
          setApiKey(s.apiKey || ""); // masked
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSettings(false));
  }, []);

  // When provider changes, apply preset defaults
  const applyPreset = useCallback((p: ProviderPreset) => {
    setSelectedProvider(p.id);
    if (p.baseUrl) setBaseUrl(p.baseUrl);
    if (p.defaultModel) setModel(p.defaultModel);
    if (!p.requiresKey) setApiKey(p.apiKeyPlaceholder);
    setTestStatus("idle");
    setTestError("");
    setAvailableModels([]);
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
          provider: selectedProvider,
          baseUrl,
          apiKey,
          model,
          label: preset.label,
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          AI 提供商设置
        </h1>
        <p className="text-muted-foreground mt-1">
          配置 AI 后端 — 支持 Ollama 本地部署、OpenAI、DeepSeek 或任意 OpenAI 兼容接口
        </p>
      </div>

      {/* Provider Grid */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">选择提供商</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`
                relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center
                transition-all duration-200 hover:scale-105 hover:shadow-md
                ${selectedProvider === p.id
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/50"
                }
              `}
            >
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center`}>
                <Cpu className="h-4 w-4 text-white" />
              </div>
              <span className="text-xs font-medium leading-tight">{p.label}</span>
              {selectedProvider === p.id && (
                <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
        {preset.description && (
          <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {preset.description}
            {preset.docsUrl && (
              <a
                href={preset.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                文档 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>
        )}
      </div>

      {/* Config Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            接口配置
          </CardTitle>
          <CardDescription>
            所有字段均保存在服务器本地的 <code className="text-xs bg-muted px-1 py-0.5 rounded">data/settings.json</code>，不会上传到任何第三方
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Base URL */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              API Base URL
            </label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-sm"
              id="llm-base-url"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
              API Key
              {!preset.requiresKey && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">可选</Badge>
              )}
            </label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={preset.apiKeyPlaceholder}
                className="font-mono text-sm pr-10"
                id="llm-api-key"
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              默认模型
            </label>
            <div className="relative">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="模型名称，例如 qwen2.5:7b"
                className="font-mono text-sm pr-8"
                id="llm-model"
                onFocus={() => setShowModelDropdown(true)}
                onBlur={() => setTimeout(() => setShowModelDropdown(false), 200)}
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />

              {/* Dropdown: preset models + discovered models */}
              {showModelDropdown && (preset.models.length > 0 || availableModels.length > 0) && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-lg border bg-popover shadow-xl overflow-hidden">
                  {availableModels.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/30">
                        已检测到的模型
                      </div>
                      {availableModels.map((m) => (
                        <button
                          key={m}
                          onMouseDown={() => setModel(m)}
                          className="w-full text-left px-3 py-2 text-sm font-mono hover:bg-accent transition-colors flex items-center justify-between"
                        >
                          {m}
                          <Badge variant="secondary" className="text-[10px]">已安装</Badge>
                        </button>
                      ))}
                    </>
                  )}
                  {preset.models.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b bg-muted/30">
                        推荐模型
                      </div>
                      {preset.models.filter((m) => !availableModels.includes(m)).map((m) => (
                        <button
                          key={m}
                          onMouseDown={() => setModel(m)}
                          className="w-full text-left px-3 py-2 text-sm font-mono hover:bg-accent transition-colors"
                        >
                          {m}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testStatus === "testing" || !baseUrl}
              id="btn-test-connection"
              className="gap-2"
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
              id="btn-save-settings"
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "已保存！" : "保存配置"}
            </Button>

            {/* Test status badge */}
            {testStatus === "ok" && (
              <div className="ml-auto flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                连接成功
                {availableModels.length > 0 && (
                  <span className="text-muted-foreground font-normal">
                    · {availableModels.length} 个模型可用
                  </span>
                )}
              </div>
            )}
            {testStatus === "fail" && (
              <div className="ml-auto flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
                <XCircle className="h-4 w-4" />
                <span className="font-medium">连接失败</span>
              </div>
            )}
          </div>

          {/* Error detail */}
          {testStatus === "fail" && testError && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400 font-mono break-all">
              {testError}
            </div>
          )}

          {/* Available models list */}
          {testStatus === "ok" && availableModels.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                后端返回的可用模型（点击快速选择）
              </p>
              <div className="flex flex-wrap gap-2">
                {availableModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    className={`
                      text-xs font-mono px-2.5 py-1 rounded-md border transition-all
                      ${model === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:border-primary/50 hover:bg-accent"
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

      {/* Quick Tips */}
      <Card className="bg-gradient-to-br from-muted/30 to-muted/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            快速上手
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="font-medium text-foreground text-xs uppercase tracking-wide">本地 Ollama</p>
              <div className="font-mono text-xs space-y-1 bg-muted rounded-lg p-3">
                <p># 安装模型</p>
                <p className="text-primary">ollama pull qwen2.5:7b</p>
                <p className="text-primary">ollama pull deepseek-r1:8b</p>
                <p className="mt-1"># 启动服务</p>
                <p className="text-primary">ollama serve</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="font-medium text-foreground text-xs uppercase tracking-wide">OpenAI 兼容测试</p>
              <div className="font-mono text-xs space-y-1 bg-muted rounded-lg p-3">
                <p># 用本服务器作 OpenAI 代理</p>
                <p className="text-primary">Base URL: http://localhost:5000/v1</p>
                <p className="text-primary">API Key: {"<任意值>"}</p>
                <p className="mt-1"># 健康检查</p>
                <p className="text-primary">GET /v1/health</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
