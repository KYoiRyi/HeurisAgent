/**
 * GET    /api/agent/cron     → list all cron jobs
 * POST   /api/agent/cron     → create a job { name, schedule, prompt }
 * PATCH  /api/agent/cron     → update { id, enabled?, name?, schedule?, prompt? }
 * DELETE /api/agent/cron     → delete { id }
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface CronJobRow {
  id: number;
  name: string;
  schedule: string;
  prompt: string;
  enabled: number;
  last_run: string | null;
  next_run: string | null;
  run_count: number;
  created_at: string;
}

function computeNextRun(schedule: string): string {
  const s = schedule.trim().toLowerCase();
  let ms = 60 * 60 * 1000; // default 1h

  const everyHour = s.match(/every\s+(\d+)\s*h/);
  if (everyHour) ms = parseInt(everyHour[1]) * 3_600_000;
  const everyMin = s.match(/every\s+(\d+)\s*(min|minute)/);
  if (everyMin) ms = parseInt(everyMin[1]) * 60_000;
  const everyDay = s.match(/every\s+(\d+)\s*d/);
  if (everyDay) ms = parseInt(everyDay[1]) * 86_400_000;
  if (s === "daily" || s === "every day") ms = 86_400_000;
  if (s === "hourly" || s === "every hour") ms = 3_600_000;

  return new Date(Date.now() + ms).toISOString();
}

export async function GET() {
  const db = getDb();
  const jobs = db.prepare("SELECT * FROM cron_jobs ORDER BY created_at DESC").all() as CronJobRow[];
  // Also get recent run counts per job
  const runs = db.prepare(
    "SELECT job_id, COUNT(*) as total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as success FROM task_runs WHERE job_id IS NOT NULL GROUP BY job_id"
  ).all() as Array<{ job_id: number; total: number; success: number }>;
  const runMap = Object.fromEntries(runs.map((r) => [r.job_id, r]));

  return NextResponse.json({
    success: true,
    data: jobs.map((j) => ({
      ...j,
      enabled: j.enabled === 1,
      stats: runMap[j.id] ?? { total: 0, success: 0 },
    })),
  });
}

export async function POST(request: NextRequest) {
  const { name, schedule, prompt } = await request.json();
  if (!name || !schedule || !prompt) {
    return NextResponse.json({ error: "name, schedule, and prompt are required" }, { status: 400 });
  }
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO cron_jobs (name, schedule, prompt, next_run) VALUES (?, ?, ?, ?)
  `).run(name, schedule, prompt, computeNextRun(schedule));

  const job = db.prepare("SELECT * FROM cron_jobs WHERE id=?").get(info.lastInsertRowid) as CronJobRow;
  return NextResponse.json({ success: true, data: { ...job, enabled: job.enabled === 1 } });
}

export async function PATCH(request: NextRequest) {
  const { id, ...patch } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (patch.name !== undefined) { sets.push("name=?"); vals.push(patch.name); }
  if (patch.schedule !== undefined) {
    sets.push("schedule=?"); vals.push(patch.schedule);
    sets.push("next_run=?"); vals.push(computeNextRun(patch.schedule));
  }
  if (patch.prompt !== undefined) { sets.push("prompt=?"); vals.push(patch.prompt); }
  if (patch.enabled !== undefined) { sets.push("enabled=?"); vals.push(patch.enabled ? 1 : 0); }

  if (sets.length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  vals.push(id);
  db.prepare(`UPDATE cron_jobs SET ${sets.join(",")} WHERE id=?`).run(...vals);

  const job = db.prepare("SELECT * FROM cron_jobs WHERE id=?").get(id) as CronJobRow;
  return NextResponse.json({ success: true, data: { ...job, enabled: job.enabled === 1 } });
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getDb();
  db.prepare("DELETE FROM cron_jobs WHERE id=?").run(id);
  return NextResponse.json({ success: true });
}
