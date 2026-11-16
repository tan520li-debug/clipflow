import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Loader2, Music, ShieldAlert, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import type {
  AudioConfig,
  AudioCopyrightScanResult,
  BgmPreset,
  BgmSuggestion,
  CopyrightAlternativeTrack,
  PlatformId,
  SfxEvent,
  TimelineClip,
} from '../../types/studio';
import { captureClipSnapshotBase64, type LoadedMediaElement } from '../../utils/canvasRenderer';
import { apiFetch } from '../../client/api/http';
import { BGM_PRESET_BPM } from './bgmPresets';

export type BgmCopyrightHandle = {
  clearError: () => void;
  applyPackaged: (suggestion: BgmSuggestion) => void;
};

interface BgmCopyrightSectionProps {
  clips: TimelineClip[];
  platform: PlatformId;
  audio: AudioConfig;
  mediaCache: Map<string, LoadedMediaElement>;
  sfxEvents: SfxEvent[];
  onUpdateAudio: (patch: Partial<AudioConfig>) => void;
  onUploadAudio: (file: File) => void;
}

export const BgmCopyrightSection = forwardRef<BgmCopyrightHandle, BgmCopyrightSectionProps>(
  function BgmCopyrightSection(
    { clips, platform, audio, mediaCache, sfxEvents, onUpdateAudio, onUploadAudio },
    ref
  ) {
    const audioInputRef = useRef<HTMLInputElement | null>(null);
    const [analyzingBgm, setAnalyzingBgm] = useState(false);
    const [bgmError, setBgmError] = useState<string | null>(null);
    const [bgmSuggestion, setBgmSuggestion] = useState<BgmSuggestion | null>(null);
    const [bgmApplied, setBgmApplied] = useState(false);
    const [scanningCopyright, setScanningCopyright] = useState(false);
    const [copyrightError, setCopyrightError] = useState<string | null>(null);
    const [copyrightScan, setCopyrightScan] = useState<AudioCopyrightScanResult | null>(null);
    const [appliedAlternativeTitle, setAppliedAlternativeTitle] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        clearError: () => setBgmError(null),
        applyPackaged: (suggestion) => {
          setBgmSuggestion(suggestion);
          setBgmApplied(true);
        },
      }),
      []
    );

  const handleAnalyzeBgm = async () => {
    if (clips.length === 0) return;
    setAnalyzingBgm(true);
    setBgmError(null);
    setBgmApplied(false);

    try {
      const sampleIndices = Array.from(
        new Set([0, Math.floor(clips.length / 2), clips.length - 1])
      ).slice(0, 3);
      const sampleFramesBase64 = sampleIndices
        .map((idx) => {
          const c = clips[idx];
          const el = mediaCache.get(c.assetId);
          return captureClipSnapshotBase64(el, c.filter, c.colorAdjustments);
        })
        .filter((f): f is string => Boolean(f));

      const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);

      const res = await apiFetch('/api/suggest-bgm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          totalDuration,
          currentBpm: audio.bpm,
          clipsSummary: clips.map((c) => ({
            label: c.label,
            duration: c.duration,
            transition: c.transition,
            filter: c.filter,
          })),
          sampleFramesBase64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 背景乐风格推荐失败，请稍后重试。');
      }

      const validPresets: BgmPreset[] = [
        'upbeat-128',
        'tech-118',
        'fresh-112',
        'suspense-104',
        'lofi-95',
        'narrative-92',
      ];
      const preset: BgmPreset = validPresets.includes(data?.recommendedPreset)
        ? (data.recommendedPreset as BgmPreset)
        : 'upbeat-128';

      const bpmNum = Math.max(80, Math.min(145, Math.round(Number(data?.recommendedBpm) || BGM_PRESET_BPM[preset])));
      const volNum = Math.max(0.35, Math.min(0.9, Number(data?.recommendedVolume) || 0.65));

      setBgmSuggestion({
        recommendedPreset: preset,
        moodLabel: data?.moodLabel || '律动感',
        presetName: data?.presetName || '推荐节拍音效',
        recommendedBpm: bpmNum,
        recommendedVolume: Number(volNum.toFixed(2)),
        reason: data?.reason || '根据当前镜头剪辑节奏与画面光影氛围匹配最佳配乐。',
        soundDesignNote: data?.soundDesignNote || '建议配合节拍点进行转场切换。',
      });
    } catch (err: unknown) {
      setBgmError(err instanceof Error ? err.message : '分析失败，请检查网络后重试。');
    } finally {
      setAnalyzingBgm(false);
    }
  };

  const handleApplyBgmSuggestion = () => {
    if (!bgmSuggestion) return;
    onUpdateAudio({
      bgmPreset: bgmSuggestion.recommendedPreset,
      bpm: bgmSuggestion.recommendedBpm,
      volume: bgmSuggestion.recommendedVolume,
      customAudioUrl: undefined,
      customAudioName: undefined,
    });
    setBgmApplied(true);
  };

  const handleScanAudioCopyright = async () => {
    setScanningCopyright(true);
    setCopyrightError(null);
    setAppliedAlternativeTitle(null);

    try {
      const res = await apiFetch('/api/audio/copyright-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          bgmPreset: audio.bgmPreset,
          bpm: audio.bpm,
          customAudioName: audio.customAudioName || '',
          sfxCount: sfxEvents.length,
          sfxNames: sfxEvents.map((ev) => ev.name),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'AI 版权风险扫描失败，请稍后重试。');
      }
      setCopyrightScan(data as AudioCopyrightScanResult);
    } catch (err: unknown) {
      setCopyrightError(
        err instanceof Error ? err.message : 'AI 版权风险扫描失败，请检查网络后重试。'
      );
    } finally {
      setScanningCopyright(false);
    }
  };

  const handleApplyCopyrightAlternative = (alt: CopyrightAlternativeTrack) => {
    onUpdateAudio({
      bgmPreset: alt.recommendedPreset,
      bpm: alt.recommendedBpm,
      customAudioUrl: undefined,
      customAudioName: undefined,
    });
    setAppliedAlternativeTitle(alt.title);
  };

    return (
      <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-200">背景配乐与卡点节拍</span>
            </div>
            <span className="text-[11px] font-mono-nums text-zinc-400">{audio.bpm} BPM</span>
          </div>

          <div>
            <label htmlFor="bgm-preset" className="block text-[11px] text-zinc-400 mb-1">
              内置风格化节奏音轨
            </label>
            <select
              id="bgm-preset"
              value={audio.bgmPreset}
              onChange={(e) => {
                const preset = e.target.value as BgmPreset;
                const nextBpm = preset === 'none' ? audio.bpm : BGM_PRESET_BPM[preset];
                onUpdateAudio({ bgmPreset: preset, bpm: nextBpm });
              }}
              className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
            >
              <option value="upbeat-128">律动感 · 高燃电音鼓点 (128 BPM)</option>
              <option value="tech-118">科技感 · 都市律动节拍 (118 BPM)</option>
              <option value="fresh-112">清新感 · 明快轻拨弦律 (112 BPM)</option>
              <option value="suspense-104">悬疑感 · 深沉脉冲张力 (104 BPM)</option>
              <option value="lofi-95">松弛感 · Lo-Fi 暖调和弦 (95 BPM)</option>
              <option value="narrative-92">叙事感 · 电影钢琴弦乐 (92 BPM)</option>
              <option value="none">静音无背景音</option>
            </select>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={analyzingBgm || clips.length === 0}
              onClick={handleAnalyzeBgm}
              className="w-full py-2 px-3 rounded-lg border border-zinc-700/90 bg-[#0B0D10] hover:border-rose-500/70 hover:bg-zinc-900/70 disabled:opacity-50 text-xs font-medium text-zinc-100 flex items-center justify-center gap-2 transition-colors"
            >
              {analyzingBgm ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                  <span>正在分析剪辑节奏与情绪...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                  <span>AI 风格化背景乐推荐</span>
                </>
              )}
            </button>

            {bgmError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                {bgmError}
              </div>
            )}

            {bgmSuggestion && (
              <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-rose-300">
                    推荐风格：{bgmSuggestion.moodLabel}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-mono-nums">
                    {bgmSuggestion.recommendedBpm} BPM · {Math.round(bgmSuggestion.recommendedVolume * 100)}%
                  </span>
                </div>

                <p className="text-[11px] font-medium text-zinc-200">
                  {bgmSuggestion.presetName}
                </p>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {bgmSuggestion.reason}
                </p>

                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {bgmSuggestion.soundDesignNote}
                </p>

                <button
                  type="button"
                  onClick={handleApplyBgmSuggestion}
                  className={`w-full py-2 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    bgmApplied && audio.bgmPreset === bgmSuggestion.recommendedPreset
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  {bgmApplied && audio.bgmPreset === bgmSuggestion.recommendedPreset ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>已应用预设音效配置</span>
                    </>
                  ) : (
                    <>
                      <Music className="w-3.5 h-3.5" />
                      <span>一键应用预设音效</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
              <label htmlFor="audio-vol">配乐音量</label>
              <span className="font-mono-nums">{Math.round(audio.volume * 100)}%</span>
            </div>
            <input
              id="audio-vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(e) => onUpdateAudio({ volume: Number(e.target.value) })}
              className="w-full accent-rose-500"
            />
          </div>

          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadAudio(f);
              e.target.value = '';
            }}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Upload className="w-3 h-3" />
              <span>{audio.customAudioName ? '更换本地音频' : '导入本地配乐'}</span>
            </button>
            {audio.customAudioUrl && (
              <button
                type="button"
                onClick={() => onUpdateAudio({ customAudioUrl: undefined, customAudioName: undefined })}
                className="py-1.5 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300"
              >
                清除
              </button>
            )}
          </div>
          {audio.customAudioName && (
            <p className="text-[11px] text-zinc-400 truncate">已加载：{audio.customAudioName}</p>
          )}

          {/* AI Copyright Risk Scanner & Royalty-Free Alternatives */}
          <div className="border-t border-zinc-800/80 pt-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>AI 版权风险扫描</span>
              </span>
              <span className="text-[10px] text-zinc-500">检索公开版权库</span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-relaxed">
              分析当前 BGM{audio.customAudioName ? `（${audio.customAudioName}）` : ''}与 {sfxEvents.length} 处音效，自动检索公开商用曲库标注版权风险并推荐同风格免版税替代音乐。
            </p>

            <button
              type="button"
              disabled={scanningCopyright}
              onClick={() => void handleScanAudioCopyright()}
              className="w-full py-2 px-3 rounded-lg border border-amber-500/40 bg-[#0B0D10] hover:border-amber-400 hover:bg-amber-950/20 disabled:opacity-50 text-xs font-medium text-amber-200 flex items-center justify-center gap-2 transition-colors"
            >
              {scanningCopyright ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>正在检索公开版权数据库...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>{copyrightScan ? '重新扫描配乐与音效版权' : '扫描版权风险并检索替代音乐'}</span>
                </>
              )}
            </button>

            {copyrightError && (
              <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-[11px] text-red-200 leading-relaxed">
                {copyrightError}
              </div>
            )}

            {copyrightScan && (
              <div className="rounded-lg border border-zinc-800 bg-[#0B0D10] p-3 space-y-2.5">
                {/* Overall Risk Banner */}
                <div
                  className={`rounded-md border px-2.5 py-2 flex items-start gap-2 ${
                    copyrightScan.overallRisk === 'high'
                      ? 'border-red-500/45 bg-red-950/30 text-red-200'
                      : copyrightScan.overallRisk === 'medium'
                        ? 'border-amber-500/45 bg-amber-950/25 text-amber-200'
                        : 'border-emerald-500/40 bg-emerald-950/25 text-emerald-200'
                  }`}
                >
                  {copyrightScan.overallRisk === 'low' ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        copyrightScan.overallRisk === 'high' ? 'text-red-400' : 'text-amber-400'
                      }`}
                    />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                      <span>
                        {copyrightScan.overallRisk === 'high'
                          ? '高版权风险'
                          : copyrightScan.overallRisk === 'medium'
                            ? '待核验风险'
                            : '无版权风险 · 安全过审'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug">{copyrightScan.riskHeadline}</p>
                  </div>
                </div>

                {/* BGM & SFX Breakdown */}
                <div className="rounded border border-zinc-800/80 bg-[#11141B] p-2 space-y-1.5 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400 shrink-0">配乐轨道</span>
                    <span className="text-zinc-200 font-medium truncate">
                      {copyrightScan.bgmAssessment.trackName}
                    </span>
                  </div>
                  <p className="text-zinc-300 leading-relaxed">
                    {copyrightScan.bgmAssessment.analysisNote}
                  </p>
                  {copyrightScan.bgmAssessment.platformWarnings.length > 0 && (
                    <ul className="space-y-0.5 text-zinc-400 list-disc pl-3.5">
                      {copyrightScan.bgmAssessment.platformWarnings.map((warn, i) => (
                        <li key={i} className="leading-snug">
                          {warn}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="pt-1 border-t border-zinc-800/70 flex items-center justify-between gap-2">
                    <span className="text-zinc-400">音效评估 ({copyrightScan.sfxAssessment.count} 处)</span>
                    <span
                      className={
                        copyrightScan.sfxAssessment.riskLevel === 'low'
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }
                    >
                      {copyrightScan.sfxAssessment.riskLevel === 'low' ? '免版税安全' : '建议核验'}
                    </span>
                  </div>
                  <p className="text-zinc-400 leading-snug">{copyrightScan.sfxAssessment.note}</p>
                </div>

                {/* Royalty-free Same-Style Alternatives */}
                {copyrightScan.alternatives.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-zinc-200">
                      同风格无版权替代音乐推荐
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                      {copyrightScan.alternatives.map((alt) => {
                        const isApplied =
                          appliedAlternativeTitle === alt.title &&
                          !audio.customAudioName &&
                          audio.bgmPreset === alt.recommendedPreset;
                        return (
                          <div
                            key={`${alt.title}-${alt.artistOrSource}`}
                            className="rounded-md border border-zinc-800 bg-[#11141B] p-2 space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold text-zinc-100 truncate">
                                  {alt.title}
                                </div>
                                <div className="text-[10px] text-zinc-400 truncate">
                                  {alt.artistOrSource} · {alt.moodAndBpm}
                                </div>
                              </div>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-[9px] text-emerald-300 shrink-0">
                                {alt.licenseType}
                              </span>
                            </div>

                            <p className="text-[10px] text-zinc-400 leading-snug">{alt.reason}</p>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleApplyCopyrightAlternative(alt)}
                                className={`flex-1 py-1 px-2 rounded text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                                  isApplied
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white'
                                }`}
                              >
                                {isApplied ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>已切换至该无版权音轨</span>
                                  </>
                                ) : (
                                  <>
                                    <Music className="w-3 h-3" />
                                    <span>一键替换同风格无版权音乐</span>
                                  </>
                                )}
                              </button>
                              {alt.referenceUrl && (
                                <a
                                  href={alt.referenceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="查看公开曲库授权详情"
                                  className="p-1 rounded border border-zinc-700 bg-[#0B0D10] text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Grounding Database Citations */}
                {copyrightScan.groundingSources.length > 0 && (
                  <div className="pt-1.5 border-t border-zinc-800/80 space-y-1">
                    <div className="text-[10px] text-zinc-500">检索参考来源</div>
                    <div className="flex flex-wrap gap-1.5">
                      {copyrightScan.groundingSources.map((src) => (
                        <a
                          key={src.uri}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-[9px] text-zinc-400 hover:text-zinc-200 max-w-[190px] truncate transition-colors"
                        >
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
      </>
    );
  }
);
