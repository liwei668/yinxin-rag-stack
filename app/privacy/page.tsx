import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 返回按钮 */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft size={16} />
          返回首页
        </Link>

        {/* 标题 */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">隐私条款</h1>
        <p className="text-sm text-gray-400 mb-8">更新日期：2026年4月29日</p>

        {/* 内容 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">引言</h2>
            <p>
              引信（中国）技术有限公司（以下简称"本公司"）深知个人信息对您的重要性，并会尽全力保护您的个人信息安全。本隐私条款旨在向您说明本公司如何收集、使用、存储和保护您的个人信息。请您在使用 Yinxin.AGI.ai（以下简称"本产品"）前仔细阅读本条款。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">一、我们收集的信息</h2>
            <p className="mb-2"><strong>1.1 账户信息</strong></p>
            <p className="mb-3">
              当您注册账户时，我们会收集您的用户名、密码（加密存储）、邮箱地址等基本信息。
            </p>
            <p className="mb-2"><strong>1.2 使用数据</strong></p>
            <p className="mb-3">
              我们会自动收集您使用本产品时产生的数据，包括：对话记录、上传的文档内容、搜索查询、模型调用记录等。这些数据主要用于提供服务、优化体验和改进产品功能。
            </p>
            <p className="mb-2"><strong>1.3 设备信息</strong></p>
            <p>
              我们可能收集您的设备类型、操作系统、浏览器类型、IP 地址等信息，用于保障系统安全和优化服务体验。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">二、信息的使用目的</h2>
            <p className="mb-2">我们收集的信息将用于以下目的：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>提供、维护和改进本产品的核心功能；</li>
              <li>处理您的请求并提供AI智能问答、文档分析等服务；</li>
              <li>保障账户安全，防范欺诈和滥用行为；</li>
              <li>分析使用趋势，优化产品体验和功能；</li>
              <li>在获得您同意的情况下，向您发送产品更新和通知。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">三、信息的存储与安全</h2>
            <p className="mb-2">
              3.1 您的数据存储在您本地部署的服务器上。本产品支持私有化部署，数据不会自动上传至第三方云服务。
            </p>
            <p className="mb-2">
              3.2 当您使用云端AI模型服务（如 DeepSeek、Qwen 等）时，您的对话内容会发送至对应的模型提供商进行处理。具体隐私政策请参阅各模型提供商的隐私条款。
            </p>
            <p>
              3.3 我们采用合理的技术手段和管理措施保护您的个人信息安全，包括数据加密存储、访问权限控制、安全审计等。但请注意，互联网环境并非绝对安全，我们无法保证信息的绝对安全。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">四、信息的共享与披露</h2>
            <p className="mb-2">
              4.1 未经您的同意，本公司不会向任何第三方共享、转让或公开披露您的个人信息，但以下情况除外：
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-2">
              <li>与提供AI模型服务的合作伙伴共享（仅限处理您的请求所必需的数据）；</li>
              <li>根据法律法规的要求或政府部门的强制性要求；</li>
              <li>为维护本公司的合法权益（如诉讼、仲裁等）；</li>
              <li>在紧急情况下为保护用户或公众的人身财产安全。</li>
            </ul>
            <p>
              4.2 本公司不会将您的个人信息出售给任何第三方。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">五、您的权利</h2>
            <p className="mb-2">根据适用的法律法规，您享有以下权利：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>访问权：</strong>您有权查看和获取您的个人信息；</li>
              <li><strong>更正权：</strong>您有权要求更正不准确或不完整的个人信息；</li>
              <li><strong>删除权：</strong>您有权要求删除您的个人信息（法律法规另有规定的除外）；</li>
              <li><strong>导出权：</strong>您有权将您的数据导出为可读格式；</li>
              <li><strong>撤回同意权：</strong>您有权撤回之前给予的同意。</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">六、Cookie 与本地存储</h2>
            <p>
              本产品可能使用 Cookie 和本地存储技术来保存您的偏好设置、会话状态等信息。您可以通过浏览器设置管理或清除 Cookie，但这可能影响部分功能的正常使用。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">七、未成年人保护</h2>
            <p>
              本产品不面向未满 14 周岁的未成年人提供服务。如果我们发现收集了未成年人的个人信息，将尽快删除相关信息。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">八、隐私条款的更新</h2>
            <p>
              本公司可能会不时更新本隐私条款。更新后的条款将在本页面上公布，并更新"更新日期"。建议您定期查看本条款以了解最新的隐私保护措施。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">九、联系我们</h2>
            <p>
              如您对本隐私条款有任何疑问、意见或建议，请通过以下方式联系我们：<br />
              邮箱：contact@yinxin.ai<br />
              公司名称：引信（中国）技术有限公司
            </p>
          </section>
        </div>

        {/* 底部 */}
        <p className="text-center text-xs text-gray-400 mt-8">© 2026 引信（中国）技术有限公司 版权所有</p>
      </div>
    </div>
  );
}
