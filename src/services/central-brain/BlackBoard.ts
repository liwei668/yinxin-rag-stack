import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../lib/logger';

export interface BlackBoardData {
  id: string;
  content: any;
  timestamp: number;
  source: string;
  type: 'input' | 'model_output' | 'skill' | 'memory' | 'context';
}

export class BlackBoard {
  private board: Map<string, BlackBoardData[]> = new Map();
  private maxHistorySize = 100;

  write(key: string, data: BlackBoardData) {
    if (!this.board.has(key)) {
      this.board.set(key, []);
    }
    
    const history = this.board.get(key)!;
    history.push(data);
    
    // 保持历史记录大小限制
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    
    logger.debug('BlackBoard', `写入数据: ${key}`, { data });
  }

  read(key: string): BlackBoardData[] {
    return this.board.get(key) || [];
  }

  readLatest(key: string): BlackBoardData | null {
    const history = this.board.get(key);
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  delete(key: string) {
    this.board.delete(key);
  }

  clear() {
    this.board.clear();
  }

  getAllKeys(): string[] {
    return Array.from(this.board.keys());
  }

  exportState(): Record<string, BlackBoardData[]> {
    const state: Record<string, BlackBoardData[]> = {};
    for (const [key, value] of this.board.entries()) {
      state[key] = [...value];
    }
    return state;
  }
}

export const globalBlackBoard = new BlackBoard();
