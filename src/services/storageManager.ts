import localForage from 'localforage';

export type StorageMode = 'local' | 'cloud' | 'hybrid';

export interface StoragePreferences {
  mode: StorageMode;
  autoSync: boolean;
  lastSyncTime?: string;
  lastSyncAt?: Date;
}

class StorageManager {
  private preferencesStore: LocalForage;
  private conversationsStore: LocalForage;
  private knowledgeBaseStore: LocalForage;
  private preferences: StoragePreferences | null = null;

  constructor() {
    this.preferencesStore = localForage.createInstance({
      name: 'YinxinStorage',
      storeName: 'preferences',
    });

    this.conversationsStore = localForage.createInstance({
      name: 'YinxinStorage',
      storeName: 'conversations',
    });

    this.knowledgeBaseStore = localForage.createInstance({
      name: 'YinxinStorage',
      storeName: 'knowledgeBase',
    });
  }

  async getPreferences(): Promise<StoragePreferences> {
    if (this.preferences) {
      return this.preferences;
    }
    const saved = await this.preferencesStore.getItem<StoragePreferences>('preferences');
    this.preferences = saved || {
      mode: 'hybrid',
      autoSync: true,
    };
    return this.preferences;
  }

  async setPreferences(prefs: Partial<StoragePreferences>): Promise<void> {
    this.preferences = {
      ...(await this.getPreferences()),
      ...prefs,
    };
    await this.preferencesStore.setItem('preferences', this.preferences);
  }

  async saveLocalConversation(conversation: any): Promise<void> {
    await this.conversationsStore.setItem(conversation.id, conversation);
  }

  async getLocalConversations(): Promise<any[]> {
    const keys = await this.conversationsStore.keys();
    const conversations: any[] = [];
    for (const key of keys) {
      const conv = await this.conversationsStore.getItem<any>(key);
      if (conv) {
        conversations.push(conv);
      }
    }
    return conversations.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async deleteLocalConversation(id: string): Promise<void> {
    await this.conversationsStore.removeItem(id);
  }

  async shouldUseCloud(): Promise<boolean> {
    const prefs = await this.getPreferences();
    return prefs.mode === 'cloud' || prefs.mode === 'hybrid';
  }

  async shouldUseLocal(): Promise<boolean> {
    const prefs = await this.getPreferences();
    return prefs.mode === 'local' || prefs.mode === 'hybrid';
  }

  async getKnowledgeBase(): Promise<any[]> {
    const keys = await this.knowledgeBaseStore.keys();
    const knowledgeBase: any[] = [];
    for (const key of keys) {
      const item = await this.knowledgeBaseStore.getItem<any>(key);
      if (item) {
        knowledgeBase.push(item);
      }
    }
    return knowledgeBase;
  }

  async importKnowledgeBase(items: any[]): Promise<void> {
    await this.knowledgeBaseStore.clear();
    for (const item of items) {
      await this.knowledgeBaseStore.setItem(item.id || item.name, item);
    }
  }

  async syncData(): Promise<void> {
    const prefs = await this.getPreferences();
    if (prefs.mode !== 'hybrid') {
      return;
    }
    
    const lastSync = prefs.lastSyncTime;
    const now = new Date().toISOString();
    
    if (prefs.autoSync) {
      await this.setPreferences({ lastSyncTime: now });
    }
  }
}

export const storageManager = new StorageManager();
