export type PlatformId = 'douyin' | 'tiktok' | 'facebook';

export type AspectRatio = '9:16' | '4:5';

export type TransitionType =
  | 'cut'
  | 'crossfade'
  | 'whip-pan'
  | 'zoom-punch'
  | 'spin-switch'
  | 'flash'
  | 'blur-dissolve'
  | 'push-pull'
  | 'page-flip'
  | 'iris-wipe'
  | 'curtain-split'
  | 'glitch-slice';

export interface TransitionSuggestion {
  recommendedTransition: TransitionType;
  transitionName: string;
  reason: string;
  visualBridgeNote: string;
}

export interface TransitionSequenceStep {
  clipId: string;
  clipIndex: number;
  clipLabel: string;
  positionRole: string;
  recommendedTransition: TransitionType;
  transitionName: string;
  retentionReason: string;
}

export interface TransitionSequenceSuggestion {
  timelineVisualOverview: string;
  retentionStrategy: string;
  currentPositionSummary: string;
  currentRecommendedTransition: TransitionType;
  steps: TransitionSequenceStep[];
}

export type MotionType = 'ken-burns-in' | 'ken-burns-out' | 'pan-left' | 'pan-right' | 'static';

export type ColorFilter = 'natural' | 'cinematic' | 'vibrant' | 'warm-film' | 'cool-clean';

export type SubtitleStyle = 'douyin-yellow' | 'tiktok-pill' | 'facebook-cinema' | 'minimal-clean';

export type EditingStyle = 'beat-sync' | 'talking-head' | 'cinematic-story' | 'product-showcase';

export type BgmPreset =
  | 'upbeat-128'
  | 'tech-118'
  | 'fresh-112'
  | 'suspense-104'
  | 'lofi-95'
  | 'narrative-92'
  | 'none';

export interface BgmSuggestion {
  recommendedPreset: BgmPreset;
  moodLabel: string;
  presetName: string;
  recommendedBpm: number;
  recommendedVolume: number;
  reason: string;
  soundDesignNote: string;
}

export interface CopyrightAlternativeTrack {
  title: string;
  artistOrSource: string;
  licenseType: string;
  moodAndBpm: string;
  recommendedPreset: BgmPreset;
  recommendedBpm: number;
  reason: string;
  referenceUrl?: string;
}

export interface CopyrightGroundingSource {
  title: string;
  uri: string;
}

export interface AudioCopyrightScanResult {
  overallRisk: 'low' | 'medium' | 'high';
  riskHeadline: string;
  bgmAssessment: {
    trackName: string;
    sourceKind: 'builtin-synth' | 'custom-upload' | 'muted';
    riskLevel: 'low' | 'medium' | 'high';
    platformWarnings: string[];
    analysisNote: string;
  };
  sfxAssessment: {
    count: number;
    riskLevel: 'low' | 'medium' | 'high';
    note: string;
  };
  alternatives: CopyrightAlternativeTrack[];
  groundingSources: CopyrightGroundingSource[];
  scannedAt: string;
}

export type WorkspaceView = 'editor' | 'matrix' | 'media';

export interface MediaAiTags {
  subjects: string[];
  visuals: string[];
  sceneSummary?: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string;
  duration: number; // natural duration in seconds (for images, default 5s)
  width: number;
  height: number;
  source: 'builtin' | 'upload';
  fileSizeLabel?: string;
  aiTags?: MediaAiTags;
}

export interface ColorAdjustments {
  contrast: number;
  saturation: number;
  brightness: number;
  colorTempLabel?: string;
  analysisNote?: string;
}

export type DigitalHumanPipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export type DigitalHumanFrameShape = 'circle' | 'rounded-card' | 'portrait-badge';

export type DigitalHumanClipMode = 'pip-overlay' | 'full-scene';

export type DigitalHumanActionId =
  | 'explain'
  | 'point'
  | 'wave'
  | 'amaze'
  | 'nod'
  | 'thumbs-up';

export type DigitalHumanEmotionId =
  | 'neutral'
  | 'excited'
  | 'serious'
  | 'suspense'
  | 'warm';

export type DigitalHumanCameraPresetId =
  | 'none'
  | 'push-in'
  | 'pull-out'
  | 'pan-sweep'
  | 'handheld-shake'
  | 'dolly-zoom';

