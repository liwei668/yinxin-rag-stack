import fs from 'fs';
import path from 'path';

const SKILLS_DIR = path.join(process.cwd(), 'data', 'skill-prompts');
const COMBINATIONS_PATH = path.join(process.cwd(), 'data', 'skill-combinations.json');

export interface SkillCombination {
  id: string;
  name: string;
  description: string;
  skills: string[];
  defaultModelId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function readCombinations(): SkillCombination[] {
  try {
    if (fs.existsSync(COMBINATIONS_PATH)) {
      const data = fs.readFileSync(COMBINATIONS_PATH, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.combinations || [];
    }
  } catch (e) {
    console.error('Error reading skill combinations:', e);
  }
  return [];
}

function writeCombinations(combinations: SkillCombination[]): void {
  const dir = path.dirname(COMBINATIONS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(COMBINATIONS_PATH, JSON.stringify({ combinations }, null, 2));
}

export class PromptCombiner {
  constructor() {}

  async combinePrompts(combination: SkillCombination): Promise<string> {
    const combinedParts: string[] = [];

    for (const skillFileName of combination.skills) {
      const content = await this.loadSkillPrompt(skillFileName);
      if (content) {
        combinedParts.push(`--- [${skillFileName}] ---`);
        combinedParts.push(content);
      }
    }

    return combinedParts.join('\n\n');
  }

  async loadSkillPrompt(fileName: string): Promise<string | null> {
    const filePath = path.join(SKILLS_DIR, fileName);
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch (e) {
      console.error(`Error loading skill prompt ${fileName}:`, e);
    }
    return null;
  }

  getCombinations(): SkillCombination[] {
    return readCombinations();
  }

  getActiveCombinations(): SkillCombination[] {
    return this.getCombinations().filter(c => c.isActive);
  }
}

export const promptCombiner = new PromptCombiner();