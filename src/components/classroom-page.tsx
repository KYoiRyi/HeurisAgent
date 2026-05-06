"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquareText, Send, Bot, User, BookOpen, Sparkles,
  Lightbulb, ArrowRight, Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
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

const SUBJECTS = ["数学", "语文", "英语", "物理", "化学", "生物", "历史", "地理"];

export default function ClassroomPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [subject, setSubject] = useState("数学");
  const [studentName, setStudentName] = useState("张三");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load identity from localStorage
  useEffect(() => {
    const savedSubject = localStorage.getItem("heuris_subject");
    const savedName = localStorage.getItem("heuris_studentName");
    if (savedSubject) setSubject(savedSubject);
    if (savedName) setStudentName(savedName);
  }, []);

  // Save identity to localStorage
  useEffect(() => {
    localStorage.setItem("heuris_subject", subject);
    localStorage.setItem("heuris_studentName", studentName);
  }, [subject, studentName]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;

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
          sessionId,
          subject,
          studentName,
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

  const handleCreateSession = async () => {
    try {
      const res = await fetch("/api/classroom/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${subject}课堂 - ${new Date().toLocaleDateString("zh-CN")}`,
          subject,
          teacher: "AI教师",
          topicSummary: `${subject}学科实时互动课堂`,
          keyPoints: [],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSessionId(json.data.id);
      }
    } catch (err) {
      console.error("Create session error:", err);
    }
  };

  const quickQuestions = [
    "请解释一下这个知识点的核心概念",
    "能举一个生活中的例子吗？",
    "这个知识点和之前学过的有什么联系？",
    "帮我梳理一下这部分的知识框架",
  ];

  const activeComponent = [...messages].reverse().find(m => m.liveComponent)?.liveComponent;

  return (
    <div className="space-y-4 h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquareText className="h-6 w-6 text-emerald-500" />
            课堂互动智能体 (Live)
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">沉浸式双屏布局 · 实时互动生成</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBJECTS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="学生姓名"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="w-28"
          />
          <Button
            size="sm"
            variant={sessionId ? "outline" : "default"}
            onClick={handleCreateSession}
          >
            {sessionId ? (
              <><BookOpen className="h-3.5 w-3.5 mr-1" />课堂进行中</>
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
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 bg-dot-pattern">
            {activeComponent ? (
              <div className="w-full h-full rounded-xl overflow-hidden border shadow-sm flex flex-col bg-white">
                <div className="px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground flex items-center">
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
          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-20">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/20 mb-4">
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
                        : "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"
                    }`}>
                      {msg.role === "student" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === "student"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border shadow-sm prose prose-sm dark:prose-invert break-words"
                    }`}>
                      {msg.content ? (
                        msg.role === "student" ? (
                          msg.content
                        ) : (
                          <div className="w-full space-y-4">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim()}
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
            <div ref={scrollRef} className="h-4" />
          </ScrollArea>
          
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
