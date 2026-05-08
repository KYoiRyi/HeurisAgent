import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { closeDb } from "@/lib/db";

export async function POST() {
  try {
    // 1. Close the active database connection
    closeDb();

    // 2. Delete the sqlite database files
    const dbPath = path.join(process.cwd(), "data", "agent.db");
    const walPath = path.join(process.cwd(), "data", "agent.db-wal");
    const shmPath = path.join(process.cwd(), "data", "agent.db-shm");

    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    // 3. Delete the sessions directory
    const sessionsPath = path.join(process.cwd(), "data", "sessions");
    if (fs.existsSync(sessionsPath)) {
      fs.rmSync(sessionsPath, { recursive: true, force: true });
    }

    return NextResponse.json({ success: true, message: "Database and documents have been reset to initial state." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器错误";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