export interface DigitalHumanCameraMotion {
  enabled: boolean;
  preset: DigitalHumanCameraPresetId;
  dollyAmount: number; // -0.25 to 0.35
  panSpeed: number; // -1.0 to 1.0
  shakeIntensity: number; // 0.0 to 1.0
  shakeFrequency: number; // 0.5 to 3.0
}

export interface DigitalHumanFacialMuscles {
  jawOpenness: number; // 0.5 to 1.6
  browLift: number; // -1.0 to 1.0
  eyeSquint: number; // 0.0 to 1.0
  smileCurve: number; // -0.6 to 1.0
  headTension: number; // 0.4 to 1.5
  lipSyncSharpness: number; // 0.6 to 1.6
}

export interface DigitalHumanEmotionAnalysis {
  emotion: DigitalHumanEmotionId;
  emotionLabel: string;
  confidence: number;
  toneSummary: string;
  prosodyMetrics?: {
    energyRms: number;
    pitchVariance: number;
    tempoBurstRate: number;
    pauseRatio: number;
  };
  muscles: DigitalHumanFacialMuscles;
  analyzedAt: string;
}

export interface DigitalHumanClipActionSuggestion {
  clipId: string;
  clipLabel: string;
  contextStage: string;
  recommendedAction: DigitalHumanActionId;
  recommendedIntensity: number;
  reason: string;
}

export interface DigitalHumanActionRecommendation {
  primaryAction: DigitalHumanActionId;
  secondaryAction?: DigitalHumanActionId;
  contextStage: string;
  confidence: number;
  reason: string;
  clipSuggestions: DigitalHumanClipActionSuggestion[];
  source: 'ai' | 'heuristic';
  analyzedAt: string;
}

export interface DigitalHumanProfile {
  id: string;
  name: string;
  createdAt: string;
  avatarAssetId?: string;
  avatarUrl: string;
  avatarMediaType: 'image' | 'video';
  personaSummary: string;
  anchorStyleTags: string[];
  baseVoice: VoiceoverVoice;
  voiceDesignPrompt: string;
  clonedVoiceId?: string;
  sampleAudioBase64?: string;
  sampleAudioMimeType?: string;
  sampleAudioDurationSec?: number;
  accentColor?: string;
  defaultAction?: DigitalHumanActionId;
  defaultActionBlendDuration?: number; // seconds (0 to 1.5)
  defaultEmotion?: DigitalHumanEmotionId;
  defaultFacialMuscles?: DigitalHumanFacialMuscles;
  defaultCameraMotion?: DigitalHumanCameraMotion;
}

export interface DigitalHumanClipConfig {
  profileId: string;
  profileName: string;
  avatarAssetId?: string;
  avatarUrl: string;
  avatarMediaType: 'image' | 'video';
  mode: DigitalHumanClipMode;
  pipPosition: DigitalHumanPipPosition;
  pipScale: number; // 0.22 to 0.44
  frameShape: DigitalHumanFrameShape;
  speechIntensity: number; // 0.4 to 1.5
  showLiveWaveRing: boolean;
  action?: DigitalHumanActionId;
  actionIntensity?: number; // 0.5 to 1.5
  actionBlendDuration?: number; // seconds (0 to 1.5), auto-interpolates from consecutive previous action
  blendFromAction?: DigitalHumanActionId;
  emotionMatchEnabled?: boolean;
  emotion?: DigitalHumanEmotionId;
  facialMuscles?: DigitalHumanFacialMuscles;
  emotionSummary?: string;
  cameraMotion?: DigitalHumanCameraMotion;
  spokenScript?: string;
  linkedCueId?: string;
  accentColor?: string;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  label: string;
  trimStart: number; // start offset inside source video (seconds)
  duration: number; // playback duration on timeline (seconds)
  transition: TransitionType;
  motion: MotionType;
  filter: ColorFilter;
  speed: number;
  hookTag?: string;
  motionSmoothing?: boolean;
  transitionMotionBlur?: boolean;
  transitionBlurIntensity?: number;
  colorAdjustments?: ColorAdjustments;
  digitalHuman?: DigitalHumanClipConfig;
}

export interface SubtitleSegment {
  id: string;
  startTime: number;
  duration: number;
  text: string;
  style: SubtitleStyle;
  position: 'bottom' | 'center' | 'upper';
}

export interface PlatformCopy {
  platform: PlatformId;
  title: string;
  caption: string;
  hashtags: string[];
  hookOpening: string;
  ctaText: string;
}

