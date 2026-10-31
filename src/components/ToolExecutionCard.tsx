import React, { useState } from 'react';
import {
  Calculator,
  ArrowRightLeft,
  Percent,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import { ToolExecution } from '../types/chat';

interface ToolExecutionCardProps {
  tool: ToolExecution;
}

export const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({ tool }) => {
  const [expanded, setExpanded] = useState(false);

  const getToolMeta = () => {
    switch (tool.toolName) {
      case 'calculate':
        return {
          displayName: 'Calculator',
          icon: <Calculator className="w-3.5 h-3.5 text-emerald-400" />,
          badgeColor: 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300',
        };
      case 'convert_units':
        return {
          displayName: 'Unit Converter',
          icon: <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />,
          badgeColor: 'bg-sky-950/60 border-sky-800/80 text-sky-300',
        };
      case 'calculate_percentage':
        return {
          displayName: 'Percentage Calculator',
          icon: <Percent className="w-3.5 h-3.5 text-amber-400" />,
          badgeColor: 'bg-amber-950/60 border-amber-800/80 text-amber-300',
        };
      default:
        return {
          displayName: tool.toolName,
          icon: <Cpu className="w-3.5 h-3.5 text-indigo-400" />,
          badgeColor: 'bg-indigo-950/60 border-indigo-800/80 text-indigo-300',
        };
    }
  };

  const meta = getToolMeta();

  const renderSummary = () => {
    if (tool.toolName === 'calculate') {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="text-slate-400 font-mono text-[11px]">Expression:</span>
            <code className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-indigo-300 text-xs font-semibold">
              {tool.args?.expression || 'N/A'}
            </code>
          </div>
          {tool.result?.result !== undefined && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-mono text-[11px]">Result:</span>
              <span className="font-semibold text-emerald-300 font-mono text-sm">
                {tool.result.formatted ?? tool.result.result}
              </span>
            </div>
          )}
        </div>
      );
    }

    if (tool.toolName === 'convert_units') {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="text-slate-400 font-mono text-[11px]">Conversion:</span>
            <span className="font-medium text-slate-200">
              {tool.args?.value} {tool.args?.from_unit} → {tool.args?.to_unit}
            </span>
          </div>
          {tool.result?.converted_value !== undefined && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-mono text-[11px]">Result:</span>
              <span className="font-semibold text-sky-300 font-mono text-sm">
                {tool.result.converted_value} {tool.result.to_unit}
              </span>
              {tool.result.formula && (
                <span className="text-[11px] text-slate-400 ml-1">({tool.result.formula})</span>
              )}
            </div>
          )}
        </div>
      );
    }

    if (tool.toolName === 'calculate_percentage') {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="text-slate-400 font-mono text-[11px]">Operation:</span>
            <span className="font-medium text-slate-200 capitalize">
              {(tool.args?.operation || '').replace('_', ' ')}
            </span>
            <span className="text-slate-400">
              ({tool.args?.value1}, {tool.args?.value2})
            </span>
          </div>
          {tool.result && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400 font-mono text-[11px]">Result:</span>
              <span className="font-semibold text-amber-300 font-mono text-sm">
                {tool.result.summary || tool.result.result}
              </span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="text-xs text-slate-300">
        <span className="font-mono text-slate-400">Args:</span> {JSON.stringify(tool.args)}
      </div>
    );
  };

  return (
    <div className="my-2.5 rounded-xl border border-slate-800 bg-[#0c1222] shadow-sm overflow-hidden text-slate-200 transition-all">
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#0e162a]/90 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-slate-900 border border-slate-800">
            {meta.icon}
          </div>
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
            TOOL EXECUTED: <span className="font-mono text-indigo-300 lowercase">{tool.toolName}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {tool.status === 'Successful' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Successful
            </span>
          )}

          {tool.status === 'executing' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-800/80">
              <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />
              Executing...
            </span>
          )}

          {tool.status === 'Error' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-950/80 text-rose-300 border border-rose-800/80">
              <AlertCircle className="w-3 h-3 text-rose-400" />
              Error
            </span>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
            title={expanded ? 'Hide JSON details' : 'Show JSON details'}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="p-3 text-xs">
        {renderSummary()}

        {tool.error && (
          <div className="mt-2 p-2 rounded-lg bg-rose-950/30 border border-rose-900/60 text-rose-300 text-xs">
            {tool.error}
          </div>
        )}

        {expanded && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Raw Payload & Output
            </div>
            <pre className="p-2.5 rounded-lg bg-[#070b14] border border-slate-800/90 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
              {JSON.stringify({ input_parameters: tool.args, execution_result: tool.result, status: tool.status }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

