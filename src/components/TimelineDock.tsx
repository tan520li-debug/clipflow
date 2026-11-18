import { useRef } from 'react';
import { Film, Mic, Music, Plus, Sparkles, Type, Volume2 } from 'lucide-react';
import type {
  MediaAsset,
  SfxEvent,
  SfxType,
  SubtitleSegment,
  TimelineClip,
  VoiceoverCue,
} from '../types/studio';
import { formatEditSeconds } from '../client/timeline/editSeconds';
import { formatTimecode, getTotalDuration } from '../utils/autoEditEngine';
import {
  getDigitalHumanActionTemplate,
  getDigitalHumanCameraPreset,
  getDigitalHumanEmotionPreset,
} from '../utils/digitalHumanAssets';

interface TimelineDockProps {
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  voiceoverCues?: VoiceoverCue[];
  sfxEvents?: SfxEvent[];
  assetsMap: Map<string, MediaAsset>;
  bpm: number;
  currentTime: number;
  selectedClipId: string | null;
  selectedSubtitleId: string | null;
  onSelectClip: (clipId: string) => void;
  onSelectSubtitle: (subId: string) => void;
  onPreviewSfx?: (type: SfxType, volume?: number) => void;
  onPreviewVoiceoverCue?: (cue: VoiceoverCue) => void;
  onSeek: (timeSec: number) => void;
  onAddSubtitle: () => void;
  onSnapToBeat: () => void;
}

const TRANSITION_LABELS: Record<TimelineClip['transition'], string> = {
  cut: '硬切',
  crossfade: '叠化',
  'whip-pan': '横甩',
  'zoom-punch': '冲击',
  'spin-switch': '旋转',
  flash: '闪白',
  'blur-dissolve': '模糊',
  'push-pull': '推拉',
  'page-flip': '翻页',
  'iris-wipe': '光圈',
  'curtain-split': '开屏',
  'glitch-slice': '故障',
};

