import React, { useState } from 'react';
import {
  Menu,
  Sparkles,
  ChevronDown,
  Check,
  Wrench,
} from 'lucide-react';
import { Conversation, AppSettings } from '../types/chat';
import { AVAILABLE_MODELS } from '../constants/presets';

interface TopHeaderProps {
  conversation: Conversation;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onClearChat: () => void;
  onExportChat: () => void;
  onOpenSettings: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  conversation,
  onToggleSidebar,
  settings,
  onUpdateSettings,
}) => {
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  const activeModelObj =
    AVAILABLE_MODELS.find((m) => m.id === (conversation?.model || settings.activeModel)) ||
    AVAILABLE_MODELS[0];

  return (
    <header className="h-14 border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between gap-3 z-30 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800/80 transition-colors"
          title="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-slate-100 text-sm truncate max-w-[160px] sm:max-w-xs md:max-w-md">
            {conversation?.title || 'New Conversation'}
          </span>
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-950/70 text-indigo-300 border border-indigo-800/60">
            <Wrench className="w-2.5 h-2.5" />
            Agent Tools Active
          </span>
        </div>
      </div>

      <div className="relative shrink-0">
        <button
          onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-[#0f172a] text-xs font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-700 transition-colors shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">{activeModelObj.name}</span>
          <span className="sm:hidden">{activeModelObj.name.replace('Gemini ', '')}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {modelDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setModelDropdownOpen(false)}
            />
            <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 mt-2 w-64 rounded-xl border border-slate-800 bg-[#0f172a] shadow-xl p-1.5 z-50">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                Select Model
              </div>
              <div className="space-y-0.5 mt-1">
                {AVAILABLE_MODELS.map((model) => {
                  const isSelected = model.id === (conversation?.model || settings.activeModel);
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        onUpdateSettings({ activeModel: model.id });
                        setModelDropdownOpen(false);
                      }}
                      className={`w-full flex items-start justify-between p-2 rounded-lg text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-indigo-950/60 text-indigo-200 font-medium'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <div className="flex-1 mr-2">
                        <div className="flex items-center gap-1.5">
                          <span>{model.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                            {model.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {model.description}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
