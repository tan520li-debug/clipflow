import { useRef, useState } from 'react';
import { Check, Film, Image as ImageIcon, Loader2, Plus, Scissors, Sparkles, Upload, Wand2, X } from 'lucide-react';
import type { EditingStyle, MediaAsset, PlatformId } from '../types/studio';
import { formatEditSeconds } from '../client/timeline/editSeconds';
import { apiFetch } from '../client/api/http';

interface BriefAndMediaPanelProps {
  brief: string;
  onChangeBrief: (val: string) => void;
  editingStyle: EditingStyle;
  onChangeEditingStyle: (style: EditingStyle) => void;
  targetPlatforms: PlatformId[];
  onToggleTargetPlatform: (pid: PlatformId) => void;
  targetDuration: number;
  onChangeTargetDuration: (sec: number) => void;
  bpm: number;
  onChangeBpm: (bpm: number) => void;
  isGenerating: boolean;
  aiError: string | null;
  autoSoundOnEdit: boolean;
  onToggleAutoSound: (enabled: boolean) => void;
  onRunAiAutoEdit: () => void;
  onRunLocalBeatSync: () => void;
  assets: MediaAsset[];
  onUploadFiles: (files: FileList) => void;
  onInsertClipToTimeline: (asset: MediaAsset) => void;
}

type PolishToneGoal = 'viral-hook' | 'storytelling' | 'conversion';

interface PolishedStoryboardResult {
  hookLine: string;
  viralAngle: string;
  shots: Array<{
    shotNumber: number;
    durationRange: string;
    visualCue: string;
    voiceoverLine: string;
  }>;
  polishedBrief: string;
}

const POLISH_TONE_OPTIONS: Array<{ id: PolishToneGoal; label: string }> = [
  { id: 'viral-hook', label: '强钩子高完播' },
  { id: 'storytelling', label: '沉浸故事感' },
  { id: 'conversion', label: '种草高转化' },
];

const BRIEF_PRESETS = [
  {
    label: '手冲咖啡',
    text: '早八人3分钟居家手冲冰拿铁教程：展示磨豆、V60注水蒸汽、浓缩液倒入燕麦奶，最后呈现窗边极简办公桌面。',
  },
  {
    label: '好物测评',
    text: '桌面生产力装备开箱测评：突出产品质感细节、实际使用场景对比和真实口碑推荐，适合海外 TikTok 与国内抖音种草带货。',
  },
  {
    label: '生活方式',
    text: '城市晨间高效工作流 Vlog：从第一杯咖啡开启专注早晨，强调极简审美与安静治愈的生活节奏。',
  },
];

