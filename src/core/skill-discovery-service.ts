import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface SkillMetadata {
  name: string;
  description: string;
  filePath: string;
  source: string;
}

export interface SkillDiscoveryService {
  list(): Promise<SkillMetadata[]>;
  getByName(name: string): Promise<SkillMetadata | null>;
}

interface SkillRoot {
  directory: string;
  source: string;
}

export class FileSystemSkillDiscoveryService implements SkillDiscoveryService {
  public static fromCodexHome(
    codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex")
  ): FileSystemSkillDiscoveryService {
    return new FileSystemSkillDiscoveryService([
      {
        directory: path.join(codexHome, "skills"),
        source: "user"
      },
      {
        directory: path.join(codexHome, "superpowers", "skills"),
        source: "superpowers"
      },
      {
        directory: path.join(codexHome, "vendor_imports", "skills", "skills"),
        source: "vendor"
      }
    ]);
  }

  public constructor(private readonly roots: SkillRoot[]) {}

  public async list(): Promise<SkillMetadata[]> {
    const skills = await Promise.all(this.roots.map((root) => this.readRoot(root)));

    return skills
      .flat()
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public async getByName(name: string): Promise<SkillMetadata | null> {
    const normalizedName = name.trim().toLowerCase();
    const skills = await this.list();

    return (
      skills.find((skill) => skill.name.trim().toLowerCase() === normalizedName) ?? null
    );
  }

  private async readRoot(root: SkillRoot): Promise<SkillMetadata[]> {
    try {
      const entries = await readdir(root.directory, { withFileTypes: true });
      const skills = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => this.readSkill(path.join(root.directory, entry.name), root))
      );

      return skills.filter((skill): skill is SkillMetadata => skill !== null);
    } catch {
      return [];
    }
  }

  private async readSkill(
    skillDirectory: string,
    root: SkillRoot
  ): Promise<SkillMetadata | null> {
    const filePath = path.join(skillDirectory, "SKILL.md");

    try {
      const content = await readFile(filePath, "utf8");
      const metadata = parseSkillMetadata(content);

      return {
        name: metadata.name || path.basename(skillDirectory),
        description: metadata.description || "No description available.",
        filePath,
        source: root.source
      };
    } catch {
      return null;
    }
  }
}

function parseSkillMetadata(content: string): {
  name: string;
  description: string;
} {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) {
    return {
      name: "",
      description: ""
    };
  }

  const body = frontmatter[1] ?? "";

  return {
    name: extractFrontmatterValue(body, "name"),
    description: extractFrontmatterValue(body, "description")
  };
}

function extractFrontmatterValue(frontmatter: string, key: string): string {
  const pattern = new RegExp(`^${key}:\\s*"?(.+?)"?$`, "m");
  return frontmatter.match(pattern)?.[1]?.trim() ?? "";
}
