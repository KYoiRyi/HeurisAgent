#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch classroom-page.tsx cleanly (LF line endings)."""
import pathlib

SRC = pathlib.Path(r"d:\ollama\lib\HeurisAgent\src\components\classroom-page.tsx")
text = SRC.read_text(encoding="utf-8")

# ─── 1. imports ────────────────────────────────────────────────────────────
old = (
    "  Lightbulb, Loader2, FileText, RefreshCw, Wrench, CheckCircle2, XCircle, Terminal\n"
    "} from \"lucide-react\";"
)
new = (
    "  Lightbulb, Loader2, FileText, RefreshCw, Wrench, CheckCircle2, XCircle, Terminal,\n"
    "  ChevronLeft, ChevronRight\n"
    "} from \"lucide-react\";"
)
text = text.replace(old, new, 1)
print("[1]", "ChevronLeft" in text)

# ─── 2. tabsScrollRef ──────────────────────────────────────────────────────
old = (
    "  const scrollRef = useRef<HTMLDivElement>(null);\n"
    "  const stageEventsRef = useRef<StageEvent[]>([]);"
)
new = (
    "  const scrollRef = useRef<HTMLDivElement>(null);\n"
    "  const stageEventsRef = useRef<StageEvent[]>([]);\n"
    "  const tabsScrollRef = useRef<HTMLDivElement>(null);"
)
text = text.replace(old, new, 1)
print("[2]", "tabsScrollRef" in text)

# ─── 3. protect interactive-stage in setSelectedResourceId ─────────────────
old = (
    "        setSelectedResourceId((current) =>\n"
    "          docs.some((resource: ClassroomResource) => resource.id === current)\n"
    "            ? current\n"
    "            : docs[0]?.id ?? null\n"
    "        );"
)
new = (
    "        setSelectedResourceId((current) => {\n"
    "          if (current === \"interactive-stage\") return current;\n"
    "          return docs.some((resource: ClassroomResource) => resource.id === current)\n"
    "            ? current\n"
    "            : docs[0]?.id ?? null;\n"
    "        });"
)
text = text.replace(old, new, 1)
print("[3]", 'if (current === "interactive-stage")' in text)

# ─── 4. Stage outer container: remove flex center padding ─────────────────
old = '          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4 bg-dot-pattern">'
new = '          <div className="flex-1 relative overflow-hidden bg-dot-pattern">'
text = text.replace(old, new, 1)
print("[4]", 'bg-dot-pattern">' in text)