export function TimelineDock({
  clips,
  subtitles,
  voiceoverCues = [],
  sfxEvents = [],
  assetsMap,
  bpm,
  currentTime,
  selectedClipId,
  selectedSubtitleId,
  onSelectClip,
  onSelectSubtitle,
  onPreviewSfx,
  onPreviewVoiceoverCue,
  onSeek,
  onAddSubtitle,
  onSnapToBeat,
}: TimelineDockProps) {
  const trackContainerRef = useRef<HTMLDivElement | null>(null);
  const totalDuration = Math.max(8, getTotalDuration(clips));
  const pxPerSecond = 78;
  const trackWidth = Math.max(760, Math.ceil(totalDuration * pxPerSecond) + 40);

  const handleRulerSeek = (clientX: number) => {
    const el = trackContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    const sec = Math.max(0, Math.min(totalDuration, x / pxPerSecond));
    onSeek(sec);
  };

  // Beat grid lines based on BPM
  const beatStepSec = (60 / Math.max(70, bpm)) * 2;
  const beatMarks: number[] = [];
  for (let t = 0; t <= totalDuration; t += beatStepSec) {
    beatMarks.push(Number(t.toFixed(2)));
  }

  let clipCursor = 0;

  return (
    <section className="h-[252px] shrink-0 border-t border-zinc-800/90 bg-[#0E1015] flex flex-col">
      {/* Timeline Toolbar */}
      <div className="h-9 px-4 border-b border-zinc-800/80 flex items-center justify-between gap-4 bg-[#11141B]">
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-200">多轨自动剪辑时间线</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-nums">
            总长 {formatTimecode(getTotalDuration(clips))}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-nums">{bpm} BPM 节拍对齐</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddSubtitle}
            className="px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3" />
            <span>插入字幕</span>
          </button>
          <button
            type="button"
            onClick={onSnapToBeat}
            className="px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-[11px] font-medium text-zinc-200 flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3 h-3 text-rose-400" />
            <span>对齐节拍点</span>
          </button>
        </div>
      </div>

      {/* Tracks Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left Track Headers */}
        <div className="w-24 shrink-0 border-r border-zinc-800/80 bg-[#101319] flex flex-col">
          <div className="h-6 border-b border-zinc-800/70 px-2.5 flex items-center text-[10px] font-mono-nums text-zinc-500">
            TIMECODE
          </div>
          <div className="h-[62px] border-b border-zinc-800/60 px-2.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
            <Film className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>视频轨</span>
          </div>
          <div className="h-[46px] border-b border-zinc-800/60 px-2.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
            <Type className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span>字幕轨</span>
          </div>
          <div className="h-[34px] border-b border-zinc-800/60 px-2.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
            <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>配音轨</span>
          </div>
          <div className="flex-1 px-2.5 flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
            <Music className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="truncate">音效 · 节拍</span>
          </div>
        </div>

        {/* Scrollable Track Area */}
        <div
          ref={trackContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative select-none"
        >
          <div
            className="relative h-full"
            style={{ width: `${trackWidth}px` }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).dataset.ruler === 'true') {
                handleRulerSeek(e.clientX);
              }
            }}
          >
            {/* Time Ruler */}
            <div
              data-ruler="true"
              className="h-6 border-b border-zinc-800/80 bg-[#0C0E13] relative cursor-pointer"
              onClick={(e) => handleRulerSeek(e.clientX)}
            >
              {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, sec) => (
                <div
                  key={sec}
                  data-ruler="true"
                  className="absolute top-0 bottom-0 border-l border-zinc-800 pl-1 text-[10px] font-mono-nums text-zinc-500 flex items-center pointer-events-none"
                  style={{ left: `${sec * pxPerSecond}px` }}
                >
                  {sec}s
                </div>
              ))}
            </div>

            {/* Video Clips Track */}
            <div
              className="h-[62px] border-b border-zinc-800/60 relative flex items-center px-0"
              onClick={(e) => {
                if (e.target === e.currentTarget) handleRulerSeek(e.clientX);
              }}
            >
              {clips.map((clip, idx) => {
                const start = clipCursor;
                clipCursor += clip.duration;
                const widthPx = Math.max(44, clip.duration * pxPerSecond - 2);
                const asset = assetsMap.get(clip.assetId);
                const isSelected = selectedClipId === clip.id && !selectedSubtitleId;

                const hasDhFull = clip.digitalHuman?.mode === 'full-scene';
                const hasDhPip = clip.digitalHuman?.mode === 'pip-overlay';
                const thumbUrl = hasDhFull
                  ? clip.digitalHuman?.avatarUrl
                  : asset && asset.type === 'image'
                    ? asset.url
                    : undefined;

                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => {
                      onSelectClip(clip.id);
                      onSeek(start + 0.05);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${start * pxPerSecond}px`,
                      width: `${widthPx}px`,
                    }}
                    className={`h-[50px] rounded-md overflow-hidden border text-left transition-colors flex items-center gap-2 px-2 ${
                      isSelected
                        ? 'border-rose-500 bg-rose-950/35 ring-1 ring-rose-500/40'
                        : hasDhFull
                          ? 'border-violet-500/60 bg-violet-950/30 hover:border-violet-400'
                          : 'border-zinc-700/80 bg-[#171B24] hover:border-zinc-500'
                    }`}
                  >
                    {thumbUrl && (
                      <div className="relative shrink-0">
                        <img
                          src={thumbUrl}
                          alt={clip.label}
                          referrerPolicy="no-referrer"
                          className="w-7 h-9 rounded-sm object-cover border border-zinc-700/60"
                        />
                        {hasDhPip && clip.digitalHuman?.avatarUrl && (
                          <img
                            src={clip.digitalHuman.avatarUrl}
                            alt={clip.digitalHuman.profileName}
                            className="w-4 h-4 rounded-full object-cover border border-violet-400 absolute -bottom-1 -right-1 shadow"
                          />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-zinc-100 truncate">
                        {idx + 1}. {clip.label}
                      </p>
                      <p className="text-[10px] font-mono-nums text-zinc-400 truncate">
                        {formatEditSeconds(clip.duration)}s · {TRANSITION_LABELS[clip.transition]}
                        {hasDhFull
                          ? ` · 数字人主播[${getDigitalHumanActionTemplate(clip.digitalHuman?.action).label}${
                              clip.digitalHuman?.emotionMatchEnabled !== false &&
                              clip.digitalHuman?.emotion &&
                              clip.digitalHuman.emotion !== 'neutral'
                                ? `/${getDigitalHumanEmotionPreset(clip.digitalHuman.emotion).label}`
                                : ''
                            }${
                              clip.digitalHuman?.cameraMotion?.enabled &&
                              clip.digitalHuman.cameraMotion.preset !== 'none'
                                ? `/${getDigitalHumanCameraPreset(clip.digitalHuman.cameraMotion.preset).label}`
                                : ''
                            }]`
                          : hasDhPip
                            ? ` · +数字人PiP[${getDigitalHumanActionTemplate(clip.digitalHuman?.action).label}${
                                clip.digitalHuman?.emotionMatchEnabled !== false &&
                                clip.digitalHuman?.emotion &&
                                clip.digitalHuman.emotion !== 'neutral'
                                  ? `/${getDigitalHumanEmotionPreset(clip.digitalHuman.emotion).label}`
                                  : ''
                              }${
                                clip.digitalHuman?.cameraMotion?.enabled &&
                                clip.digitalHuman.cameraMotion.preset !== 'none'
                                  ? `/${getDigitalHumanCameraPreset(clip.digitalHuman.cameraMotion.preset).label}`
                                  : ''
                              }]`
                            : ''}
                        {clip.transitionMotionBlur ? ' · 动态模糊' : ''}
                        {clip.motionSmoothing ? ' · 光流平滑' : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Subtitles Track */}
            <div
              className="h-[46px] border-b border-zinc-800/60 relative flex items-center"
              onClick={(e) => {
                if (e.target === e.currentTarget) handleRulerSeek(e.clientX);
              }}
            >
              {subtitles.map((sub) => {
                const widthPx = Math.max(40, sub.duration * pxPerSecond - 2);
                const isSelected = selectedSubtitleId === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      onSelectSubtitle(sub.id);
                      onSeek(sub.startTime + 0.05);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${sub.startTime * pxPerSecond}px`,
                      width: `${widthPx}px`,
                    }}
                    className={`h-8 rounded border px-2 text-left transition-colors flex items-center ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                        : 'border-zinc-700/80 bg-zinc-800/70 hover:border-zinc-500 text-zinc-200'
                    }`}
                  >
                    <span className="text-[11px] truncate">{sub.text}</span>
                  </button>
                );
              })}
            </div>

            {/* Voiceover Track */}
            <div
              className="h-[34px] border-b border-zinc-800/60 relative flex items-center"
              onClick={(e) => {
                if (e.target === e.currentTarget) handleRulerSeek(e.clientX);
              }}
            >
              {voiceoverCues.map((cue) => {
                const widthPx = Math.max(44, cue.duration * pxPerSecond - 2);
                const isMic = cue.source === 'mic-record' || cue.source === 'upload';
                return (
                  <button
                    key={cue.id}
                    type="button"
                    title={`${isMic ? '真人录音' : `AI 配音 (${cue.voiceName})`} · ${cue.text}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeek(cue.startTime);
                      onPreviewVoiceoverCue?.(cue);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${cue.startTime * pxPerSecond}px`,
                      width: `${widthPx}px`,
                    }}
                    className={`h-6 rounded border px-1.5 text-left transition-colors flex items-center gap-1 ${
                      isMic
                        ? 'border-amber-500/60 bg-amber-950/60 hover:bg-amber-900/70 text-amber-100'
                        : 'border-emerald-500/50 bg-emerald-950/65 hover:bg-emerald-900/75 text-emerald-100'
                    }`}
                  >
                    <Mic className="w-2.5 h-2.5 shrink-0" />
                    <span className="text-[10px] truncate">
                      {isMic ? '真人' : cue.voiceName} · {cue.text}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Beat Grid + Micro SFX Track */}
            <div
              className="h-[50px] relative flex items-center cursor-pointer"
              onClick={(e) => {
                if (e.target === e.currentTarget) handleRulerSeek(e.clientX);
              }}
            >
              {beatMarks.map((mark, i) => (
                <div
                  key={mark}
                  className="absolute bottom-1.5 flex flex-col items-center pointer-events-none"
                  style={{ left: `${mark * pxPerSecond}px` }}
                >
                  <div
                    className={`w-[2px] rounded-full ${
                      i % 2 === 0 ? 'h-4 bg-rose-500/45' : 'h-2.5 bg-zinc-700/80'
                    }`}
                  />
                </div>
              ))}

              {sfxEvents.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  title={`${ev.name} (${ev.time.toFixed(2)}s)${ev.reason ? ` · ${ev.reason}` : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(ev.time);
                    onPreviewSfx?.(ev.type, ev.volume);
                  }}
                  style={{ left: `${ev.time * pxPerSecond}px` }}
                  className="absolute top-1.5 h-5 max-w-[116px] px-1.5 rounded border border-cyan-500/50 bg-cyan-950/80 hover:bg-cyan-900/90 text-[10px] font-medium text-cyan-200 flex items-center gap-1 transition-colors z-10 whitespace-nowrap"
                >
                  <Volume2 className="w-2.5 h-2.5 text-cyan-300 shrink-0" />
                  <span className="truncate">{ev.name}</span>
                </button>
              ))}
            </div>

            {/* Playhead Cursor */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-rose-500 pointer-events-none z-20"
              style={{ left: `${currentTime * pxPerSecond}px` }}
            >
              <div className="w-2.5 h-2.5 -translate-x-[4px] bg-rose-500 rotate-45 rounded-[1px]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
