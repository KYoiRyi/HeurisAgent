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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

interface Message {
  id: string;
  role: "student" | "agent";
  content: string;
  timestamp: Date;
  type?: string;
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/classroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          subject,
          studentName,
          history,
        }),
      });

      if (!response.ok) throw new Error("请求失败");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("无法读取响应流");

      let fullContent = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                fullContent += data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === agentMessageId ? { ...m, content: fullContent } : m
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquareText className="h-6 w-6 text-emerald-500" />
            课堂互动智能体
          </h1>
          <p className="text-muted-foreground mt-1">实时提问解答 · 知识点联动讲解 · 启发式引导</p>
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

      {/* Chat Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Chat */}
        <Card className="lg:col-span-3">
          <CardContent className="p-0">
            <ScrollArea className="h-[520px] p-4" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[480px] text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/20 mb-4">
                    <Bot className="h-8 w-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-semibold">课堂互动智能体</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    我是你的课堂助教，可以实时解答问题、联动讲解知识点、启发式引导思考。试试向我提问吧！
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 w-full max-w-lg">
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
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        msg.role === "student"
                          ? "bg-primary text-primary-foreground"
                          : "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"
                      }`}>
                        {msg.role === "student" ? (
                          <User className="h-4 w-4" />
                        ) : (
                          <Bot className="h-4 w-4" />
                        )}
                      </div>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === "student"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}>
                        {msg.content || (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            正在思考...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Separator />

            {/* Input Area */}
            <div className="p-4">
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
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">课堂信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">学科</span>
                <Badge variant="secondary">{subject}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">学生</span>
                <span className="font-medium">{studentName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">消息数</span>
                <span className="font-medium">{messages.length}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">课堂状态</span>
                <Badge variant={sessionId ? "default" : "outline"} className="text-[10px]">
                  {sessionId ? "进行中" : "未开始"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">知识点提示</CardTitle>
              <CardDescription className="text-xs">智能体识别的关联知识点</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {["代数运算", "方程求解", "函数图像", "几何证明"].map((point) => (
                  <Badge key={point} variant="outline" className="text-[10px]">{point}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">智能体能力</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { icon: Lightbulb, label: "启发式提问引导", desc: "引导主动思考" },
                { icon: BookOpen, label: "知识点联动", desc: "构建知识网络" },
                { icon: ArrowRight, label: "多角度讲解", desc: "丰富理解维度" },
              ].map((ability) => (
                <div key={ability.label} className="flex items-center gap-2 text-xs">
                  <ability.icon className="h-3.5 w-3.5 text-emerald-500" />
                  <div>
                    <p className="font-medium">{ability.label}</p>
                    <p className="text-muted-foreground">{ability.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
