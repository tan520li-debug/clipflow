import { useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Plus,
  Sliders,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  AudioConfig,
  ClonedVoiceProfile,
  DigitalHumanActionId,
  DigitalHumanCameraMotion,
  DigitalHumanClipConfig,
  DigitalHumanEmotionId,
  DigitalHumanFacialMuscles,
  DigitalHumanPhonemeAlignmentProfile,
  DigitalHumanProfile,
  MediaAsset,
  MotionType,
  PlatformId,
  SfxEvent,
  SfxType,
  SubtitleSegment,
  TimelineClip,
  TransitionType,
  VoiceoverCue,
  VoiceoverVoice,
} from '../types/studio';
import { type LoadedMediaElement } from '../utils/canvasRenderer';
import {
  analyzeScriptForActionSuggestions,
  getDigitalHumanActionTemplate,
  getDigitalHumanCameraPreset,
  getDigitalHumanEmotionPreset,
} from '../utils/digitalHumanAssets';
import { DigitalHumanTab, type DigitalHumanInsertTarget } from './DigitalHumanTab';
import { VoiceCloneModal } from './VoiceCloneModal';
import { BgmCopyrightSection, type BgmCopyrightHandle } from './inspector/BgmCopyrightSection';
import { ColorSection } from './inspector/ColorSection';
import { SfxSection, type SfxSectionHandle } from './inspector/SfxSection';
import { SubtitleVoiceSection } from './inspector/SubtitleVoiceSection';
import { TransitionSection } from './inspector/TransitionSection';

interface InspectorPanelProps {
  selectedClip: TimelineClip | null;
  selectedAsset: MediaAsset | null;
  selectedClipStartTime: number;
  nextClip: TimelineClip | null;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  voiceoverCues: VoiceoverCue[];
  sfxEvents: SfxEvent[];
  currentTime: number;
  platform: PlatformId;
  mediaCache: Map<string, LoadedMediaElement>;
  selectedSubtitle: SubtitleSegment | null;
  audio: AudioConfig;
  clonedVoices: ClonedVoiceProfile[];
  onSaveClonedVoice: (profile: ClonedVoiceProfile, activateNow: boolean) => void;
  onUpdateClonedVoice: (profileId: string, patch: Partial<ClonedVoiceProfile>) => void;
  onDeleteClonedVoice: (profileId: string) => void;
  onUpdateClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  onApplyTransitionSequence: (
    updates: Array<{ clipId: string; transition: TransitionType }>
  ) => void;
  onMoveClip: (clipId: string, direction: -1 | 1) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onPreviewTransitionAtCut: (targetClipId: string) => void;
  onApplyClipSubtitles: (
    clipStartTime: number,
    clipDuration: number,
    newSubs: SubtitleSegment[]
  ) => void;
  onUpdateSubtitle: (subId: string, patch: Partial<SubtitleSegment>) => void;
  onDeleteSubtitle: (subId: string) => void;
  onAddSubtitle: () => void;
  onUpdateAudio: (patch: Partial<AudioConfig>) => void;
  onUploadAudio: (file: File) => void;
  onPreviewSfx: (type: SfxType, volume?: number) => void;
  onSetSfxEvents: (events: SfxEvent[]) => SfxEvent[] | void;
  onAddSfxEvent: (event: SfxEvent) => void;
  onRemoveSfxEvent: (eventId: string) => void;
  onSetVoiceoverCues: (cues: VoiceoverCue[], sfxEvents?: SfxEvent[]) => SfxEvent[] | undefined;
  onUpsertVoiceoverCue: (cue: VoiceoverCue) => void;
  onRemoveVoiceoverCue: (cueId: string) => void;
  onPreviewVoiceoverCue: (cue: VoiceoverCue) => void;
  onSeek: (timeSec: number) => void;
  assets: MediaAsset[];
  digitalHumans: DigitalHumanProfile[];
  onSaveDigitalHuman: (profile: DigitalHumanProfile) => void;
  onDeleteDigitalHuman: (profileId: string) => void;
  onUploadMediaAssetForAnchor: (file: File) => Promise<MediaAsset | null>;
  onEmbedDigitalHumanPip: (
    clipId: string,
    config: DigitalHumanClipConfig,
    drivenAudio?: {
      audioBase64: string;
      mimeType: string;
      durationSec: number;
      text: string;
      baseVoice: VoiceoverVoice;
      clonedVoiceId?: string;
      phonemeAlignment?: DigitalHumanPhonemeAlignmentProfile;
    }
  ) => void;
  onRemoveClipDigitalHuman: (clipId: string) => void;
  onUpdateClipDigitalHumanAction: (
    clipId: string,
    action: DigitalHumanActionId,
    actionIntensity?: number,
    options?: {
      actionBlendDuration?: number;
      blendFromAction?: DigitalHumanActionId;
    }
  ) => void;
  onBatchApplyDigitalHumanActions?: (
    updates: Array<{
      clipId: string;
      action: DigitalHumanActionId;
      actionIntensity?: number;
      actionBlendDuration?: number;
    }>
  ) => void;
  onUpdateClipDigitalHumanEmotion: (
    clipId: string,
    payload: {
      emotionMatchEnabled: boolean;
      emotion: DigitalHumanEmotionId;
      facialMuscles: DigitalHumanFacialMuscles;
      emotionSummary?: string;
    }
  ) => void;
  onUpdateClipDigitalHumanCameraMotion?: (
    clipId: string,
    cameraMotion: DigitalHumanCameraMotion
  ) => void;
  onUpdateClipDigitalHumanPhonemeAlignment?: (
    clipId: string,
    phonemeAlignment: DigitalHumanPhonemeAlignmentProfile
  ) => void;
  onInsertDigitalHumanClip: (params: {
    insertAt: DigitalHumanInsertTarget;
    config: DigitalHumanClipConfig;
    duration: number;
    transition: TransitionType;
    drivenAudio?: {
      audioBase64: string;
      mimeType: string;
      durationSec: number;
      text: string;
      baseVoice: VoiceoverVoice;
      clonedVoiceId?: string;
      phonemeAlignment?: DigitalHumanPhonemeAlignmentProfile;
    };
  }) => void;
  brief?: string;
}