export type VoiceoverVoice = 'Kore' | 'Zephyr' | 'Puck' | 'Charon' | 'Fenrir';

export interface ClonedVoiceProfile {
  id: string;
  name: string;
  createdAt: string;
  sampleDurationSec: number;
  baseVoice: VoiceoverVoice;
  voiceDesignPrompt: string;
  timbreSummary: string;
  speakingPace: string;
  vocalTags: string[];
  playbackRate: number;
  eqLowGainDb: number;
  eqMidGainDb?: number;
  eqHighGainDb: number;
  expressiveness?: number; // 0.2 to 1.0
  samplePreviewBase64?: string;
  samplePreviewMimeType?: string;
}

export interface VoiceoverCue {
  id: string;
  subtitleId?: string;
  startTime: number;
  duration: number;
  text: string;
  audioBase64: string;
  mimeType: string;
  voiceName: VoiceoverVoice;
  source?: 'ai-tts' | 'mic-record' | 'upload';
  clonedVoiceId?: string;
  clonedVoiceName?: string;
  playbackRate?: number;
  eqLowGainDb?: number;
  eqMidGainDb?: number;
  eqHighGainDb?: number;
  audioDurationSec?: number;
}

export interface VoiceDenoiseProfile {
  ambientNoiseLevelDb: number;
  snrDb: number;
  clarityScoreBefore: number;
  clarityScoreAfter: number;
  detectedNoiseTypes: string[];
  highpassHz: number;
  lowpassHz: number;
  noiseGateDb: number;
  presenceBoostDb: number;
  recommendedStrength: number;
  summary: string;
  analyzedAt?: string;
}

export interface AudioConfig {
  bgmPreset: BgmPreset;
  bpm: number;
  volume: number; // 0 to 1
  customAudioUrl?: string;
  customAudioName?: string;
  voiceoverEnabled: boolean;
  voiceoverVoice?: VoiceoverVoice;
  voiceoverVolume?: number; // 0 to 1
  bgmAutoDucking?: boolean;
  naturalMode?: 'expressive' | 'standard';
  voicePersonaPrompt?: string;
  activeClonedVoiceId?: string;
  voiceDenoiseEnabled?: boolean;
  voiceDenoiseStrength?: number; // 0.1 to 1.0
  voiceDenoiseProfile?: VoiceDenoiseProfile;
}

export type SfxType =
  | 'whoosh'
  | 'ding'
  | 'click'
  | 'pop'
  | 'swoosh-impact'
  | 'shimmer';

export type SfxTriggerCategory = 'transition' | 'action' | 'subtitle' | 'hook';

export interface SfxEvent {
  id: string;
  type: SfxType;
  name: string;
  time: number;
  duration: number;
  volume: number;
  category: SfxTriggerCategory;
  reason?: string;
  linkedClipId?: string;
}

export interface SfxLibrarySuggestion {
  librarySummary: string;
  events: SfxEvent[];
}

export interface PlatformProjectState {
  platform: PlatformId;
  aspectRatio: AspectRatio;
  clips: TimelineClip[];
  subtitles: SubtitleSegment[];
  copy: PlatformCopy;
  audio: AudioConfig;
  sfxEvents?: SfxEvent[];
  voiceoverCues?: VoiceoverCue[];
}

export interface AutoEditApiRequest {
  brief: string;
  style: EditingStyle;
  targetPlatforms: PlatformId[];
  bpm: number;
  durationTarget: number;
  mediaSummary: Array<{
    index: number;
    name: string;
    type: 'image' | 'video';
    duration: number;
  }>;
}

export interface AutoEditApiPlatformPlan {
  platform: PlatformId;
  title: string;
  caption: string;
  hashtags: string[];
  hookOpening: string;
  ctaText: string;
  clips: Array<{
    assetIndex: number;
    label: string;
    trimStart: number;
    duration: number;
    transition: TransitionType;
    motion: MotionType;
    filter: ColorFilter;
    hookTag?: string;
  }>;
  subtitles: Array<{
    startTime: number;
    duration: number;
    text: string;
    position: 'bottom' | 'center' | 'upper';
  }>;
}

export interface AutoEditApiResponse {
  projectTitle: string;
  recommendedBpm: number;
  platforms: AutoEditApiPlatformPlan[];
}
