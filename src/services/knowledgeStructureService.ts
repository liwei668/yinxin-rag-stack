import {
  loadKnowledgeStructure,
  saveKnowledgeStructure,
  addOperationLog,
  buildTreeFromList,
  generateId,
  KnowledgeStructureItem
} from '../lib/knowledgeStructureStorage';
import { vectorDB } from '../lib/vectorDB';

export class KnowledgeStructureService {
  // 获取知识库结构（树形）
  async getKnowledgeTree(): Promise<KnowledgeStructureItem[]> {
    const list = await loadKnowledgeStructure();
    return buildTreeFromList(list);
  }

  // 获取知识库结构（列表）
  async getKnowledgeList(): Promise<KnowledgeStructureItem[]> {
    return await loadKnowledgeStructure();
  }

  // 创建知识库/分类
  async createKnowledgeItem(
    data: {
      name: string;
      parentId: string | null;
      level: number;
    },
    userId?: string
  ): Promise<KnowledgeStructureItem> {
    const list = await loadKnowledgeStructure();

    this.validateName(data.name, data.parentId, list);

    const newItem: KnowledgeStructureItem = {
      id: generateId(),
      name: data.name,
      parentId: data.parentId,
      level: data.level,
      isVirtual: false,
      visibility: 'private',
      isArchived: false,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    list.push(newItem);
    await saveKnowledgeStructure(list);

    await addOperationLog({
      type: 'create',
      entityType: data.level === 0 ? 'kb' : 'category',
      entityId: newItem.id,
      entityName: newItem.name,
      after: newItem,
      userId
    });

    return newItem;
  }

  // 重命名知识库/分类
  async renameKnowledgeItem(
    id: string,
    newName: string,
    currentVersion: number,
    userId?: string
  ): Promise<KnowledgeStructureItem> {
    const list = await loadKnowledgeStructure();
    const index = list.findIndex(item => item.id === id);

    if (index === -1) {
      throw new Error('Knowledge item not found');
    }

    const item = list[index];

    if (item.isVirtual) {
      throw new Error('Cannot rename virtual node');
    }

    if (item.version !== currentVersion) {
      throw new Error('Data has been modified, please refresh and try again');
    }

    this.validateName(newName, item.parentId, list, id);

    const beforeData = { ...item };

    item.name = newName;
    item.version += 1;
    item.updatedAt = new Date().toISOString();

    await saveKnowledgeStructure(list);

    await addOperationLog({
      type: 'update',
      entityType: item.level === 0 ? 'kb' : 'category',
      entityId: item.id,
      entityName: item.name,
      before: beforeData,
      after: { ...item },
      userId
    });

    return item;
  }

  // 删除知识库/分类（删除保护）
  async deleteKnowledgeItem(
    id: string,
    moveToUncategorized: boolean = false,
    userId?: string
  ): Promise<void> {
    const list = await loadKnowledgeStructure();
    const item = list.find(i => i.id === id);

    if (!item) {
      throw new Error('Knowledge item not found');
    }

    if (item.isVirtual) {
      throw new Error('Cannot delete virtual node');
    }

    const hasChildren = list.some(i => i.parentId === id);
    if (hasChildren) {
      throw new Error('Cannot delete item with children');
    }

    const beforeData = { ...item };

    const filteredList = list.filter(i => i.id !== id);
    await saveKnowledgeStructure(filteredList);

    await addOperationLog({
      type: 'delete',
      entityType: item.level === 0 ? 'kb' : 'category',
      entityId: item.id,
      entityName: item.name,
      before: beforeData,
      userId
    });
  }

  // 移动分类到另一个知识库
  async moveCategory(
    categoryId: string,
    newParentId: string,
    currentVersion: number,
    userId?: string
  ): Promise<KnowledgeStructureItem> {
    const list = await loadKnowledgeStructure();
    const index = list.findIndex(item => item.id === categoryId);

    if (index === -1) {
      throw new Error('Category not found');
    }

    const category = list[index];

    if (category.level !== 1) {
      throw new Error('Only categories can be moved');
    }

    if (category.version !== currentVersion) {
      throw new Error('Data has been modified, please refresh and try again');
    }

    const newParent = list.find(item => item.id === newParentId);
    if (!newParent || newParent.level !== 0) {
      throw new Error('Invalid target parent');
    }

    const beforeData = { ...category };

    category.parentId = newParentId;
    category.version += 1;
    category.updatedAt = new Date().toISOString();

    await saveKnowledgeStructure(list);

    await addOperationLog({
      type: 'move',
      entityType: 'category',
      entityId: category.id,
      entityName: category.name,
      before: beforeData,
      after: { ...category },
      userId
    });

    return category;
  }

  // 切换可见性
  async toggleVisibility(
    id: string,
    visibility: 'private' | 'team' | 'public',
    currentVersion: number,
    userId?: string
  ): Promise<KnowledgeStructureItem> {
    const list = await loadKnowledgeStructure();
    const index = list.findIndex(item => item.id === id);

    if (index === -1) {
      throw new Error('Knowledge item not found');
    }

    const item = list[index];

    if (item.isVirtual) {
      throw new Error('Cannot modify virtual node');
    }

    if (item.version !== currentVersion) {
      throw new Error('Data has been modified, please refresh and try again');
    }

    const beforeData = { ...item };

    item.visibility = visibility;
    item.version += 1;
    item.updatedAt = new Date().toISOString();

    await saveKnowledgeStructure(list);

    await addOperationLog({
      type: 'update',
      entityType: item.level === 0 ? 'kb' : 'category',
      entityId: item.id,
      entityName: item.name,
      before: beforeData,
      after: { ...item },
      userId
    });

    return item;
  }

  // 归档/取消归档
  async toggleArchive(
    id: string,
    isArchived: boolean,
    currentVersion: number,
    userId?: string
  ): Promise<KnowledgeStructureItem> {
    const list = await loadKnowledgeStructure();
    const index = list.findIndex(item => item.id === id);

    if (index === -1) {
      throw new Error('Knowledge item not found');
    }

    const item = list[index];

    if (item.isVirtual) {
      throw new Error('Cannot modify virtual node');
    }

    if (item.version !== currentVersion) {
      throw new Error('Data has been modified, please refresh and try again');
    }

    const beforeData = { ...item };

    item.isArchived = isArchived;
    item.version += 1;
    item.updatedAt = new Date().toISOString();

    await saveKnowledgeStructure(list);

    await addOperationLog({
      type: 'update',
      entityType: item.level === 0 ? 'kb' : 'category',
      entityId: item.id,
      entityName: item.name,
      before: beforeData,
      after: { ...item },
      userId
    });

    return item;
  }

  // 验证名称
  private validateName(
    name: string,
    parentId: string | null,
    list: KnowledgeStructureItem[],
    excludeId?: string
  ): void {
    if (!name || !name.trim()) {
      throw new Error('名称不能为空');
    }

    if (name.length > 50) {
      throw new Error('名称不能超过50个字符');
    }

    if (/[\/:*?"<>|]/.test(name)) {
      throw new Error('名称不能包含特殊字符');
    }

    const duplicate = list.find(item =>
      item.parentId === parentId &&
      item.name === name &&
      item.id !== excludeId
    );

    if (duplicate) {
      throw new Error('同级目录下已存在同名文件夹');
    }
  }

  // ==================== 文档管理方法 ====================
  
  // 获取指定目录下的文档
  async getDocumentsByPath(kbId: string, categoryId?: string) {
    await vectorDB.init();
    return await vectorDB.getDocumentsByPath(kbId, categoryId);
  }

  // 上传文档到指定目录
  async uploadDocument(
    kbId: string,
    categoryId: string | null,
    content: string,
    metadata: any,
    userId?: string
  ) {
    const list = await loadKnowledgeStructure();
    
    // 验证知识库存在
    const kbItem = list.find(item => item.id === kbId);
    if (!kbItem) {
      throw new Error('知识库不存在');
    }

    // 如果指定了分类，验证分类存在
    if (categoryId) {
      const categoryItem = list.find(item => item.id === categoryId && item.parentId === kbId);
      if (!categoryItem) {
        throw new Error('分类不存在');
      }
    }

    // 构建完整的 metadata
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const categories: string[] = [kbItem.name];
    
    if (categoryId) {
      const categoryItem = list.find(item => item.id === categoryId);
      if (categoryItem) {
        categories.push(categoryItem.name);
      }
    }

    const fullMetadata = {
      ...metadata,
      kbId,
      categoryId: categoryId || undefined,
      categories, // 兼容旧版字段
      parentKnowledgeBaseId: kbId, // 兼容旧版字段
      uploadDate: new Date().toISOString()
    };

    // 添加到 vectorDB
    await vectorDB.init();
    await vectorDB.addDocuments([{
      id: docId,
      content,
      metadata: fullMetadata
    }]);

    // 记录操作日志
    await addOperationLog({
      type: 'create',
      entityType: 'document',
      entityId: docId,
      entityName: fullMetadata.fileName || '未命名文档',
      after: { kbId, categoryId, metadata: fullMetadata },
      userId
    });

    return { id: docId, metadata: fullMetadata };
  }

  // 删除文档
  async deleteDocument(docId: string, userId?: string) {
    await vectorDB.init();
    const docs = await vectorDB.getDocuments();
    const doc = docs.find(d => d.id === docId);
    
    if (!doc) {
      throw new Error('文档不存在');
    }

    await vectorDB.deleteDocument(docId);

    // 记录操作日志
    await addOperationLog({
      type: 'delete',
      entityType: 'document',
      entityId: docId,
      entityName: doc.metadata?.fileName || '未命名文档',
      before: doc,
      userId
    });
  }

  // 更新文档内容
  async updateDocument(
    docId: string,
    newContent: string,
    userId?: string
  ) {
    await vectorDB.init();
    const docs = await vectorDB.getDocuments();
    const doc = docs.find(d => d.id === docId);
    
    if (!doc) {
      throw new Error('文档不存在');
    }

    const beforeData = { ...doc };

    await vectorDB.deleteDocument(docId);

    await vectorDB.addDocuments([{
      id: docId,
      content: newContent,
      metadata: doc.metadata
    }]);

    await addOperationLog({
      type: 'update',
      entityType: 'document',
      entityId: docId,
      entityName: doc.metadata?.fileName || '未命名文档',
      before: beforeData,
      after: { contentLength: newContent.length },
      userId
    });

    return { success: true, id: docId };
  }

  // 移动文档到新目录
  async moveDocument(
    docId: string,
    newKbId: string,
    newCategoryId: string | null,
    userId?: string
  ) {
    const list = await loadKnowledgeStructure();
    
    // 验证新知识库存在
    const newKbItem = list.find(item => item.id === newKbId);
    if (!newKbItem) {
      throw new Error('目标知识库不存在');
    }

    // 如果指定了新分类，验证分类存在
    if (newCategoryId) {
      const newCategoryItem = list.find(item => item.id === newCategoryId && item.parentId === newKbId);
      if (!newCategoryItem) {
        throw new Error('目标分类不存在');
      }
    }

    // 获取文档
    await vectorDB.init();
    const docs = await vectorDB.getDocuments();
    const doc = docs.find(d => d.id === docId);
    
    if (!doc) {
      throw new Error('文档不存在');
    }

    const beforeData = { ...doc };

    // 构建新的 categories
    const newCategories: string[] = [newKbItem.name];
    if (newCategoryId) {
      const newCategoryItem = list.find(item => item.id === newCategoryId);
      if (newCategoryItem) {
        newCategories.push(newCategoryItem.name);
      }
    }

    // 更新文档 metadata
    await vectorDB.updateDocumentMetadata(docId, {
      kbId: newKbId,
      categoryId: newCategoryId || undefined,
      categories: newCategories,
      parentKnowledgeBaseId: newKbId
    });

    // 记录操作日志
    await addOperationLog({
      type: 'move',
      entityType: 'document',
      entityId: docId,
      entityName: doc.metadata?.fileName || '未命名文档',
      before: beforeData,
      after: { kbId: newKbId, categoryId: newCategoryId },
      userId
    });
  }
}

export default new KnowledgeStructureService();
