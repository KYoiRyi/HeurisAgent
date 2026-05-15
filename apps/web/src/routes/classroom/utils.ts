import type { LiveComponent, ArchivedSession, StageEvent } from "./types";

const LS_ACTIVE_SESSION = (subject: string) => `heuris-active-session:${subject}`;
const LS_SESSIONS_LIST = "heuris-archived-sessions";

export function getArchivedSessions(): ArchivedSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_SESSIONS_LIST) ?? "[]");
  } catch {
    return [];
  }
}

export function saveArchivedSessions(list: ArchivedSession[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_SESSIONS_LIST, JSON.stringify(list.slice(0, 20)));
}

export function getActiveSessionId(subject: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_ACTIVE_SESSION(subject)) ?? null;
}

export function setActiveSessionId(subject: string, id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(LS_ACTIVE_SESSION(subject), id);
  else localStorage.removeItem(LS_ACTIVE_SESSION(subject));
}

export function buildStageSrcDoc(component: LiveComponent): string {
  const description = JSON.stringify(component.description || "互动黑板");
  const css = component.css ?? "";
  const js = (component.js ?? "").replace(/<\/script/gi, "<\\/script");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; padding: 0; min-height: 100vh; overflow-x: hidden; background: #faf9f5; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #141413;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: 1.25rem;
    }
    #heuris-stage-container {
      margin: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      max-width: 720px;
    }
    button { font-family: inherit; }
    ${css}
  </style>
</head>
<body>
  <div id="heuris-stage-container">
    ${component.html}
  </div>
  <script>
    (function () {
      var stageDescription = ${description};
      function emit(eventType, payload) {
        window.parent.postMessage({
          type: "heuris-stage-event",
          eventType: eventType || "event",
          payload: payload == null ? null : payload,
          description: stageDescription
        }, "*");
      }
      window.HeurisStage = {
        emit: emit,
        answer: function (payload) { emit("answer", payload); },
        progress: function (payload) { emit("progress", payload); }
      };
      window.addEventListener("error", function (event) {
        emit("runtime-error", { message: event.message, line: event.lineno, column: event.colno });
      });
      window.addEventListener("unhandledrejection", function (event) {
        var reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
        emit("runtime-error", { message: reason });
      });
      function autoScale() {
        var container = document.getElementById("heuris-stage-container");
        if (!container) return;
        container.style.transform = "none";
        container.style.marginBottom = "0px";
        var contentWidth = container.scrollWidth;
        var availableWidth = window.innerWidth - 40;
        if (contentWidth > availableWidth && availableWidth > 0) {
          var scale = availableWidth / contentWidth;
          container.style.transform = "scale(" + scale + ")";
          container.style.transformOrigin = "top center";
        }
      }
      window.addEventListener("resize", autoScale);
      autoScale();
      setTimeout(autoScale, 50);
      setTimeout(autoScale, 500);
    })();
  </script>
  <script>
    ${js}
  </script>
</body>
</html>`;
}

export function sanitizeVisibleContent(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();
}

export function stringifyPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload.slice(0, 80);
  if (typeof payload === "number" || typeof payload === "boolean") return String(payload);
  try {
    return JSON.stringify(payload).slice(0, 100);
  } catch {
    return String(payload).slice(0, 100);
  }
}

export function formatStageEvent(event: StageEvent): string {
  const payload = stringifyPayload(event.payload);
  return payload ? `${event.type}: ${payload}` : event.type;
}
