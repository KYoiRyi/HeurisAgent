"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquareText, Send, Bot, User, Sparkles,
  Lightbulb, Loader2, FileText, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LiveComponent {
  html: string;
  css?: string;
  js?: string;
  description: string;
}

interface Message {
  id: string;
  role: "student" | "agent";
  content: string;
  timestamp: Date;
  type?: string;
  liveComponent?: LiveComponent | null;
}

interface ClassroomResource {
  id: string;
  title: string;
  subject: string;
  category: string;
  content: string | null;
  file_url?: string | null;
  tags?: string[];
  difficulty?: string;
}

export default function ClassroomPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [classroomResources, setClassroomResources] = useState<ClassroomResource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchClassroomResources = useCallback(async () => {
    setResourcesLoading(true);
    try {
      const res = await fetch("/api/resources");
      const json = await res.json();
      if (json.success) {
        const docs = (json.data || []).filter((resource: ClassroomResource) =>
          resource.category === "document" || resource.category === "note"
        );
        setClassroomResources(docs);
        setSelectedResourceId((current) =>
          docs.some((resource: ClassroomResource) => resource.id === current)
            ? current
            : docs[0]?.id ?? null
        );
      }
    } catch (err) {
      console.error("Fetch classroom resources error:", err);
    } finally {
      setResourcesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClassroomResources();
  }, [fetchClassroomResources]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleCreateSession = async () => {
    const fallbackId = "local-" + Date.now().toString();
    setSessionId(fallbackId);
    return fallbackId;
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      activeSessionId = await handleCreateSession();
      if (!activeSessionId) {
        console.error("Failed to create session automatically");
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "student",
      content: inputValue.trim(),
      timestamp: new Date(),
      type: "question",
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsStreaming(true);

    const agentMessageId = (Date.now() + 1).toString();
    const agentMessage: Message = {
      id: agentMessageId,
      role: "agent",
      content: "",
      timestamp: new Date(),
      type: "answer",
    };
    setMessages((prev) => [...prev, agentMessage]);

    try {
      const response = await fetch("/api/classroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: activeSessionId,
        }),
      });

      if (!response.ok) throw new Error("请求失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("无法读取响应流");

      let buffer = "";
      let fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            try {
              const data = JSON.parse(line.trim().slice(6));
              if (typeof data.replaceContent === "string") {
                fullContent = data.replaceContent;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId ? { ...m, content: fullContent } : m
                  )
                );
              }
              if (data.content !== undefined || data.liveComponent !== undefined) {
                if (data.content) fullContent += data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId ? { ...m, content: fullContent, liveComponent: data.liveComponent || m.liveComponent } : m
                  )
                );
              }
              if (data.done) {
                setIsStreaming(false);
                void fetchClassroomResources();
              }
              if (data.resourceSaved) {
                void fetchClassroomResources();
              }
              if (data.error) {
                fullContent += `\n\n[错误: ${data.error}]`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId ? { ...m, content: fullContent } : m
                  )
                );
                setIsStreaming(false);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "未知错误";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMessageId
            ? { ...m, content: `抱歉，请求出错：${errMsg}` }
            : m
        )
      );
      setIsStreaming(false);
    }
  };

  const quickQuestions = [
    "请解释一下这个知识点的核心概念",
    "能举一个生活中的例子吗？",
    "这个知识点和之前学过的有什么联系？",
    "帮我梳理一下这部分的知识框架",
  ];

  const activeComponent = [...messages].reverse().find(m => m.liveComponent)?.liveComponent;
  const selectedResource = classroomResources.find((resource) => resource.id === selectedResourceId) ?? null;

  return (
    <div className="space-y-4 h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0 mb-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-3">
            <MessageSquareText className="h-8 w-8 text-emerald-500" />
            课堂互动智能体 (Live)
          </h1>
          <p className="text-muted-foreground mt-2 text-base">沉浸式双屏布局 · 资料与记忆自动联动</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-8 gap-1.5 px-3">
            <Sparkles className="h-3.5 w-3.5" />
            记忆自动保存
          </Badge>
          <Button
            size="sm"
            variant={sessionId ? "outline" : "default"}
            onClick={handleCreateSession}
          >
            {sessionId ? (
              <><Sparkles className="h-3.5 w-3.5 mr-1" />课堂进行中</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1" />开始课堂</>
            )}
          </Button>
        </div>
      </div>

      {/* Main Split Layout */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 rounded-lg border">
        {/* Stage Pane */}
        <ResizablePanel defaultSize={50} minSize={30} className="bg-background flex flex-col relative">
          <div className="flex items-center p-3 border-b shrink-0 bg-muted/30">
            <Bot className="h-4 w-4 mr-2 text-emerald-500" />
            <span className="text-sm font-semibold">互动黑板 (Stage)</span>
          </div>
          <div className="border-b bg-background/80 px-3 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-cyan-500" />
              <span className="text-xs font-semibold">课堂资料</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {classroomResources.length}
              </Badge>
              <button
                onClick={fetchClassroomResources}
                disabled={resourcesLoading}
                className="ml-auto p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                aria-label="刷新课堂资料"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${resourcesLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {resourcesLoading && classroomResources.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">正在加载资料...</span>
              ) : classroomResources.length > 0 ? (
                classroomResources.map((resource) => (
                  <button
                    key={resource.id}
                    onClick={() => setSelectedResourceId(resource.id)}
                    className={`max-w-[12rem] shrink-0 truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${
                      selectedResourceId === resource.id
                        ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                        : "border-border text-muted-foreground hover:border-cyan-500/40 hover:text-foreground"
                    }`}
                    title={resource.title}
                  >
                    {resource.title}
                  </button>
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">暂无可展示的文档或笔记</span>
              )}
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 bg-dot-pattern">
            {activeComponent ? (
              <div className="w-full h-full rounded-xl overflow-hidden border flex flex-col bg-white">
                <div className="px-4 py-2 bg-muted border-b text-xs text-muted-foreground flex items-center">
                  <Lightbulb className="h-3 w-3 mr-1" />
                  {activeComponent.description}
                </div>
                <iframe 
                  className="flex-1 w-full border-0"
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <style>
                        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 1rem; }
                        ${activeComponent.css || ""}
                      </style>
                    </head>
                    <body>
                      ${activeComponent.html}
                      <script>
                        ${activeComponent.js || ""}
                      </script>
                    </body>
                    </html>
                  `}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            ) : selectedResource ? (
              <div className="h-full w-full overflow-hidden rounded-xl border bg-background flex flex-col">
                <div className="border-b bg-muted px-4 py-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-cyan-500" />
                    <h2 className="text-sm font-semibold truncate">{selectedResource.title}</h2>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {selectedResource.category === "note" ? "学习笔记" : "文档资料"}
                    </Badge>
                  </div>
                  {selectedResource.tags && selectedResource.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedResource.tags.slice(0, 5).map((tag) => (
                        <Badge key={tag} variant="outline" className="h-4 px-1 text-[9px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-5 prose prose-sm dark:prose-invert max-w-none">
                  {selectedResource.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedResource.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm text-muted-foreground">该资料暂未填写正文内容。</p>
                  )}
                  {selectedResource.file_url && (
                    <a
                      href={selectedResource.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs"
                    >
                      打开关联文件
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground opacity-50">
                <MessageSquareText className="h-16 w-16 mx-auto mb-4" />
                <p>课堂互动内容将在此展示</p>
                <p className="text-xs mt-2">（例如：模拟实验、图表、交互模型）</p>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Chat Pane */}
        <ResizablePanel defaultSize={50} minSize={30} className="flex flex-col bg-muted/10">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
                  <Bot className="h-8 w-8 text-emerald-500" />
                </div>
                <h3 className="text-lg font-semibold">课堂互动智能体</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  我是你的课堂助教，可以实时解答问题、联动讲解知识点、并在黑板上生成交互式演示。
                </p>
                <div className="grid grid-cols-1 gap-2 mt-6 w-full max-w-sm">
                  {quickQuestions.map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-auto py-2"
                      onClick={() => { setInputValue(q); }}
                    >
                      <Lightbulb className="h-3 w-3 mr-1.5 text-amber-500 shrink-0" />
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "student" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-1 ${
                      msg.role === "student"
                        ? "bg-primary text-primary-foreground"
                        : "bg-emerald-500 text-white"
                    }`}>
                      {msg.role === "student" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-[15px] leading-relaxed ${
                      msg.role === "student"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border prose prose-sm dark:prose-invert break-words"
                    }`}>
                      {msg.content ? (
                        msg.role === "student" ? (
                          msg.content
                        ) : (
                          <div className="w-full space-y-4">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content.trim()}
                            </ReactMarkdown>
                            {msg.liveComponent && (
                              <Badge variant="secondary" className="mt-2 text-[10px]">
                                <Sparkles className="h-3 w-3 mr-1" /> 已更新黑板演示
                              </Badge>
                            )}
                          </div>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          正在思考及生成交互...
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={scrollRef} className="h-4 shrink-0" />
          </div>
          
          <div className="p-3 bg-background border-t">
            <div className="flex gap-2">
              <Input
                placeholder="输入你的问题..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={isStreaming}
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={isStreaming || !inputValue.trim()}>
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
