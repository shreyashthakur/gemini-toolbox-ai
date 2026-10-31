import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowDown,
  Calculator,
  ArrowRightLeft,
  Percent,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Message, Conversation, AppSettings, FileAttachment, ToolExecution } from './types/chat';
import { AVAILABLE_MODELS, PERSONA_PRESETS } from './constants/presets';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MessageItem } from './components/MessageItem';
import { ChatInput } from './components/ChatInput';
import { SettingsModal } from './components/SettingsModal';
import { ImagePreviewModal } from './components/ImagePreviewModal';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  activeModel: 'gemini-3.8-flash',
  systemInstruction: PERSONA_PRESETS[0].systemPrompt,
  temperature: 0.7,
  activePersonaId: 'general',
  streamResponses: true,
};

const createNewConversation = (model = 'gemini-3.8-flash', systemInstruction = ''): Conversation => ({
  id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  title: 'New Conversation',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [],
  model,
  systemInstruction,
  pinned: false,
});

const QUICK_CHIPS = [
  { label: '125 × 48 + 360 / 6', icon: Calculator, prompt: 'Calculate 125 multiplied by 48 plus 360 divided by 6.' },
  { label: '5 km to miles', icon: ArrowRightLeft, prompt: 'Convert 5 kilometers into miles.' },
  { label: '18% of 2500', icon: Percent, prompt: 'What is 18 percent of 2500?' },
  { label: '12% of 850 & explain', icon: Sparkles, prompt: 'Calculate 12% of 850 and explain the result.' },
  { label: '% increase 250 → 400', icon: Percent, prompt: 'What is the percentage increase from 250 to 400?' },
];

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem('gemini_toolbox_settings_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed, theme: 'dark' };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const stored = localStorage.getItem('gemini_toolbox_conversations_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [createNewConversation(DEFAULT_SETTINGS.activeModel, DEFAULT_SETTINGS.systemInstruction)];
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    return conversations[0]?.id || '';
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');

    // Check server health and API key configuration
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.hasApiKey === 'boolean') {
          setHasApiKey(data.hasApiKey);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gemini_toolbox_settings_v1', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem('gemini_toolbox_conversations_v1', JSON.stringify(conversations));
    } catch {}
  }, [conversations]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [conversations, settings]);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || conversations[0];

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [activeConversationId]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceFromBottom > 150);
  };

  const handleNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;

    if (activeConversation && activeConversation.messages.length === 0) {
      return;
    }

    const fresh = createNewConversation(settings.activeModel, settings.systemInstruction);
    setConversations((prev) => [fresh, ...prev]);
    setActiveConversationId(fresh.id);
  };

  const handleSelectConversation = (id: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    setActiveConversationId(id);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const fresh = createNewConversation(settings.activeModel, settings.systemInstruction);
        setActiveConversationId(fresh.id);
        return [fresh];
      }
      if (activeConversationId === id) {
        setActiveConversationId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c))
    );
  };

  const handleTogglePinConversation = (id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c))
    );
  };

  const handleClearChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? { ...c, messages: [], updatedAt: Date.now() }
          : c
      )
    );
  };

  const handleClearAllConversations = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    const fresh = createNewConversation(settings.activeModel, settings.systemInstruction);
    setConversations([fresh]);
    setActiveConversationId(fresh.id);
  };

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const handleExportChat = () => {
    if (!activeConversation) return;
    const lines = [
      `# ${activeConversation.title}`,
      `Date: ${new Date(activeConversation.createdAt).toLocaleString()}`,
      `Model: ${activeConversation.model || settings.activeModel}`,
      '',
      '---',
      '',
    ];

    for (const msg of activeConversation.messages) {
      const sender = msg.role === 'user' ? 'User' : 'Gemini Toolbox';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      lines.push(`### ${sender} (${time})`);
      lines.push('');
      if (msg.toolExecutions && msg.toolExecutions.length > 0) {
        lines.push('**Agent Tools Executed:**');
        for (const t of msg.toolExecutions) {
          lines.push(`- Tool: \`${t.toolName}\` | Status: ${t.status}`);
          lines.push(`  - Input: \`${JSON.stringify(t.args)}\``);
          lines.push(`  - Output: \`${JSON.stringify(t.result)}\``);
        }
        lines.push('');
      }
      lines.push(msg.content);
      lines.push('');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeConversation.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConversationId) return c;
        const updated = [...c.messages];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'model') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            status: updated[lastIdx].content ? 'complete' : 'error',
            error: updated[lastIdx].content ? undefined : 'Generation stopped by user.',
          };
        }
        return { ...c, messages: updated };
      })
    );
  };

  const generateAssistantResponse = async (
    targetMessages: Message[],
    conversationId: string
  ) => {
    isStreamingRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const conv = conversations.find((c) => c.id === conversationId);
    const activeModel = conv?.model || settings.activeModel;
    const systemInstruction = conv?.systemInstruction || settings.systemInstruction;

    const payloadMessages = targetMessages
      .filter((m) => m.content?.trim() || (m.attachments && m.attachments.length > 0))
      .map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      }));

    try {
      if (settings.streamResponses) {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: payloadMessages,
            model: activeModel,
            systemInstruction,
            temperature: settings.temperature,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server responded with status ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Unable to read streaming response from server.');
        }

        const decoder = new TextDecoder();
        let accumulatedText = '';
        let buffer = '';
        const currentTools: ToolExecution[] = [];

        while (isStreamingRef.current) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                throw new Error(parsed.error);
              }

              if (parsed.type === 'tool_start') {
                const newTool: ToolExecution = {
                  id: parsed.id,
                  toolName: parsed.toolName,
                  args: parsed.args || {},
                  status: 'executing',
                  timestamp: Date.now(),
                };
                currentTools.push(newTool);

                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== conversationId) return c;
                    const msgs = [...c.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === 'model') {
                      msgs[msgs.length - 1] = {
                        ...last,
                        toolExecutions: [...currentTools],
                      };
                    }
                    return { ...c, messages: msgs, updatedAt: Date.now() };
                  })
                );
              } else if (parsed.type === 'tool_result') {
                const idx = currentTools.findIndex((t) => t.id === parsed.id);
                const updatedTool: ToolExecution = {
                  id: parsed.id,
                  toolName: parsed.toolName,
                  args: parsed.args || {},
                  result: parsed.result,
                  error: parsed.error,
                  status: parsed.status,
                  timestamp: parsed.timestamp || Date.now(),
                };

                if (idx >= 0) {
                  currentTools[idx] = updatedTool;
                } else {
                  currentTools.push(updatedTool);
                }

                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== conversationId) return c;
                    const msgs = [...c.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === 'model') {
                      msgs[msgs.length - 1] = {
                        ...last,
                        toolExecutions: [...currentTools],
                      };
                    }
                    return { ...c, messages: msgs, updatedAt: Date.now() };
                  })
                );
              } else if (parsed.type === 'text' || parsed.text) {
                const textChunk = parsed.text || '';
                accumulatedText += textChunk;

                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== conversationId) return c;
                    const msgs = [...c.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === 'model') {
                      msgs[msgs.length - 1] = {
                        ...last,
                        content: accumulatedText,
                        status: 'streaming',
                        toolExecutions: currentTools.length > 0 ? [...currentTools] : last.toolExecutions,
                      };
                    }
                    return { ...c, messages: msgs, updatedAt: Date.now() };
                  })
                );
              } else if (parsed.type === 'complete' && parsed.toolExecutions) {
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== conversationId) return c;
                    const msgs = [...c.messages];
                    const last = msgs[msgs.length - 1];
                    if (last && last.role === 'model') {
                      msgs[msgs.length - 1] = {
                        ...last,
                        toolExecutions: parsed.toolExecutions,
                      };
                    }
                    return { ...c, messages: msgs, updatedAt: Date.now() };
                  })
                );
              }
            } catch (jsonErr: any) {
              if (jsonErr.message && !jsonErr.message.includes('JSON')) {
                throw jsonErr;
              }
            }
          }
        }

        if (isStreamingRef.current) {
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== conversationId) return c;
              const msgs = [...c.messages];
              const last = msgs[msgs.length - 1];
              if (last && last.role === 'model') {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: accumulatedText || last.content,
                  status: 'complete',
                  toolExecutions: currentTools.length > 0 ? [...currentTools] : last.toolExecutions,
                };
              }
              return { ...c, messages: msgs, updatedAt: Date.now() };
            })
          );
        }
      } else {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: payloadMessages,
            model: activeModel,
            systemInstruction,
            temperature: settings.temperature,
          }),
          signal: controller.signal,
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate response.');
        }

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== conversationId) return c;
            const msgs = [...c.messages];
            const last = msgs[msgs.length - 1];
            if (last && last.role === 'model') {
              msgs[msgs.length - 1] = {
                ...last,
                content: data.text || '',
                toolExecutions: data.toolExecutions || undefined,
                status: 'complete',
              };
            }
            return { ...c, messages: msgs, updatedAt: Date.now() };
          })
        );
      }
    } catch (error: any) {
      if (controller.signal.aborted) {
        return;
      }
      console.error('Generation error:', error);
      const errorMessage = error?.message || 'Failed to generate response.';

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          const msgs = [...c.messages];
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'model') {
            msgs[msgs.length - 1] = {
              ...last,
              status: 'error',
              error: errorMessage,
            };
          }
          return { ...c, messages: msgs, updatedAt: Date.now() };
        })
      );
    } finally {
      isStreamingRef.current = false;
      abortControllerRef.current = null;
      setTimeout(() => scrollToBottom(), 50);
    }
  };

  const handleSendMessage = async (content: string, attachments?: FileAttachment[]) => {
    if (!activeConversation) return;

    const trimmed = content.trim();
    // TEST 6: Reject empty input without making an API request
    if (!trimmed && (!attachments || attachments.length === 0)) {
      return;
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      status: 'complete',
      attachments,
    };

    const modelPlaceholder: Message = {
      id: `msg_${Date.now() + 1}_m`,
      role: 'model',
      content: '',
      timestamp: Date.now() + 1,
      status: 'sending',
    };

    const isFirstMessage = activeConversation.messages.length === 0;
    const defaultTitle = attachments && attachments.length > 0 ? `File: ${attachments[0].name}` : 'New Conversation';
    const newTitle = isFirstMessage
      ? (trimmed ? trimmed.slice(0, 36) + (trimmed.length > 36 ? '...' : '') : defaultTitle)
      : activeConversation.title;

    const updatedMessages = [...activeConversation.messages, userMessage, modelPlaceholder];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              title: newTitle,
              messages: updatedMessages,
              updatedAt: Date.now(),
            }
          : c
      )
    );

    setTimeout(() => scrollToBottom(), 50);

    const historyForApi = [...activeConversation.messages, userMessage];
    await generateAssistantResponse(historyForApi, activeConversation.id);
  };

  const handleRegenerate = async () => {
    if (!activeConversation || activeConversation.messages.length === 0) return;

    const updatedMessages = [...activeConversation.messages];
    if (updatedMessages[updatedMessages.length - 1].role === 'model') {
      updatedMessages.pop();
    }

    if (updatedMessages.length === 0) return;

    const modelPlaceholder: Message = {
      id: `msg_${Date.now()}_m`,
      role: 'model',
      content: '',
      timestamp: Date.now(),
      status: 'sending',
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              messages: [...updatedMessages, modelPlaceholder],
              updatedAt: Date.now(),
            }
          : c
      )
    );

    await generateAssistantResponse(updatedMessages, activeConversation.id);
  };

  const handleEditMessage = async (messageIndex: number, newContent: string) => {
    if (!activeConversation) return;

    const truncated = activeConversation.messages.slice(0, messageIndex);
    const editedUserMessage: Message = {
      ...activeConversation.messages[messageIndex],
      content: newContent,
      timestamp: Date.now(),
    };

    const modelPlaceholder: Message = {
      id: `msg_${Date.now()}_m`,
      role: 'model',
      content: '',
      timestamp: Date.now() + 1,
      status: 'sending',
    };

    const newMessages = [...truncated, editedUserMessage, modelPlaceholder];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              messages: newMessages,
              updatedAt: Date.now(),
            }
          : c
      )
    );

    await generateAssistantResponse(
      [...truncated, editedUserMessage],
      activeConversation.id
    );
  };

  const handleFeedback = (messageId: string, feedback: 'like' | 'dislike') => {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConversationId) return c;
        return {
          ...c,
          messages: c.messages.map((m) => {
            if (m.id !== messageId) return m;
            return {
              ...m,
              feedback: m.feedback === feedback ? null : feedback,
            };
          }),
        };
      })
    );
  };

  const isCurrentStreaming = Boolean(
    activeConversation?.messages.some((m) => m.status === 'streaming' || m.status === 'sending')
  );

  return (
    <div className="dark flex h-dvh w-full overflow-hidden bg-[#090d16] text-slate-100 antialiased select-none">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onTogglePinConversation={handleTogglePinConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      <div className="flex flex-col flex-1 h-full min-w-0 relative bg-[#090d16]">
        <TopHeader
          conversation={activeConversation}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onNewChat={handleNewChat}
          onClearChat={handleClearChat}
          onExportChat={handleExportChat}
          onOpenSettings={() => setSettingsOpen(true)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />

        {/* Missing API Key Alert Banner */}
        {hasApiKey === false && (
          <div className="bg-amber-950/70 border-b border-amber-800/80 px-4 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>GEMINI_API_KEY Missing:</strong> Configure <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-amber-700/60 font-mono text-amber-300">GEMINI_API_KEY=your_key</code> in your <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-amber-700/60 font-mono text-amber-300">.env</code> file to enable live Gemini API and Agent Tool execution.
              </span>
            </div>
          </div>
        )}

        <main
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col relative"
        >
          {activeConversation?.messages?.length === 0 ? (
            <WelcomeScreen onSelectPrompt={(prompt) => handleSendMessage(prompt)} />
          ) : (
            <div className="flex-1 pb-4">
              {activeConversation?.messages?.map((msg, idx) => (
                <MessageItem
                  key={msg.id}
                  message={msg}
                  onRegenerate={idx === activeConversation.messages.length - 1 ? handleRegenerate : undefined}
                  onEditMessage={
                    msg.role === 'user' ? (newContent) => handleEditMessage(idx, newContent) : undefined
                  }
                  onFeedback={(fb) => handleFeedback(msg.id, fb)}
                  onImageClick={(base64, name) => setPreviewImage({ url: base64, name })}
                  isLast={idx === activeConversation.messages.length - 1}
                />
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}

          {showScrollBottom && (
            <button
              onClick={() => scrollToBottom('smooth')}
              className="fixed bottom-24 right-5 sm:right-8 z-30 p-2.5 rounded-full bg-slate-800/90 text-slate-200 border border-slate-700/80 shadow-lg hover:bg-slate-700 transition-all backdrop-blur-xs"
              title="Scroll to latest message"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          )}
        </main>

        <div className="shrink-0 px-3 sm:px-4 max-w-3xl mx-auto w-full">
          {activeConversation?.messages?.length === 0 && (
            <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
              {QUICK_CHIPS.map((chip, idx) => {
                const IconComponent = chip.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(chip.prompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-xs text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 whitespace-nowrap transition-colors shadow-xs"
                  >
                    <IconComponent className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ChatInput
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          isStreaming={isCurrentStreaming}
        />
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        conversations={conversations}
        onClearAllConversations={handleClearAllConversations}
      />

      <ImagePreviewModal
        isOpen={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        imageUrl={previewImage?.url || null}
        imageName={previewImage?.name || null}
      />
    </div>
  );
}
