import fs from "fs";
import path from "path";

export interface Skill {
  name: string;
  description: string;
  content: string;
  filePath: string;
}

/**
 * Very simple markdown frontmatter parser.
 * Reads --- block at the top of the file for metadata.
 */
function parseFrontmatter(rawContent: string): { frontmatter: Record<string, string>; content: string } {
  const frontmatter: Record<string, string> = {};
  let content = rawContent;

  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (match) {
    const fmText = match[1];
    content = match[2];

    const lines = fmText.split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        frontmatter[key] = value.replace(/^["']|["']$/g, ""); // strip quotes
      }
    }
  }

  return { frontmatter, content: content.trim() };
}

export function loadSkills(skillsDir: string): Skill[] {
  const skills: Skill[] = [];
  
  if (!fs.existsSync(skillsDir)) {
    return skills;
  }

  const files = fs.readdirSync(skillsDir);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    const filePath = path.join(skillsDir, file);
    try {
      const rawContent = fs.readFileSync(filePath, "utf-8");
      const { frontmatter, content } = parseFrontmatter(rawContent);

      // Extract name from frontmatter or fallback to filename
      const name = frontmatter.name || path.basename(file, ".md");
      const description = frontmatter.description || `Skill defined in ${file}`;

      skills.push({
        name,
        description,
        content,
        filePath
      });
    } catch (err) {
      console.error(`[Skills] Failed to load skill ${file}:`, err);
    }
  }

  return skills;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format skills for inclusion in a system prompt.
 * Uses XML format per Agent Skills standard.
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "\n\nThe following skills provide specialized instructions for specific tasks.",
    "Follow these instructions proactively when the context matches the skill description.",
    "",
    "<available_skills>"
  ];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <instructions>\n${escapeXml(skill.content)}\n    </instructions>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>\n");

  return lines.join("\n");
}
