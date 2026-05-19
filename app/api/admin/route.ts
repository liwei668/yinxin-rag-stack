import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '../../../src/lib/auth';
import { userStore } from '../../../src/lib/userStore';
import { configStore } from '../../../src/lib/configStore';
import { modelStore } from '../../../src/lib/modelStore';
import { categoryStore } from '../../../src/lib/categoryStore';
import { apiStore } from '../../../src/lib/apiStore';
import { hashPassword } from '../../../src/lib/auth';
import { logger } from '../../../src/lib/logger';

// 验证管理员权限
const verifyAdmin = (request: NextRequest) => {
  const authCookie = request.cookies.get('auth_token');

  if (!authCookie) {
    return { valid: false, error: '未登录' };
  }

  const payload = verifyToken(authCookie.value);
  if (!payload) {
    return { valid: false, error: 'Token已过期或无效' };
  }

  const user = userStore.findOne({ id: payload.userId });
  if (!user) {
    return { valid: false, error: '用户不存在' };
  }

  if (user.role !== 'admin') {
    return { valid: false, error: '权限不足' };
  }

  return { valid: true, user };
};

// 管理员API
export async function GET(request: NextRequest) {
  const { valid, error } = verifyAdmin(request);
  if (!valid) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  switch (action) {
    case 'users':
      const users = userStore.getAll();
      return NextResponse.json({
        success: true,
        users: users.map(user => ({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role || 'user',
          isActive: user.isActive,
          avatar: user.avatar || '',
          storagePreference: user.storagePreference || 'hybrid',
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
        })),
      });

    case 'config':
      // 获取系统配置（新接口：getAll 返回分组对象）
      const configs = configStore.getAll();
      return NextResponse.json({
        success: true,
        configs,
      });

    case 'models':
      // 获取模型列表
      const models = modelStore.getAll();
      return NextResponse.json({
        success: true,
        models,
      });

    case 'categories':
      // 获取分类列表
      const categories = categoryStore.getAll();
      return NextResponse.json({
        success: true,
        categories,
      });

    case 'apis':
      // 获取API列表（新结构）
      const apis = apiStore.getAll();
      // 返回时脱敏 apiKey
      const maskedApis = apis.map(api => ({
        ...api,
        apiKey: apiStore.maskApiKey(api.apiKey),
      }));
      return NextResponse.json({
        success: true,
        apis: maskedApis,
      });

    default:
      return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const { valid, error } = verifyAdmin(request);
  if (!valid) {
    return NextResponse.json({ error }, { status: 401 });
  }

  const { action, data } = await request.json();

  switch (action) {
    case 'createUser':
      // 创建用户
      try {
        const { username, email, password, role } = data;

        if (!username || !email || !password) {
          return NextResponse.json({ error: '用户名、邮箱和密码都是必填项' }, { status: 400 });
        }

        const existingUser = userStore.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          return NextResponse.json({ error: '该邮箱已被注册' }, { status: 409 });
        }

        const hashedPassword = await hashPassword(password);
        const userId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

        const userData = {
          id: userId,
          username: username.trim(),
          email: email.toLowerCase(),
          password: hashedPassword,
          role: role || 'user',
          storagePreference: 'hybrid',
          avatar: '',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const user = userStore.create(userData);

        return NextResponse.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
          },
        });
      } catch (error) {
        logger.error('SYSTEM', '创建用户失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '创建用户失败' }, { status: 500 });
      }

    case 'updateUser':
      try {
        const { id, username, email, role, isActive, storagePreference, password } = data;

        const user = userStore.findOne({ id });
        if (!user) {
          return NextResponse.json({ error: '用户不存在' }, { status: 404 });
        }

        const updatedData: any = {};
        if (username) updatedData.username = username.trim();
        if (email) updatedData.email = email.toLowerCase();
        if (role) updatedData.role = role;
        if (isActive !== undefined) updatedData.isActive = isActive;
        if (storagePreference) updatedData.storagePreference = storagePreference;
        if (password) updatedData.password = await hashPassword(password);
        updatedData.updatedAt = new Date();

        const updatedUser = userStore.update(id, updatedData);

        return NextResponse.json({
          success: true,
          user: {
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
            storagePreference: updatedUser.storagePreference,
          },
        });
      } catch (error) {
        logger.error('SYSTEM', '更新用户失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '更新用户失败' }, { status: 500 });
      }

    case 'deleteUser':
      try {
        const { id } = data;

        const user = userStore.findOne({ id });
        if (!user) {
          return NextResponse.json({ error: '用户不存在' }, { status: 404 });
        }

        userStore.delete(id);

        return NextResponse.json({ success: true });
      } catch (error) {
        logger.error('SYSTEM', '删除用户失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '删除用户失败' }, { status: 500 });
      }

    case 'batchUpdateUsers':
      try {
        const { ids, updates } = data;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ error: '请选择要操作的用户' }, { status: 400 });
        }

        const updateData: any = {};
        if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
        updateData.updatedAt = new Date();

        let successCount = 0;
        for (const id of ids) {
          const user = userStore.findOne({ id });
          if (user) {
            userStore.update(id, updateData);
            successCount++;
          }
        }

        return NextResponse.json({ success: true, count: successCount });
      } catch (error) {
        logger.error('SYSTEM', '批量更新用户失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '批量更新用户失败' }, { status: 500 });
      }

    case 'batchDeleteUsers':
      try {
        const { ids } = data;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ error: '请选择要删除的用户' }, { status: 400 });
        }

        let successCount = 0;
        for (const id of ids) {
          const user = userStore.findOne({ id });
          if (user) {
            userStore.delete(id);
            successCount++;
          }
        }

        return NextResponse.json({ success: true, count: successCount });
      } catch (error) {
        logger.error('SYSTEM', '批量删除用户失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '批量删除用户失败' }, { status: 500 });
      }

    case 'resetPassword':
      try {
        const { id, tempPassword } = data;

        const user = userStore.findOne({ id });
        if (!user) {
          return NextResponse.json({ error: '用户不存在' }, { status: 404 });
        }

        const hashedPassword = await hashPassword(tempPassword);
        userStore.update(id, { password: hashedPassword, updatedAt: new Date() });

        return NextResponse.json({ success: true });
      } catch (error) {
        logger.error('SYSTEM', '重置密码失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '重置密码失败' }, { status: 500 });
      }

    case 'updateConfig':
      // 更新系统配置（新接口：set(group, key, value)）
      try {
        const { group, key, value } = data;

        if (!group || !key) {
          return NextResponse.json({ error: '配置分组和键不能为空' }, { status: 400 });
        }

        configStore.set(group as any, key, value);

        return NextResponse.json({
          success: true,
          config: configStore.get(group as any, key as any),
        });
      } catch (error) {
        logger.error('SYSTEM', '更新配置失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '更新配置失败' }, { status: 500 });
      }

    case 'updateConfigGroup':
      // 更新配置分组（支持单key或批量values）
      try {
        const { group, key, value, values } = data;

        if (!group) {
          return NextResponse.json({ error: '配置分组不能为空' }, { status: 400 });
        }

        if (values && typeof values === 'object') {
          // 批量更新
          for (const [k, v] of Object.entries(values)) {
            configStore.set(group as any, k, v);
          }
        } else if (key !== undefined && value !== undefined) {
          // 单个更新
          configStore.set(group as any, key, value);
        } else {
          return NextResponse.json({ error: '配置值不能为空' }, { status: 400 });
        }

        return NextResponse.json({
          success: true,
          config: configStore.getGroup(group as any),
        });
      } catch (error) {
        logger.error('SYSTEM', '批量更新配置失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '批量更新配置失败' }, { status: 500 });
      }

    case 'createModel':
      // 创建模型
      try {
        const modelData = data;
        const { user } = verifyAdmin(request);

        const newModel = modelStore.create({
          ...modelData,
          createdBy: user.username,
        });

        return NextResponse.json({
          success: true,
          model: newModel,
        });
      } catch (error) {
        logger.error('SYSTEM', '创建模型失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '创建模型失败' }, { status: 500 });
      }

    case 'updateModel':
      // 更新模型
      try {
        const { id, ...modelData } = data;

        const updatedModel = modelStore.update(id, modelData);
        if (!updatedModel) {
          return NextResponse.json({ error: '模型不存在' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          model: updatedModel,
        });
      } catch (error) {
        logger.error('SYSTEM', '更新模型失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '更新模型失败' }, { status: 500 });
      }

    case 'deleteModel':
      // 删除模型
      try {
        const { id } = data;

        const success = modelStore.delete(id);
        if (!success) {
          return NextResponse.json({ error: '删除模型失败，可能是默认模型' }, { status: 400 });
        }

        return NextResponse.json({ success: true });
      } catch (error) {
        logger.error('SYSTEM', '删除模型失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '删除模型失败' }, { status: 500 });
      }

    case 'setDefaultModel':
      // 设置默认模型
      try {
        const { id } = data;

        const model = modelStore.setDefault(id);
        if (!model) {
          return NextResponse.json({ error: '模型不存在' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          model,
        });
      } catch (error) {
        logger.error('SYSTEM', '设置默认模型失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '设置默认模型失败' }, { status: 500 });
      }

    case 'toggleModelStatus':
      // 启用/禁用模型
      try {
        const { id, isEnabled } = data;

        const model = modelStore.toggleStatus(id, isEnabled);
        if (!model) {
          return NextResponse.json({ error: '模型不存在' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          model,
        });
      } catch (error) {
        logger.error('SYSTEM', '切换模型状态失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '切换模型状态失败' }, { status: 500 });
      }

    case 'createCategory':
      // 创建分类
      try {
        const { name, description } = data;

        if (!name) {
          return NextResponse.json({ error: '分类名称不能为空' }, { status: 400 });
        }

        const existingCategory = categoryStore.findByName(name);
        if (existingCategory) {
          return NextResponse.json({ error: '分类名称已存在' }, { status: 409 });
        }

        const newCategory = categoryStore.create({ name, description });

        return NextResponse.json({
          success: true,
          category: newCategory,
        });
      } catch (error) {
        logger.error('SYSTEM', '创建分类失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '创建分类失败' }, { status: 500 });
      }

    case 'updateCategory':
      // 更新分类
      try {
        const { id, name, description } = data;

        const category = categoryStore.update(id, { name, description });
        if (!category) {
          return NextResponse.json({ error: '分类不存在' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          category,
        });
      } catch (error) {
        logger.error('SYSTEM', '更新分类失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '更新分类失败' }, { status: 500 });
      }

    case 'deleteCategory':
      // 删除分类
      try {
        const { id } = data;

        categoryStore.delete(id);

        return NextResponse.json({ success: true });
      } catch (error) {
        logger.error('SYSTEM', '删除分类失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '删除分类失败' }, { status: 500 });
      }

    case 'testModel':
      // 测试模型连接
      try {
        const { id } = data;
        const result = await modelStore.testModel(id);
        return NextResponse.json({
          success: true,
          testResult: result,
        });
      } catch (error) {
        logger.error('SYSTEM', '测试模型失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '测试模型失败' }, { status: 500 });
      }

    case 'resetModelMetrics':
      // 重置模型指标
      try {
        const { id } = data;
        const model = modelStore.resetMetrics(id);
        if (!model) {
          return NextResponse.json({ error: '模型不存在' }, { status: 404 });
        }
        return NextResponse.json({
          success: true,
          model,
        });
      } catch (error) {
        logger.error('SYSTEM', '重置模型指标失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '重置模型指标失败' }, { status: 500 });
      }

    case 'updateUserRole':
      // 更新用户角色
      try {
        const { id, role } = data;

        const user = userStore.findOne({ id });
        if (!user) {
          return NextResponse.json({ error: '用户不存在' }, { status: 404 });
        }

        if (!['user', 'admin'].includes(role)) {
          return NextResponse.json({ error: '无效的角色' }, { status: 400 });
        }

        const updatedUser = userStore.update(id, { role, updatedAt: new Date() });
        return NextResponse.json({
          success: true,
          user: {
            id: updatedUser!.id,
            username: updatedUser!.username,
            email: updatedUser!.email,
            role: updatedUser!.role,
            isActive: updatedUser!.isActive,
          },
        });
      } catch (error) {
        logger.error('SYSTEM', '更新用户角色失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '更新用户角色失败' }, { status: 500 });
      }

    case 'createApi':
      // 创建API（新结构：使用 api_id）
      try {
        const apiData = data;

        const newApi = apiStore.create(apiData);

        return NextResponse.json({
          success: true,
          api: newApi,
        });
      } catch (error: any) {
        logger.error('SYSTEM', '创建API失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: error.message || '创建API失败' }, { status: 400 });
      }

    case 'updateApi':
      // 更新API（新结构：使用 api_id）
      try {
        const { api_id, ...apiData } = data;

        const updatedApi = apiStore.update(api_id, apiData);
        if (!updatedApi) {
          return NextResponse.json({ error: 'API不存在' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          api: updatedApi,
        });
      } catch (error: any) {
        logger.error('SYSTEM', '更新API失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: error.message || '更新API失败' }, { status: 400 });
      }

    case 'deleteApi':
      // 删除API（新结构：使用 api_id，先检查依赖）
      try {
        const { api_id } = data;

        // 检查是否有模型依赖此 API
        const dependency = apiStore.checkDependency(api_id);
        if (dependency.hasDependency) {
          return NextResponse.json({
            error: `无法删除，以下模型依赖此API: ${dependency.modelNames.join(', ')}`,
          }, { status: 400 });
        }

        const success = apiStore.delete(api_id);
        if (!success) {
          return NextResponse.json({ error: 'API不存在' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
      } catch (error) {
        logger.error('SYSTEM', '删除API失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '删除API失败' }, { status: 500 });
      }

    case 'toggleApiStatus':
      // 启用/禁用API（新结构：使用 isActive）
      try {
        const { api_id, isActive } = data;

        const updatedApi = apiStore.update(api_id, { isActive });
        if (!updatedApi) {
          return NextResponse.json({ error: 'API不存在' }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          api: updatedApi,
        });
      } catch (error) {
        logger.error('SYSTEM', '切换API状态失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '切换API状态失败' }, { status: 500 });
      }

    case 'testApi':
      // 测试API连接（新接口：testConnection）
      try {
        const { api_id } = data;
        const result = await apiStore.testConnection(api_id);
        return NextResponse.json({
          success: true,
          testResult: result,
        });
      } catch (error) {
        logger.error('SYSTEM', '测试API失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '测试API失败' }, { status: 500 });
      }

    case 'checkApiDependency':
      // 检查API依赖
      try {
        const { api_id } = data;
        const dependency = apiStore.checkDependency(api_id);
        return NextResponse.json({
          success: true,
          dependency,
        });
      } catch (error) {
        logger.error('SYSTEM', '检查API依赖失败', { extra: { error: String(error) } });
        return NextResponse.json({ error: '检查API依赖失败' }, { status: 500 });
      }

    default:
      return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  }
}
