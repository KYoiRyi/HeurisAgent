import fs from "fs";
import path from "path";
import type { AgentMessage } from "./types";

export class SessionManager {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), "data", "sessions");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(sessionId: string): string {
    // Sanitize session ID to prevent path traversal
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    return path.join(this.baseDir, `${safeId}.json`);
  }

  /**
   * Load messages for a session.
   * @param sessionId The ID of the session
   * @returns Array of AgentMessage, or empty array if session doesn't exist
   */
  public load(sessionId: string): AgentMessage[] {
    const filePath = this.getFilePath(sessionId);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(data) as AgentMessage[];
      }
    } catch (err) {
      console.error(`[SessionManager] Failed to load session ${sessionId}:`, err);
    }
    return [];
  }

  /**
   * Save messages for a session.
   * @param sessionId The ID of the session
   * @param messages The full array of AgentMessages to persist
   */
  public save(sessionId: string, messages: AgentMessage[]): void {
    const filePath = this.getFilePath(sessionId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), "utf-8");
    } catch (err) {
      console.error(`[SessionManager] Failed to save session ${sessionId}:`, err);
    }
  }
}

export const sessionManager = new SessionManager();