export function InspectorPanel({
  selectedClip,
  selectedAsset,
  selectedClipStartTime,
  nextClip,
  clips,
  subtitles,
  voiceoverCues,
  sfxEvents,
  currentTime,
  platform,
  mediaCache,
  selectedSubtitle,
  audio,
  clonedVoices,
  onSaveClonedVoice,
  onUpdateClonedVoice,
  onDeleteClonedVoice,
  onUpdateClip,
  onApplyTransitionSequence,
  onMoveClip,
  onDuplicateClip,
  onDeleteClip,
  onPreviewTransitionAtCut,
  onApplyClipSubtitles,
  onUpdateSubtitle,
  onDeleteSubtitle,
  onAddSubtitle,
  onUpdateAudio,
  onUploadAudio,
  onPreviewSfx,
  onSetSfxEvents,
  onAddSfxEvent,
  onRemoveSfxEvent,
  onSetVoiceoverCues,
  onUpsertVoiceoverCue,
  onRemoveVoiceoverCue,
  onPreviewVoiceoverCue,
  onSeek,
  assets,
  digitalHumans,
  onSaveDigitalHuman,
  onDeleteDigitalHuman,
  onUploadMediaAssetForAnchor,
  onEmbedDigitalHumanPip,
  onRemoveClipDigitalHuman,
  onUpdateClipDigitalHumanAction,
  onBatchApplyDigitalHumanActions,
  onUpdateClipDigitalHumanEmotion,
  onUpdateClipDigitalHumanCameraMotion,
  onUpdateClipDigitalHumanPhonemeAlignment,
  onInsertDigitalHumanClip,
  brief = '',
}: InspectorPanelProps) {
  const bgmRef = useRef<BgmCopyrightHandle>(null);
  const sfxRef = useRef<SfxSectionHandle>(null);
  const [inspectorTab, setInspectorTab] = useState<'controls' | 'digital-human'>('controls');
  const [voiceCloneModalOpen, setVoiceCloneModalOpen] = useState(false);
  const hasAnyDigitalHumanOnTrack = clips.some((c) => Boolean(c.digitalHuman));
  const selectedClipActionSuggestion = selectedClip?.digitalHuman
    ? analyzeScriptForActionSuggestions({
        brief,
        scriptText: selectedClip.digitalHuman.spokenScript || '',
        clips,
        subtitles,
        selectedClipId: selectedClip.id,
      })
    : null;

  return (
    <aside className="w-[318px] shrink-0 border-l border-zinc-800/90 bg-[#11141B] flex flex-col min-h-0">
      {/* Top Tab Switcher */}
      <div className="px-2.5 pt-2.5 pb-2 border-b border-zinc-800/90 space-y-2">
        <div
          role="tablist"
          aria-label="属性面板切换"
          className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#0B0D10] border border-zinc-800/90"
        >
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === 'controls'}
            onClick={() => setInspectorTab('controls')}
            className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              inspectorTab === 'controls'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3 h-3 shrink-0" />
            <span>剪辑与音频</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inspectorTab === 'digital-human'}
            onClick={() => setInspectorTab('digital-human')}
            className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              inspectorTab === 'digital-human'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserCheck className="w-3 h-3 shrink-0" />
            <span>数字人克隆与驱动</span>
            {hasAnyDigitalHumanOnTrack && inspectorTab !== 'digital-human' && (
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
            )}
          </button>
        </div>

        {inspectorTab === 'controls' && (
          <div className="px-1.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-zinc-300">
              {selectedSubtitle ? '字幕参数调节' : selectedClip ? '片段剪辑参数' : '音频与节奏参数'}
            </h2>
            {selectedSubtitle ? (
              <button
                type="button"
                onClick={onAddSubtitle}
                className="text-[11px] font-medium text-rose-400 hover:text-rose-300 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>新增字幕</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

    <TransitionSection
      selectedClip={selectedClip}
      nextClip={nextClip}
      clips={clips}
      platform={platform}
      audio={audio}
      mediaCache={mediaCache}
      onUpdateClip={onUpdateClip}
      onApplyTransitionSequence={onApplyTransitionSequence}
      onPreviewTransitionAtCut={onPreviewTransitionAtCut}
    >
      {(picker, advisor) => (
        <ColorSection
          selectedClip={selectedClip}
          nextClip={nextClip}
          platform={platform}
          mediaCache={mediaCache}
          onUpdateClip={onUpdateClip}
        >
          {(colorNode) => (
            <div className="flex-1 overflow-y-auto p-4">
              <div hidden={inspectorTab === 'digital-human'} className="space-y-5">
                {selectedClip && !selectedSubtitle ? (
                  <div className="space-y-4">
            {selectedClip.digitalHuman && (
              <div className="rounded-lg border border-violet-500/40 bg-violet-950/25 px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-violet-200 truncate">
                      {selectedClip.digitalHuman.mode === 'full-scene'
                        ? `数字人主播镜头 · ${selectedClip.digitalHuman.profileName}`
                        : `已嵌入画中画数字人 · ${selectedClip.digitalHuman.profileName}`}
                    </div>
                    <div className="text-[10px] text-cyan-300 truncate mt-0.5">
                      姿态：{getDigitalHumanActionTemplate(selectedClip.digitalHuman.action).label}
                      {(selectedClip.digitalHuman.actionBlendDuration ?? 0.45) > 0.02
                        ? ` · 混合 ${(selectedClip.digitalHuman.actionBlendDuration ?? 0.45).toFixed(2)}s`
                        : ''}
                      {selectedClip.digitalHuman.emotionMatchEnabled !== false &&
                      selectedClip.digitalHuman.emotion
                        ? ` · 情感：${getDigitalHumanEmotionPreset(selectedClip.digitalHuman.emotion).label}`
                        : ''}
                      {selectedClip.digitalHuman.cameraMotion?.enabled &&
                      selectedClip.digitalHuman.cameraMotion.preset !== 'none'
                        ? ` · 运镜：${getDigitalHumanCameraPreset(selectedClip.digitalHuman.cameraMotion.preset).label}`
                        : ''}
                      {selectedClip.digitalHuman.phonemeAlignment?.enabled
                        ? ` · 音素对齐(${selectedClip.digitalHuman.phonemeAlignment.keyframeOffsetMs >= 0 ? `+${selectedClip.digitalHuman.phonemeAlignment.keyframeOffsetMs}` : selectedClip.digitalHuman.phonemeAlignment.keyframeOffsetMs}ms)`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectorTab('digital-human')}
                    className="text-[10px] font-medium text-violet-300 hover:text-white shrink-0"
                  >
                    调节参数 →
                  </button>
                </div>
                {selectedClipActionSuggestion &&
                  selectedClipActionSuggestion.primaryAction !==
                    (selectedClip.digitalHuman.action ?? 'explain') && (
                    <div className="flex items-center justify-between gap-2 rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-[10px]">
                      <span className="text-amber-200 truncate">
                        语境「{selectedClipActionSuggestion.contextStage}」推荐动作：
                        <strong className="text-amber-100 ml-0.5">
                          {getDigitalHumanActionTemplate(selectedClipActionSuggestion.primaryAction).label}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const act = selectedClipActionSuggestion.primaryAction;
                          const tmpl = getDigitalHumanActionTemplate(act);
                          onUpdateClipDigitalHumanAction(
                            selectedClip.id,
                            act,
                            tmpl.recommendedIntensity
                          );
                        }}
                        className="px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold shrink-0"
                      >
                        一键采纳
                      </button>
                    </div>
                  )}
              </div>
            )}
            <div>
              <label htmlFor="clip-label" className="block text-[11px] text-zinc-400 mb-1">
                片段名称
              </label>
              <input
                id="clip-label"
                type="text"
                value={selectedClip.label}
                onChange={(e) => onUpdateClip(selectedClip.id, { label: e.target.value })}
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="clip-duration" className="block text-[11px] text-zinc-400 mb-1">
                  片段时长 (秒)
                </label>
                <input
                  id="clip-duration"
                  type="number"
                  step={0.1}
                  min={0.8}
                  max={12}
                  value={selectedClip.duration}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      duration: Math.max(0.8, Math.min(12, Number(e.target.value) || 2)),
                    })
                  }
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono-nums focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label htmlFor="clip-trim" className="block text-[11px] text-zinc-400 mb-1">
                  入点偏移 (秒)
                </label>
                <input
                  id="clip-trim"
                  type="number"
                  step={0.1}
                  min={0}
                  max={selectedAsset ? Math.max(0, selectedAsset.duration - 0.5) : 30}
                  disabled={selectedAsset?.type !== 'video'}
                  value={selectedClip.trimStart}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, {
                      trimStart: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono-nums disabled:opacity-40 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clip-motion" className="block text-[11px] text-zinc-400 mb-1">
                动态运镜 (Ken Burns)
              </label>
              <select
                id="clip-motion"
                value={selectedClip.motion}
                onChange={(e) =>
                  onUpdateClip(selectedClip.id, { motion: e.target.value as MotionType })
                }
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-rose-500"
              >
                <option value="ken-burns-in">缓慢推进 (Zoom In)</option>
                <option value="ken-burns-out">缓慢拉远 (Zoom Out)</option>
                <option value="pan-left">横向左移 (Pan Left)</option>
                <option value="pan-right">横向右移 (Pan Right)</option>
                <option value="static">静止锁定 (Static)</option>
              </select>
            </div>

            <div className="rounded-lg border border-zinc-800/90 bg-[#0B0D10] p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs font-medium text-zinc-200">
                  动态平滑（光流补帧）
                </span>
                <span className="mt-0.5 block text-[11px] text-zinc-500 leading-snug">
                  {selectedAsset?.type === 'video'
                    ? '对低帧率视频开启帧间混合插值，消除抽帧顿挫感'
                    : '启用亚像素运动平滑插值，提升运镜顺滑度'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(selectedClip.motionSmoothing)}
                aria-label="动态平滑（光流补帧）"
                onClick={() =>
                  onUpdateClip(selectedClip.id, {
                    motionSmoothing: !selectedClip.motionSmoothing,
                  })
                }
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                  selectedClip.motionSmoothing
                    ? 'bg-rose-600 border-rose-500'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    selectedClip.motionSmoothing ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
                    {picker}
                    {colorNode}
            <div className="pt-1 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onMoveClip(selectedClip.id, -1)}
                className="flex-1 py-1.5 px-2 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-1"
                title="向左前移"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>前移</span>
              </button>
              <button
                type="button"
                onClick={() => onMoveClip(selectedClip.id, 1)}
                className="flex-1 py-1.5 px-2 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-1"
                title="向右后移"
              >
                <span>后移</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicateClip(selectedClip.id)}
                className="p-1.5 rounded-md bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200"
                title="复制片段"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteClip(selectedClip.id)}
                className="p-1.5 rounded-md bg-zinc-800/80 hover:bg-red-600/80 text-zinc-300 hover:text-white"
                title="删除片段"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
                    {advisor}
                  </div>
                ) : null}
                <SubtitleVoiceSection
                  selectedClip={selectedClip}
                  selectedClipStartTime={selectedClipStartTime}
                  selectedAsset={selectedAsset}
                  selectedSubtitle={selectedSubtitle}
                  clips={clips}
                  subtitles={subtitles}
                  voiceoverCues={voiceoverCues}
                  currentTime={currentTime}
                  platform={platform}
                  mediaCache={mediaCache}
                  audio={audio}
                  clonedVoices={clonedVoices}
                  onApplyClipSubtitles={onApplyClipSubtitles}
                  onUpdateSubtitle={onUpdateSubtitle}
                  onDeleteSubtitle={onDeleteSubtitle}
                  onUpdateAudio={onUpdateAudio}
                  onUpdateClonedVoice={onUpdateClonedVoice}
                  onDeleteClonedVoice={onDeleteClonedVoice}
                  onSetVoiceoverCues={onSetVoiceoverCues}
                  onUpsertVoiceoverCue={onUpsertVoiceoverCue}
                  onRemoveVoiceoverCue={onRemoveVoiceoverCue}
                  onPreviewVoiceoverCue={onPreviewVoiceoverCue}
                  onSeek={onSeek}
                  onSetSfxEvents={onSetSfxEvents}
                  onOpenVoiceClone={() => setVoiceCloneModalOpen(true)}
                  bgmRef={bgmRef}
                  sfxRef={sfxRef}
                >
                  <BgmCopyrightSection
                    ref={bgmRef}
                    clips={clips}
                    platform={platform}
                    audio={audio}
                    mediaCache={mediaCache}
                    sfxEvents={sfxEvents}
                    onUpdateAudio={onUpdateAudio}
                    onUploadAudio={onUploadAudio}
                  />
                  <SfxSection
                    ref={sfxRef}
                    clips={clips}
                    subtitles={subtitles}
                    sfxEvents={sfxEvents}
                    platform={platform}
                    audio={audio}
                    mediaCache={mediaCache}
                    currentTime={currentTime}
                    onPreviewSfx={onPreviewSfx}
                    onSetSfxEvents={onSetSfxEvents}
                    onAddSfxEvent={onAddSfxEvent}
                    onRemoveSfxEvent={onRemoveSfxEvent}
                    onSeek={onSeek}
                  />
                </SubtitleVoiceSection>
              </div>
              {inspectorTab === 'digital-human' ? (
                <DigitalHumanTab
            selectedClip={selectedClip}
            selectedClipStartTime={selectedClipStartTime}
            clips={clips}
            subtitles={subtitles}
            assets={assets}
            clonedVoices={clonedVoices}
            digitalHumans={digitalHumans}
            platform={platform}
            activeVoiceoverVoice={audio.voiceoverVoice ?? 'Kore'}
            onSaveDigitalHuman={onSaveDigitalHuman}
            onDeleteDigitalHuman={onDeleteDigitalHuman}
            onUploadMediaAssetForAnchor={onUploadMediaAssetForAnchor}
            onEmbedDigitalHumanPip={onEmbedDigitalHumanPip}
            onRemoveClipDigitalHuman={onRemoveClipDigitalHuman}
            onUpdateClipDigitalHumanAction={onUpdateClipDigitalHumanAction}
            onBatchApplyDigitalHumanActions={onBatchApplyDigitalHumanActions}
            onUpdateClipDigitalHumanEmotion={onUpdateClipDigitalHumanEmotion}
            onUpdateClipDigitalHumanCameraMotion={onUpdateClipDigitalHumanCameraMotion}
            onUpdateClipDigitalHumanPhonemeAlignment={onUpdateClipDigitalHumanPhonemeAlignment}
            onInsertDigitalHumanClip={onInsertDigitalHumanClip}
            brief={brief}
                />
              ) : null}
            </div>
          )}
        </ColorSection>
      )}
    </TransitionSection>
      {voiceCloneModalOpen && (
        <VoiceCloneModal
          onClose={() => setVoiceCloneModalOpen(false)}
          onSaveProfile={onSaveClonedVoice}
        />
      )}
    </aside>
  );
}
