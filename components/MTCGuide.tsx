'use client';
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, SkipForward, Check } from 'lucide-react';
import { MTC_STEPS, MTC_DEFAULT_CONFIG, MTCConfig } from '../utils/mtc';
import { lockScroll, unlockScroll } from '../utils/scrollLock';

interface MTCGuideProps {
  open: boolean;
  onClose: () => void;
  onComplete: (config: MTCConfig) => void;
  onSkip: () => void;
}

export default function MTCGuide({ open, onClose, onComplete, onSkip }: MTCGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState<MTCConfig>({ ...MTC_DEFAULT_CONFIG });

  const steps = MTC_STEPS;
  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // 滚动锁
  useEffect(() => {
    if (open) lockScroll();
    else unlockScroll();
    return () => unlockScroll();
  }, [open]);

  // 重置步骤
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      setConfig({ ...MTC_DEFAULT_CONFIG });
    }
  }, [open]);

  const handleSelect = (value: string) => {
    setConfig(prev => ({ ...prev, [step.configKey]: value }));
  };

  const handleNext = () => {
    if (isLastStep) {
      onComplete(config);
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (isFirstStep) return;
    setCurrentStep(prev => prev - 1);
  };

  const handleSkip = () => {
    onSkip();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* 引导弹窗 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* 顶部进度条 */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* 头部 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <p className="text-xs text-gray-400">文档生成配置</p>
            <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* 描述 */}
        <p className="px-6 pb-4 text-sm text-gray-500">{step.description}</p>

        {/* 选项卡片 */}
        <div className="px-6 pb-4 space-y-2">
          {step.options.map((option) => {
            const isSelected = config[step.configKey] === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-200 ${
                  isSelected
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected ? 'border-green-500 bg-green-500' : 'border-gray-300'
                  }`}>
                    {isSelected && <Check size={12} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>
                      {option.label}
                    </p>
                    {option.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{option.description}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 底部操作 */}
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <ChevronLeft size={16} />
                上一步
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              title="跳过引导，使用默认配置"
            >
              <SkipForward size={14} />
              跳过
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              {isLastStep ? '开始生成' : '下一步'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>

        {/* 步骤指示器 */}
        <div className="px-6 pb-4 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStep ? 'w-6 bg-green-500' : i < currentStep ? 'w-1.5 bg-green-300' : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
