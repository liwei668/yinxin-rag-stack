// 分类存储管理
let categories: any[] = [];

class CategoryStore {
  // 获取所有分类
  getAll() {
    return categories;
  }

  // 添加分类
  create(categoryData: any) {
    const category = {
      id: Date.now().toString(),
      name: categoryData.name,
      description: categoryData.description || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categories.push(category);
    return category;
  }

  // 更新分类
  update(id: string, categoryData: any) {
    const index = categories.findIndex(cat => cat.id === id);
    if (index !== -1) {
      categories[index] = {
        ...categories[index],
        ...categoryData,
        updatedAt: new Date(),
      };
      return categories[index];
    }
    return null;
  }

  // 删除分类
  delete(id: string) {
    categories = categories.filter(cat => cat.id !== id);
    return true;
  }

  // 根据名称查找分类
  findByName(name: string) {
    return categories.find(cat => cat.name.toLowerCase() === name.toLowerCase());
  }

  // 清空所有分类
  clear() {
    categories = [];
  }
}

export const categoryStore = new CategoryStore();