# ─── 5. Tabs row: replace with arrow buttons ────────────────────────────────
old = (
    "            <div className=\"mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-1 w-full\">\n"
    "              {activeComponent && (\n"
    "                <button\n"
    "                  onClick={() => setSelectedResourceId(\"interactive-stage\")}\n"
    "                  className={`max-w-[12rem] shrink-0 truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${\n"
    "                    selectedResourceId === \"interactive-stage\"\n"
    "                      ? \"border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300\"\n"
    "                      : \"border-border text-muted-foreground hover:border-emerald-500/40 hover:text-foreground\"\n"
    "                  }`}\n"
    "                  title=\"互动黑板\"\n"
    "                >\n"
    "                  <Bot className=\"inline-block h-3 w-3 mr-1\" />\n"
    "                  互动黑板\n"
    "                </button>\n"
    "              )}\n"
    "              {resourcesLoading && classroomResources.length === 0 ? (\n"
    "                <span className=\"text-[11px] text-muted-foreground\">正在加载资料...</span>\n"
    "              ) : classroomResources.length > 0 ? (\n"
    "                classroomResources.map((resource) => (\n"
    "                  <button\n"
    "                    key={resource.id}\n"
    "                    onClick={() => setSelectedResourceId(resource.id)}\n"
    "                    className={`max-w-[12rem] shrink-0 truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${\n"
    "                      selectedResourceId === resource.id\n"
    "                        ? \"border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300\"\n"
    "                        : \"border-border text-muted-foreground hover:border-cyan-500/40 hover:text-foreground\"\n"
    "                    }`}\n"
    "                    title={resource.title}\n"
    "                  >\n"
    "                    {resource.title}\n"
    "                  </button>\n"
    "                ))\n"
    "              ) : (\n"
    "                <span className=\"text-[11px] text-muted-foreground\">暂无可展示的文档或笔记</span>\n"
    "              )}\n"
    "            </div>"
)
new = (
    "            <div className=\"mt-2 flex items-center gap-1\">\n"
    "              <button\n"
    "                className=\"shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground\"\n"
    "                aria-label=\"向左滚动\"\n"
    "                onClick={() => { if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft -= 160; }}\n"
    "              >\n"
    "                <ChevronLeft className=\"h-4 w-4\" />\n"
    "              </button>\n"
    "              <div\n"
    "                ref={tabsScrollRef}\n"
    "                className=\"flex flex-1 flex-nowrap gap-1.5 overflow-x-auto pb-1\"\n"
    "                style={{ scrollBehavior: \"smooth\", scrollbarWidth: \"none\" }}\n"
    "              >\n"
    "                {activeComponent && (\n"
    "                  <button\n"
    "                    onClick={() => setSelectedResourceId(\"interactive-stage\")}\n"
    "                    className={`max-w-[12rem] shrink-0 truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${\n"
    "                      selectedResourceId === \"interactive-stage\"\n"
    "                        ? \"border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300\"\n"
    "                        : \"border-border text-muted-foreground hover:border-emerald-500/40 hover:text-foreground\"\n"
    "                    }`}\n"
    "                    title=\"互动黑板\"\n"
    "                  >\n"
    "                    <Bot className=\"inline-block h-3 w-3 mr-1\" />\n"
    "                    互动黑板\n"
    "                  </button>\n"
    "                )}\n"
    "                {resourcesLoading && classroomResources.length === 0 ? (\n"
    "                  <span className=\"text-[11px] text-muted-foreground\">正在加载资料...</span>\n"
    "                ) : classroomResources.length > 0 ? (\n"
    "                  classroomResources.map((resource) => (\n"
    "                    <button\n"
    "                      key={resource.id}\n"
    "                      onClick={() => setSelectedResourceId(resource.id)}\n"
    "                      className={`max-w-[12rem] shrink-0 truncate rounded-md border px-2 py-1 text-[11px] transition-colors ${\n"
    "                        selectedResourceId === resource.id\n"
    "                          ? \"border-cyan-500/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300\"\n"
    "                          : \"border-border text-muted-foreground hover:border-cyan-500/40 hover:text-foreground\"\n"
    "                      }`}\n"
    "                      title={resource.title}\n"
    "                    >\n"
    "                      {resource.title}\n"
    "                    </button>\n"
    "                  ))\n"
    "                ) : (\n"
    "                  <span className=\"text-[11px] text-muted-foreground\">暂无可展示的文档或笔记</span>\n"
    "                )}\n"
    "              </div>\n"
    "              <button\n"
    "                className=\"shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground\"\n"
    "                aria-label=\"向右滚动\"\n"
    "                onClick={() => { if (tabsScrollRef.current) tabsScrollRef.current.scrollLeft += 160; }}\n"
    "              >\n"
    "                <ChevronRight className=\"h-4 w-4\" />\n"
    "              </button>\n"
    "            </div>"
)
found = old in text
text = text.replace(old, new, 1)
print("[5]", found, "->", "ChevronRight" in text)

# ─── 6. interactive-stage div: absolute inset-0 ─────────────────────────────
old = (
    "              <div className=\"w-full h-full rounded-xl overflow-hidden border flex flex-col bg-white\">\n"
    "                <div className=\"px-4 py-2 bg-muted border-b text-xs text-muted-foreground flex items-center\">"
)
new = (
    "              <div className=\"absolute inset-0 flex flex-col bg-white overflow-hidden\">\n"
    "                <div className=\"px-4 py-2 bg-muted border-b text-xs text-muted-foreground flex items-center shrink-0\">"
)
found = old in text
text = text.replace(old, new, 1)
print("[6]", found)

old = "                <iframe \n                  className=\"flex-1 w-full border-0\""
new = "                <iframe\n                  className=\"flex-1 w-full border-0 min-h-0\""
text = text.replace(old, new, 1)
print("[6b] iframe:", "min-h-0" in text)

# ─── 7. selectedResource container: absolute inset-0 ───────────────────────
old = '              <div className="h-full w-full overflow-hidden rounded-xl border bg-background flex flex-col">'
new = '              <div className="absolute inset-0 flex flex-col bg-background overflow-hidden">'
found = old in text
text = text.replace(old, new, 1)
print("[7]", found)

