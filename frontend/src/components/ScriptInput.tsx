import React, { useState } from 'react';

interface ScriptInputProps {
  onScriptChange: (script: string) => void;
}

export const ScriptInput: React.FC<ScriptInputProps> = ({ onScriptChange }) => {
  const [scriptText, setScriptText] = useState('');

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setScriptText(text);
    onScriptChange(text);
  };

  const charCount = scriptText.length;
  const wordCount = scriptText.trim() ? scriptText.split(/\s+/).length : 0;

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-zinc-400">
        Your script
      </label>
      <textarea
        value={scriptText}
        onChange={handleTextChange}
        placeholder="Paste your video script, blog post, or any content you want to turn into a thread..."
        className="glass-input w-full h-56 p-4 rounded-xl font-mono text-sm leading-relaxed resize-none"
      />
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{charCount.toLocaleString()} characters</span>
        <span>{wordCount.toLocaleString()} words</span>
      </div>
    </div>
  );
};
