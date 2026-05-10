"use client";

import React, { useState, useEffect } from "react";
import {
  Settings, Zap, CheckCircle2, XCircle, Loader2,
  Eye, EyeOff, Globe, Key, BookOpen, Save, RefreshCw, Bot
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type TestStatus = "idle" | "testing" | "ok" | "fail";

interface SavedSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"coze" | "custom">("coze");
  
  // Custom states
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  // Coze states
  const [cozeKey, setCozeKey] = useState("");
  const [cozeBotId, setCozeBotId] = useState("");

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
          
          if (s.baseUrl?.includes("coze")) {
            setActiveTab("coze");
            setCozeKey(s.apiKey || "");
            setCozeBotId(s.model || "");
          } else {
            setActiveTab("custom");
          }
          
          setBaseUrl(s.baseUrl || "");
          setModel(s.model || "");
          setApiKey(s.apiKey || "");
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSettings(false));
  }, []);

  const getEffectiveConfig = () => {
    if (activeTab === "coze") {
      return {
        provider: "coze",
        baseUrl: "https://api.coze.cn/v1",
        apiKey: cozeKey,
        model: cozeBotId
      };
    }
    return {
      provider: "custom",
      baseUrl,
      apiKey,
      model
    };
  };

  const handleTest = async () => {
    setTestStatus("testing");
    setTestError("");
    setAvailableModels([]);
    
    const config = getEffectiveConfig();
    
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", ...config }),
      });
      const json = await res.json();
      if (json.success) {
        setTestStatus("ok");
        if (activeTab === "custom") {
          setAvailableModels(json.models ?? []);
        }
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
    const config = getEffectiveConfig();
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
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

  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!window.confirm("危险操作警告！\n此操作将永久删除所有本地记忆、文档、错题、对话和设定，确认执行吗？")) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch("/api/settings/reset", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        localStorage.clear();
        window.location.href = "/";
      } else {
        alert("清空失败: " + json.error);
      }
    } catch (err) {
      alert("清空失败: " + String(err));
    } finally {
      setResetting(false);
    }
  };

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isValid = activeTab === "coze" ? !!cozeBotId : !!baseUrl && !!model;

  return (
    <div className="max-w-3xl mx-auto space-y-6 mt-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-7 w-7 text-primary" />
          AI 提供商设置
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          配置底层大模型接口。优先推荐使用 Coze 官方接口，并无缝融入 pi-agents 框架。
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
        <CardContent className="p-0">
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setTestStatus("idle"); }} className="w-full">
            <div className="px-6 pt-6 pb-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="coze" className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Coze API (默认推荐)
                </TabsTrigger>
                <TabsTrigger value="custom" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  自定义 API (兼容 OpenAI)
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="coze" className="space-y-6 p-6 mt-0">
              <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-4 mb-4">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  当前处于 Coze 模式。系统会自动将配置融入 pi-agents 框架，底层自动调用 <b>https://api.coze.cn/v1</b> 端点。<br/>
                  * 若系统已配置 <code>COZE_API_KEY</code> 环境变量，API Key 可留空。
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  Coze API Token (PAT)
                </label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={cozeKey}
                    onChange={(e) => setCozeKey(e.target.value)}
                    placeholder="pat_... (若已配置环境变量可留空)"
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

              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  Coze Bot ID
                </label>
                <Input
                  value={cozeBotId}
                  onChange={(e) => setCozeBotId(e.target.value)}
                  placeholder="例如: 739281... (必填)"
                  className="font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-6 p-6 mt-0">
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
            </TabsContent>

            {/* Actions (Shared) */}
            <div className="px-6 pb-6">
              <div className="flex items-center gap-3 pt-4 border-t">
                <Button
                  variant="secondary"
                  onClick={handleTest}
                  disabled={testStatus === "testing" || !isValid}
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
                  disabled={saving || !isValid}
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

              {testStatus === "fail" && testError && (
                <div className="mt-4 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 font-mono break-all">
                  {testError}
                </div>
              )}

              {activeTab === "custom" && testStatus === "ok" && availableModels.length > 0 && (
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
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="shadow-none border-red-500/20 bg-red-500/5 mt-8">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            危险区域 (Danger Zone)
          </CardTitle>
          <CardDescription className="text-red-600/80">
            清空所有数据库表和文档，恢复系统至刚初始化的“干净白板”状态。此操作不可逆！
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={handleReset}
            disabled={resetting}
            className="gap-2"
          >
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            一键清空数据库
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