export function BriefAndMediaPanel({
  brief,
  onChangeBrief,
  editingStyle,
  onChangeEditingStyle,
  targetPlatforms,
  onToggleTargetPlatform,
  targetDuration,
  onChangeTargetDuration,
  bpm,
  onChangeBpm,
  isGenerating,
  aiError,
  autoSoundOnEdit,
  onToggleAutoSound,
  onRunAiAutoEdit,
  onRunLocalBeatSync,
  assets,
  onUploadFiles,
  onInsertClipToTimeline,
}: BriefAndMediaPanelProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'media'>('ai');
  const [toneGoal, setToneGoal] = useState<PolishToneGoal>('viral-hook');
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [polishedResult, setPolishedResult] = useState<PolishedStoryboardResult | null>(null);
  const [appliedPolish, setAppliedPolish] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePolishBrief = async () => {
    if (!brief.trim() || polishing) return;
    setPolishing(true);
    setPolishError(null);
    setAppliedPolish(false);

    try {
      const res = await apiFetch('/api/polish-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: brief.trim(),
          editingStyle,
          targetDuration,
          targetPlatforms,
          toneGoal,
          mediaSummary: assets.map((a) => ({
            name: a.name,
            type: a.type,
            duration: a.duration,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 脚本辅助润色失败，请稍后重试。');
      }
      setPolishedResult(data as PolishedStoryboardResult);
    } catch (err: unknown) {
      setPolishError(err instanceof Error ? err.message : 'AI 脚本辅助润色失败，请重试。');
    } finally {
      setPolishing(false);
    }
  };

  const handleApplyPolishedBrief = () => {
    if (!polishedResult?.polishedBrief) return;
    onChangeBrief(polishedResult.polishedBrief);
    setAppliedPolish(true);
  };

  return (
    <aside className="w-[310px] shrink-0 border-r border-zinc-800/90 bg-[#11141B] flex flex-col min-h-0">
      <div className="p-3 border-b border-zinc-800/90">
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D10] rounded-lg border border-zinc-800/80">
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'ai'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            智能自动剪辑
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'media'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            素材库 ({assets.length})
          </button>
        </div>
      </div>

      {activeTab === 'ai' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="brief-input" className="text-xs font-semibold text-zinc-200">
                成片主题与脚手架提示
              </label>
              <span className="text-[11px] text-zinc-500">自动适配多端语言</span>
            </div>
            <textarea
              id="brief-input"
              value={brief}
              onChange={(e) => {
                onChangeBrief(e.target.value);
                if (appliedPolish) setAppliedPolish(false);
              }}
              rows={4}
              placeholder="描述你想生成的短视频内容、卖点或镜头顺序..."
              className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-2.5 text-xs leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500/80 resize-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BRIEF_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChangeBrief(preset.text);
                    setAppliedPolish(false);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-zinc-300 bg-zinc-800/70 hover:bg-zinc-700/80 rounded-md transition-colors whitespace-nowrap"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* AI Script Polish Assistant */}
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-[#0B0D10] p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 shrink-0" />
                  <span>AI 脚本辅助润色</span>
                </span>
                <span className="text-[10px] text-zinc-500">简述变爆款分镜</span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                {POLISH_TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setToneGoal(opt.id)}
                    className={`py-1 px-1.5 rounded border text-[10px] font-medium transition-colors whitespace-nowrap ${
                      toneGoal === opt.id
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-200'
                        : 'border-zinc-800 bg-[#11141B] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={polishing || !brief.trim()}
                onClick={() => void handlePolishBrief()}
                className="w-full py-1.5 px-2.5 rounded-md border border-amber-600/60 bg-amber-950/30 hover:bg-amber-900/45 disabled:opacity-45 text-[11px] font-semibold text-amber-200 flex items-center justify-center gap-1.5 transition-colors"
              >
                {polishing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在拆解吸睛分镜文案...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{polishedResult ? '重新生成分镜润色' : '拆解并润色为分镜文案'}</span>
                  </>
                )}
              </button>

              {polishError && (
                <p className="text-[10px] text-red-300 leading-relaxed">{polishError}</p>
              )}

              {polishedResult && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-zinc-400">黄金 3 秒钩子</div>
                      <p className="text-[11px] font-semibold text-amber-200 leading-snug mt-0.5">
                        “{polishedResult.hookLine}”
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="收起润色结果"
                      onClick={() => setPolishedResult(null)}
                      className="p-0.5 text-zinc-500 hover:text-zinc-300 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    {polishedResult.viralAngle}
                  </p>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {polishedResult.shots.map((shot) => (
                      <div
                        key={shot.shotNumber}
                        className="rounded border border-zinc-800 bg-[#11141B] p-2 space-y-0.5"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-zinc-200">
                            镜 {shot.shotNumber}
                          </span>
                          <span className="font-mono-nums text-amber-300">
                            {shot.durationRange}
                          </span>
                        </div>
                        <p className="text-[10px] text-zinc-300 leading-snug">
                          画面：{shot.visualCue}
                        </p>
                        <p className="text-[10px] text-emerald-300/90 leading-snug">
                          口播：{shot.voiceoverLine}
                        </p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleApplyPolishedBrief}
                    className={`w-full py-1.5 px-2.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      appliedPolish
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-amber-600 hover:bg-amber-500 text-white'
                    }`}
                  >
                    {appliedPolish ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>已更新到上方脚本 Brief</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>一键更新至上方脚本 (Brief)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-800/70 pt-4">
            <span className="block text-xs font-semibold text-zinc-200 mb-2">
              成片语言
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'douyin', label: '中文版' },
                  { id: 'tiktok', label: '英文版' },
                ] as const
              ).map((p) => {
                const selected = targetPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onToggleTargetPlatform(p.id)}
                    className={`py-2 px-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                      selected
                        ? 'bg-rose-500/15 border-rose-500/60 text-rose-200'
                        : 'bg-[#0B0D10] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-zinc-800/70 pt-4 space-y-3">
            <div>
              <label htmlFor="style-select" className="block text-xs font-semibold text-zinc-200 mb-1.5">
                自动剪辑风格
              </label>
              <select
                id="style-select"
                value={editingStyle}
                onChange={(e) => onChangeEditingStyle(e.target.value as EditingStyle)}
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              >
                <option value="beat-sync">高燃卡点混剪 (快切 + 推拉转场)</option>
                <option value="product-showcase">爆款种草带货 (黄金3秒 + 卖点字幕)</option>
                <option value="cinematic-story">电影感叙事 (叠化 + 慢推镜头)</option>
                <option value="talking-head">干货口播节奏 (结构化分段)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="duration-select" className="block text-[11px] font-medium text-zinc-400 mb-1">
                  目标时长
                </label>
                <select
                  id="duration-select"
                  value={targetDuration}
                  onChange={(e) => onChangeTargetDuration(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-2 text-xs text-zinc-100 font-mono-nums focus:outline-none focus:border-rose-500"
                >
                  <option value={10}>10 秒 · 极速</option>
                  <option value={15}>15 秒 · 标准</option>
                  <option value={24}>24 秒 · 深度</option>
                </select>
              </div>
              <div>
                <label htmlFor="bpm-input" className="block text-[11px] font-medium text-zinc-400 mb-1">
                  节拍速度 (BPM)
                </label>
                <input
                  id="bpm-input"
                  type="number"
                  min={75}
                  max={160}
                  value={bpm}
                  onChange={(e) => onChangeBpm(Number(e.target.value) || 120)}
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-2 text-xs text-zinc-100 font-mono-nums focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          {aiError && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200 leading-relaxed">
              {aiError}
            </div>
          )}

          <label className="flex items-start gap-2 rounded-lg border border-zinc-800/80 bg-[#0B0D10] p-2.5 cursor-pointer select-none hover:border-zinc-700 transition-colors">
            <input
              type="checkbox"
              checked={autoSoundOnEdit}
              onChange={(e) => onToggleAutoSound(e.target.checked)}
              className="mt-0.5 accent-emerald-500 rounded"
            />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium text-zinc-200">
                同步配齐 AI 声音（配音 + 配乐 + 音效）
              </span>
              <span className="block text-[10px] text-zinc-500 leading-snug mt-0.5">
                剪辑完成后自动为当前这一版生成自然口播配音、匹配 BGM 与节点音效并开启人声闪避
              </span>
            </span>
          </label>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={isGenerating || !brief.trim() || targetPlatforms.length === 0}
              onClick={onRunAiAutoEdit}
              className="w-full py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在编排中英文两版...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>AI 生成中英文两版</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onRunLocalBeatSync}
              className="w-full py-2 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>一键节拍自动卡点重剪</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onUploadFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 px-3 rounded-lg border border-dashed border-zinc-700 hover:border-rose-500/70 bg-[#0B0D10] hover:bg-zinc-900/60 transition-colors flex flex-col items-center justify-center gap-1.5 text-center"
          >
            <Upload className="w-4 h-4 text-zinc-300" />
            <span className="text-xs font-medium text-zinc-200">导入本地视频或图片素材</span>
            <span className="text-[11px] text-zinc-500">支持 MP4 / MOV / WebM / JPG / PNG</span>
          </button>

          <div className="space-y-2 pt-1">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="group flex items-center gap-2.5 p-2 rounded-lg border border-zinc-800/80 bg-[#0E1015] hover:border-zinc-700 transition-colors"
              >
                <div className="w-10 h-14 rounded bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center border border-zinc-800">
                  {asset.type === 'video' ? (
                    <video
                      src={asset.url}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{asset.name}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono-nums">
                    {asset.type === 'video' ? (
                      <Film className="w-3 h-3 shrink-0" />
                    ) : (
                      <ImageIcon className="w-3 h-3 shrink-0" />
                    )}
                    <span>{asset.type === 'video' ? '视频' : '图片'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatEditSeconds(asset.duration)}s</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onInsertClipToTimeline(asset)}
                  title="添加到当前时间线"
                  className="p-2 rounded-md bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