# ─── 8. Split exercise vs knowledge-point display ──────────────────────────
old = (
    "                <div className=\"flex-1 overflow-y-auto p-5 prose prose-sm dark:prose-invert max-w-none\">\n"
    "                  {selectedResource.content ? (\n"
    "                    <ReactMarkdown remarkPlugins={[remarkGfm]}>\n"
    "                      {selectedResource.content}\n"
    "                    </ReactMarkdown>\n"
    "                  ) : (\n"
    "                    <p className=\"text-sm text-muted-foreground\">该资料暂未填写正文内容。</p>\n"
    "                  )}\n"
    "                  {selectedResource.category === \"exercise\" && (\n"
    "                    <div className=\"mt-6 border-t pt-4 not-prose\">\n"
    "                      <h3 className=\"text-sm font-semibold mb-3\">提交作答</h3>\n"
    "                      <div className=\"space-y-3\">\n"
    "                        <div>\n"
    "                          <label className=\"text-xs text-muted-foreground mb-1 block\">我的答案：</label>\n"
    "                          <Input\n"
    "                            placeholder=\"请输入最终答案...\"\n"
    "                            value={exerciseAnswers[selectedResource.id] || \"\"}\n"
    "                            onChange={(e) => setExerciseAnswers((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}\n"
    "                          />\n"
    "                        </div>\n"
    "                        <div>\n"
    "                          <label className=\"text-xs text-muted-foreground mb-1 block\">解题过程/思路：</label>\n"
    "                          <textarea\n"
    "                            className=\"flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50\"\n"
    "                            placeholder=\"请简述解题过程...\"\n"
    "                            value={exerciseProcesses[selectedResource.id] || \"\"}\n"
    "                            onChange={(e) => setExerciseProcesses((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}\n"
    "                          />\n"
    "                        </div>\n"
    "                        <Button \n"
    "                          className=\"w-full\"\n"
    "                          onClick={() => {\n"
    "                            const ans = exerciseAnswers[selectedResource.id] || \"\";\n"
    "                            const proc = exerciseProcesses[selectedResource.id] || \"\";\n"
    "                            if (!ans && !proc) return;\n"
    "                            handleSend(`提交题目《${selectedResource.title}》的解答：\\n\\n【我的答案】\\n${ans}\\n\\n【解题过程/思路】\\n${proc}\\n\\n请帮我批改。`);\n"
    "                          }}\n"
    "                          disabled={(!exerciseAnswers[selectedResource.id] && !exerciseProcesses[selectedResource.id]) || isStreaming}\n"
    "                        >\n"
    "                          <Send className=\"h-4 w-4 mr-2\" />\n"
    "                          提交批改\n"
    "                        </Button>\n"
    "                      </div>\n"
    "                    </div>\n"
    "                  )}\n"
    "                  {selectedResource.file_url && (\n"
    "                    <a\n"
    "                      href={selectedResource.file_url}\n"
    "                      target=\"_blank\"\n"
    "                      rel=\"noreferrer\"\n"
    "                      className=\"text-xs\"\n"
    "                    >\n"
    "                      打开关联文件\n"
    "                    </a>\n"
    "                  )}\n"
    "                </div>"
)
new = (
    "                {selectedResource.category === \"exercise\" ? (\n"
    "                  /* exercise: question above, answer form below */\n"
    "                  <div className=\"flex-1 flex flex-col overflow-hidden\">\n"
    "                    <div className=\"overflow-y-auto p-5 border-b prose prose-sm dark:prose-invert max-w-none flex-none\" style={{ maxHeight: \"55%\" }}>\n"
    "                      {selectedResource.content ? (\n"
    "                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedResource.content}</ReactMarkdown>\n"
    "                      ) : (\n"
    "                        <p className=\"text-sm text-muted-foreground\">题目内容加载中...</p>\n"
    "                      )}\n"
    "                    </div>\n"
    "                    <div className=\"flex-1 overflow-y-auto p-4 space-y-3 not-prose bg-muted/20\">\n"
    "                      <div className=\"flex items-center gap-2\">\n"
    "                        <Sparkles className=\"h-4 w-4 text-amber-500\" />\n"
    "                        <span className=\"text-sm font-semibold\">答题区</span>\n"
    "                        <Badge variant=\"outline\" className=\"text-[10px]\">答完后提交，AI 自动批改并录入错题本</Badge>\n"
    "                      </div>\n"
    "                      {/^[A-D][.。]\\s/m.test(selectedResource.content ?? \"\") ? (\n"
    "                        <div className=\"space-y-2\">\n"
    "                          <label className=\"text-xs text-muted-foreground block\">选择答案：</label>\n"
    "                          <div className=\"grid grid-cols-2 gap-2\">\n"
    "                            {[\"A\", \"B\", \"C\", \"D\"].map((opt) => (\n"
    "                              <button\n"
    "                                key={opt}\n"
    "                                onClick={() => setExerciseAnswers((prev) => ({ ...prev, [selectedResource.id]: opt }))}\n"
    "                                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left ${\n"
    "                                  exerciseAnswers[selectedResource.id] === opt\n"
    "                                    ? \"border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300\"\n"
    "                                    : \"border-border hover:border-cyan-400 hover:bg-accent\"\n"
    "                                }`}\n"
    "                              >{opt}</button>\n"
    "                            ))}\n"
    "                          </div>\n"
    "                          <label className=\"text-xs text-muted-foreground block mt-2\">解题思路（可选）：</label>\n"
    "                          <textarea\n"
    "                            className=\"flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring\"\n"
    "                            placeholder=\"说说你为什么选这个选项...\"\n"
    "                            value={exerciseProcesses[selectedResource.id] || \"\"}\n"
    "                            onChange={(e) => setExerciseProcesses((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}\n"
    "                          />\n"
    "                        </div>\n"
    "                      ) : (\n"
    "                        <div className=\"space-y-2\">\n"
    "                          <label className=\"text-xs text-muted-foreground block\">我的答案：</label>\n"
    "                          <Input\n"
    "                            placeholder=\"请输入最终答案...\"\n"
    "                            value={exerciseAnswers[selectedResource.id] || \"\"}\n"
    "                            onChange={(e) => setExerciseAnswers((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}\n"
    "                          />\n"
    "                          <label className=\"text-xs text-muted-foreground block\">解题过程/思路：</label>\n"
    "                          <textarea\n"
    "                            className=\"flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring\"\n"
    "                            placeholder=\"请完整写出解题过程...\"\n"
    "                            value={exerciseProcesses[selectedResource.id] || \"\"}\n"
    "                            onChange={(e) => setExerciseProcesses((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}\n"
    "                          />\n"
    "                        </div>\n"
    "                      )}\n"
    "                      <Button\n"
    "                        className=\"w-full\"\n"
    "                        onClick={() => {\n"
    "                          const ans = exerciseAnswers[selectedResource.id] || \"\";\n"
    "                          const proc = exerciseProcesses[selectedResource.id] || \"\";\n"
    "                          if (!ans && !proc) return;\n"
    "                          handleSend(\n"
    "                            `[EXERCISE_SUBMISSION]\\n\\n题目：《${selectedResource.title}》\\n\\n题目内容：\\n${selectedResource.content ?? \"\"}\\n\\n【我的答案】\\n${ans}\\n\\n【解题过程/思路】\\n${proc}\\n\\n请批改，并将结果录入错题本。`\n"
    "                          );\n"
    "                        }}\n"
    "                        disabled={(!exerciseAnswers[selectedResource.id] && !exerciseProcesses[selectedResource.id]) || isStreaming}\n"
    "                      >\n"
    "                        <Send className=\"h-4 w-4 mr-2\" />\n"
    "                        提交批改（自动录入错题本）\n"
    "                      </Button>\n"
    "                    </div>\n"
    "                  </div>\n"
    "                ) : (\n"
    "                  <div className=\"flex-1 overflow-y-auto p-5 prose prose-sm dark:prose-invert max-w-none\">\n"
    "                    {selectedResource.content ? (\n"
    "                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedResource.content}</ReactMarkdown>\n"
    "                    ) : (\n"
    "                      <p className=\"text-sm text-muted-foreground\">该资料暂未填写正文内容。</p>\n"
    "                    )}\n"
    "                    {selectedResource.file_url && (\n"
    "                      <a href={selectedResource.file_url} target=\"_blank\" rel=\"noreferrer\" className=\"text-xs\">打开关联文件</a>\n"
    "                    )}\n"
    "                  </div>\n"
    "                )}"
)
found = old in text
text = text.replace(old, new, 1)
print("[8]", found, "-> EXERCISE_SUBMISSION:", "EXERCISE_SUBMISSION" in text)

SRC.write_text(text, encoding="utf-8")
print("All done.")
