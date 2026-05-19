'use client';

import React, { useState, useEffect, useRef } from 'react';

interface PromptSuggestionsProps {
  currentInput: string;
  onSelectPrompt: (prompt: string) => void;
  conversationId: string | null;
}

interface PromptSuggestion {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string[];
}

const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  currentInput,
  onSelectPrompt,
  conversationId,
}) => {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 清除之前的定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (currentInput.length > 1) {
      // 防抖 500ms，避免每次输入都发请求
      timerRef.current = setTimeout(() => {
        fetchSuggestions();
      }, 500);
    } else {
      setSuggestions([]);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentInput, conversationId]);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          currentInput,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      // 静默失败，不影响用户体验
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (suggestion: PromptSuggestion) => {
    onSelectPrompt(suggestion.content);
  };

  return (
    <div className="mt-2">
      {loading ? (
        <div className="text-sm text-gray-500">生成提词中...</div>
      ) : suggestions.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-md shadow-sm">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
              onClick={() => handleClick(suggestion)}
            >
              <div className="text-sm font-medium text-gray-800">{suggestion.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{suggestion.description}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default PromptSuggestions;
