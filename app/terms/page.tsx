import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 返回按钮 */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
          <ArrowLeft size={16} />
          返回首页
        </Link>

        {/* 标题 */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">用户协议</h1>
        <p className="text-sm text-gray-400 mb-8">更新日期：2026年4月29日</p>

        {/* 内容 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">一、协议的接受与修改</h2>
            <p className="mb-2">
              1.1 本协议是您（以下简称"用户"）与引信（中国）技术有限公司（以下简称"本公司"）之间关于使用 Yinxin.AGI.ai（以下简称"本产品"）所订立的协议。
            </p>
            <p className="mb-2">
              1.2 您在使用本产品前，应当认真阅读本协议。一旦您以任何方式使用本产品，即表示您已充分阅读、理解并同意接受本协议的全部内容。
            </p>
            <p>
              1.3 本公司有权在必要时修改本协议内容。协议一旦发生变动，将在相关页面上公布修改后的协议内容。如果不同意所改动的内容，用户可主动取消所获取的服务。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">二、服务说明</h2>
            <p className="mb-2">
              2.1 本产品是一款全栈式私有化AI智能体平台，为用户提供智能问答、文档识别、数据分析、知识库管理、浏览器自动化等服务。
            </p>
            <p className="mb-2">
              2.2 本公司保留随时变更、中断或终止部分或全部服务的权利。本公司行使修改或中断服务的权利时不对用户或任何第三方承担责任。
            </p>
            <p>
              2.3 本产品支持多种AI大语言模型（包括但不限于 DeepSeek、Qwen、Ollama 本地模型等），模型能力由对应模型提供商决定，本公司不对模型输出结果的准确性、完整性做出保证。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">三、用户行为规范</h2>
            <p className="mb-2">
              3.1 用户不得利用本产品从事任何违反法律法规、社会公德或侵害他人合法权益的行为，包括但不限于：
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-2">
              <li>发布、传播危害国家安全、淫秽色情、暴力恐怖、虚假信息等违法内容；</li>
              <li>侵犯他人知识产权、商业秘密、隐私权等合法权益；</li>
              <li>利用本产品进行任何形式的网络攻击、数据窃取或破坏系统安全的行为；</li>
              <li>将本产品用于任何非法用途或未经授权的商业用途；</li>
              <li>对本产品进行反向工程、反编译、反汇编或其他试图获取源代码的行为。</li>
            </ul>
            <p>
              3.2 用户因违反上述规定而引发的任何法律责任，由用户自行承担，与本公司无关。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">四、知识产权</h2>
            <p className="mb-2">
              4.1 本产品的所有技术架构、软件代码、界面设计、文档内容等均受中华人民共和国知识产权法律保护，归本公司所有。
            </p>
            <p>
              4.2 未经本公司书面许可，用户不得以任何形式复制、传播、转让、许可或以其他方式使用本产品的任何部分。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">五、隐私保护</h2>
            <p>
              5.1 本公司重视用户隐私保护，具体的隐私保护政策请参阅《<Link href="/privacy" className="text-green-600 hover:underline">隐私条款</Link>》。本协议中涉及的隐私保护事项，以隐私条款为准。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">六、免责声明</h2>
            <p className="mb-2">
              6.1 AI 生成的内容仅供参考，不构成任何专业建议（包括但不限于法律、财务、税务、医疗等专业领域的建议）。用户应自行判断并承担使用 AI 生成内容的风险。
            </p>
            <p className="mb-2">
              6.2 本公司不对因以下原因导致的服务中断或数据丢失承担责任：
            </p>
            <ul className="list-disc pl-5 space-y-1 mb-2">
              <li>不可抗力因素（如自然灾害、政府行为、网络攻击等）；</li>
              <li>用户自身原因（如操作失误、设备故障等）；</li>
              <li>第三方服务中断（如AI模型提供商服务中断、网络运营商故障等）。</li>
            </ul>
            <p>
              6.3 在法律允许的最大范围内，本公司对用户因使用本产品而遭受的任何间接、附带、特殊或惩罚性损害不承担责任。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">七、协议终止</h2>
            <p className="mb-2">
              7.1 如用户违反本协议的任何条款，本公司有权在不事先通知的情况下终止向该用户提供服务。
            </p>
            <p>
              7.2 协议终止后，本公司无义务为用户保留任何数据，用户应自行提前备份重要数据。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">八、适用法律与争议解决</h2>
            <p>
              8.1 本协议的订立、执行、解释及争议解决均适用中华人民共和国法律。如双方就本协议内容或其执行发生争议，应首先友好协商解决；协商不成的，任何一方均可向本公司所在地有管辖权的人民法院提起诉讼。
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">九、联系方式</h2>
            <p>
              如您对本协议有任何疑问，请通过以下方式联系我们：<br />
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
