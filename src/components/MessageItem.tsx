import React, { useState } from 'react';
import {
  Sparkles,
  User,
  Copy,
  Check,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  Edit3,
  AlertCircle,
  FileCode,
  FileText,
  Wrench,
} from 'lucide-react';
import { Message, FileAttachment } from '../types/chat';
import { MarkdownRenderer } from '../utils/markdownParser';
import { ToolExecutionCard } from './ToolExecutionCard';

interface MessageItemProps {
  message: Message;
  onRegenerate?: () => void;
  onEditMessage?: (newContent: string) => void;
  onFeedback?: (feedback: 'like' | 'dislike') => void;
  onImageClick?: (base64: string, name: string) => void;
  isLast: boolean;
}

const formatTimestamp = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onRegenerate,
  onEditMessage,
  onFeedback,
  onImageClick,
  isLast,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isSending = message.status === 'sending';
  const hasError = message.status === 'error';
  const hasToolExecutions = Boolean(message.toolExecutions && message.toolExecutions.length > 0);
  const isExecutingTools = message.toolExecutions?.some((t) => t.status === 'executing');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = message.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleToggleSpeak = () => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message.content);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEditMessage) {
      onEditMessage(editContent.trim());
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`group w-full py-4 px-3 sm:px-6 transition-colors ${
        isUser
          ? 'bg-transparent'
          : 'bg-[#0f172a]/50 border-y border-slate-800/80'
      }`}
    >
      <div className="max-w-3xl mx-auto flex gap-3 sm:gap-4 items-start">
        <div className="shrink-0 mt-0.5">
          {isUser ? (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800 text-slate-200 flex items-center justify-center font-medium text-xs shadow-xs border border-slate-700">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-linear-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-slate-100">
                {isUser ? 'You' : 'Gemini Toolbox'}
              </span>
              <span className="text-[11px] text-slate-500">
                {formatTimestamp(message.timestamp)}
              </span>
              {!isUser && hasToolExecutions && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-800/70">
                  <Wrench className="w-2.5 h-2.5" />
                  Agent Tools Used
                </span>
              )}
              {!isUser && message.modelUsed && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    message.isFallback
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/70'
                      : 'bg-slate-800/80 text-slate-400 border border-slate-700/70'
                  }`}
                  title={message.isFallback ? 'Automatic fallback used due to high demand on primary model' : 'Model used'}
                >
                  {message.isFallback ? `⚡ Fallback: ${message.modelUsed}` : message.modelUsed}
                </span>
              )}
            </div>

            {isUser && !isEditing && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                  title="Edit message"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
                  title="Copy message"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {message.attachments.map((file: FileAttachment) => {
                const isImage = file.mimeType?.startsWith('image/') && file.base64;
                if (isImage) {
                  return (
                    <div
                      key={file.id}
                      onClick={() => onImageClick && onImageClick(file.base64!, file.name)}
                      className="group/img relative cursor-pointer rounded-lg overflow-hidden border border-slate-800 max-w-[200px] max-h-36 bg-[#0f172a]"
                    >
                      <img
                        src={file.base64}
                        alt={file.name}
                        className="object-cover w-full h-full group-hover/img:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-end p-1.5 text-[11px] text-white truncate">
                        {file.name}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-[#0f172a] text-xs text-slate-300"
                  >
                    {file.name.endsWith('.ts') || file.name.endsWith('.js') || file.name.endsWith('.py') ? (
                      <FileCode className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="font-medium truncate max-w-[140px]">{file.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Real Tool Execution Cards */}
          {!isUser && hasToolExecutions && (
            <div className="mb-3 space-y-2">
              {message.toolExecutions!.map((tool) => (
                <ToolExecutionCard key={tool.id} tool={tool} />
              ))}
            </div>
          )}

          {isEditing ? (
            <div className="mt-1 space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="w-full p-2.5 text-sm rounded-lg border border-indigo-500 bg-[#090e1a] text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-md shadow-xs"
                >
                  Save & Resubmit
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-200 break-words leading-relaxed text-sm sm:text-[14.5px]">
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <>
                  {isSending && !message.content ? (
                    <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className={`ml-1 text-xs font-medium ${message.statusMessage ? 'text-amber-400' : 'text-slate-400'}`}>
                        {message.statusMessage || (isExecutingTools ? 'Executing agent tool...' : 'Gemini is thinking...')}
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      {message.content && <MarkdownRenderer content={message.content} />}
                      {isStreaming && (
                        <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {hasError && (
            <div className="mt-2.5 flex items-center justify-between p-3 rounded-lg border border-rose-900/60 bg-rose-950/20 text-rose-300 text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{message.error || 'Failed to generate response.'}</span>
              </div>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-rose-800 rounded text-rose-300 hover:bg-rose-900/40 font-medium transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {!isUser && !isSending && !hasError && message.content && (
            <div className="mt-3 flex items-center gap-1 text-slate-400">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 text-xs transition-colors"
                title="Copy response"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Copy</span>
                  </>
                )}
              </button>

              {onRegenerate && isLast && (
                <button
                  onClick={onRegenerate}
                  className="flex items-center gap-1 p-1.5 rounded hover:bg-slate-800 hover:text-slate-200 text-xs transition-colors"
                  title="Regenerate response"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Retry</span>
                </button>
              )}

              {onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback('like')}
                    className={`p-1.5 rounded hover:bg-slate-800 transition-colors ${
                      message.feedback === 'like'
                        ? 'text-indigo-400 font-semibold'
                        : 'hover:text-slate-200'
                    }`}
                    title="Good response"
                  >
                    <ThumbsUp className={`w-3.5 h-3.5 ${message.feedback === 'like' ? 'fill-indigo-400/20' : ''}`} />
                  </button>
                  <button
                    onClick={() => onFeedback('dislike')}
                    className={`p-1.5 rounded hover:bg-slate-800 transition-colors ${
                      message.feedback === 'dislike'
                        ? 'text-rose-400 font-semibold'
                        : 'hover:text-slate-200'
                    }`}
                    title="Poor response"
                  >
                    <ThumbsDown className={`w-3.5 h-3.5 ${message.feedback === 'dislike' ? 'fill-rose-400/20' : ''}`} />
                  </button>
                </>
              )}

              <button
                onClick={handleToggleSpeak}
                className={`flex items-center gap-1 p-1.5 rounded hover:bg-slate-800 transition-colors ${
                  isSpeaking ? 'text-indigo-400' : 'hover:text-slate-200'
                }`}
                title={isSpeaking ? 'Stop speech' : 'Read aloud'}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
