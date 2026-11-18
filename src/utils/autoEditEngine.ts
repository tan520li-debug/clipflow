import type {
  AutoEditApiPlatformPlan,
  AutoEditApiResponse,
  BgmPreset,
  ColorFilter,
  ContentLanguage,
  MediaAsset,
  MotionType,
  PlatformGroup,
  PlatformId,
  PlatformProjectState,
  SubtitleSegment,
  SubtitleStyle,
  TimelineClip,
  TransitionType,
  UiLanguage,
  VoiceoverCue,
  VoicePresetOption,
} from '../types/studio';
import { boundsForClips, placeSuggestedSfxEvents } from '../domain/timeline/placeSfx';

export const ALL_PLATFORM_IDS: PlatformId[] = [
  'douyin',
  'xiaohongshu',
  'tiktok',
  'instagram',
  'facebook',
];

export const PLATFORM_GROUPS: Array<{
  id: PlatformGroup;
  platforms: PlatformId[];
}> = [
  { id: 'domestic', platforms: ['douyin', 'xiaohongshu'] },
  { id: 'global', platforms: ['tiktok', 'instagram', 'facebook'] },
];

export const VOICE_PRESET_CATALOG: VoicePresetOption[] = [
  // Chinese (Mandarin) Voices
  {
    id: 'zh-kore',
    language: 'zh-CN',
    baseVoice: 'Kore',
    labelZh: '星澜 · 温润知性女声',
    labelEn: 'Xinglan · Warm Female Studio',
    styleTagZh: '好物科普 / 温柔穿透',
    styleTagEn: 'Mandarin · Warm & Clear',
    personaHint: 'Speak in natural, warm, articulate Mandarin Chinese with conversational studio clarity.',
  },
  {
    id: 'zh-zephyr',
    language: 'zh-CN',
    baseVoice: 'Zephyr',
    labelZh: '清风 · 轻快种草青年',
    labelEn: 'Qingfeng · Bright Youth',
    styleTagZh: '小红书 / 日常分享',
    styleTagEn: 'Mandarin · Crisp & Light',
    personaHint: 'Speak in upbeat, light, approachable Mandarin Chinese suited for lifestyle and product notes.',
  },
  {
    id: 'zh-puck',
    language: 'zh-CN',
    baseVoice: 'Puck',
    labelZh: '元气阿橘 · 高燃钩子音',
    labelEn: 'Aju · Energetic Hook',
    styleTagZh: '抖音爆款 / 前3秒抓耳',
    styleTagEn: 'Mandarin · Punchy Hook',
    personaHint: 'Speak in lively, expressive Mandarin Chinese with energetic 3-second short-video hook cadence.',
  },
  {
    id: 'zh-charon',
    language: 'zh-CN',
    baseVoice: 'Charon',
    labelZh: '阿澈 · 沉稳科技男声',
    labelEn: 'Ache · Calm Tech Host',
    styleTagZh: '数码评测 / 深度拆解',
    styleTagEn: 'Mandarin · Steady Baritone',
    personaHint: 'Speak in calm, authoritative, well-paced Mandarin Chinese suited for tech reviews and insights.',
  },
  {
    id: 'zh-fenrir',
    language: 'zh-CN',
    baseVoice: 'Fenrir',
    labelZh: '墨沉 · 电影磁性旁白',
    labelEn: 'Mochen · Cinema Narrator',
    styleTagZh: '故事叙事 / 高级质感',
    styleTagEn: 'Mandarin · Deep Cinema',
    personaHint: 'Speak in deep, resonant, cinematic Mandarin Chinese with deliberate storytelling pauses.',
  },
  // English Voices
  {
    id: 'en-kore',
    language: 'en',
    baseVoice: 'Kore',
    labelZh: 'Claire · 美式亲和女声',
    labelEn: 'Claire · Warm Studio Host',
    styleTagZh: 'Reels 分享 / 自然清楚',
    styleTagEn: 'English · Warm & Conversational',
    personaHint: 'Speak in fluent, warm American English with crisp modern creator pacing.',
  },
  {
    id: 'en-zephyr',
    language: 'en',
    baseVoice: 'Zephyr',
    labelZh: 'Skyler · 明快生活方式音',
    labelEn: 'Skyler · Bright Creator',
    styleTagZh: 'TikTok Vlog / 清爽节奏',
    styleTagEn: 'English · Upbeat & Airy',
    personaHint: 'Speak in bright, natural English with effortless lifestyle vlog rhythm.',
  },
  {
    id: 'en-puck',
    language: 'en',
    baseVoice: 'Puck',
    labelZh: 'Leo · 高能爆款开场音',
    labelEn: 'Leo · Snappy Hook Narrator',
    styleTagZh: 'TikTok 快切 / 强吸睛',
    styleTagEn: 'English · Punchy & Energetic',
    personaHint: 'Speak in dynamic, high-retention American English designed for snappy TikTok hooks.',
  },
  {
    id: 'en-charon',
    language: 'en',
    baseVoice: 'Charon',
    labelZh: 'Marcus · 理性科技解说音',
    labelEn: 'Marcus · Tech Documentary',
    styleTagZh: '评测对比 / 沉稳可信',
    styleTagEn: 'English · Measured & Credible',
    personaHint: 'Speak in composed, articulate English with trustworthy product-review authority.',
  },
  {
    id: 'en-fenrir',
    language: 'en',
    baseVoice: 'Fenrir',
    labelZh: 'Julian · 电影深沉低音',
    labelEn: 'Julian · Deep Cinema Baritone',
    styleTagZh: '剧情旁白 / 电影感',
    styleTagEn: 'English · Cinematic Baritone',
    personaHint: 'Speak in rich, cinematic English baritone with dramatic emphasis and studio poise.',
  },
];

export function getVoicePresetById(id?: string): VoicePresetOption | undefined {
  if (!id) return undefined;
  return VOICE_PRESET_CATALOG.find((v) => v.id === id);
}

export function resolveVoicePresetForSelection(
  voice: VoicePresetOption['baseVoice'] | undefined,
  contentLang: ContentLanguage,
  presetId?: string
): VoicePresetOption {
  const exact = getVoicePresetById(presetId);
  if (exact) return exact;
  const matched = VOICE_PRESET_CATALOG.find(
    (v) => v.language === contentLang && v.baseVoice === (voice ?? 'Kore')
  );
  return matched ?? VOICE_PRESET_CATALOG[0];
}

export const BUILTIN_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'asset-beans',
    name: '晨光现磨咖啡豆.jpg',
    type: 'image',
    url: '/src/assets/images/clip_coffee_beans_1794793909771.jpg',
    duration: 5,
    width: 1080,
    height: 1920,
    source: 'builtin',
    aiTags: {
      subjects: ['美食', '产品'],
      visuals: ['暖色', '低调'],
      sceneSummary: '烘焙咖啡豆落入磨豆机特写',
    },
  },
  {
    id: 'asset-pourover',
    name: '手冲V60蒸汽特写.jpg',
    type: 'image',
    url: '/src/assets/images/clip_pourover_steam_1794793908801.jpg',
    duration: 5,
    width: 1080,
    height: 1920,
    source: 'builtin',
    aiTags: {
      subjects: ['美食', '人物'],
      visuals: ['暖色', '低调'],
      sceneSummary: '手冲壶注水与蒸汽升腾',
    },
  },
  {
    id: 'asset-swirl',
    name: '浓缩燕麦拿铁融合.jpg',
    type: 'image',
    url: '/src/assets/images/clip_espresso_swirl_1794793910971.jpg',
    duration: 5,
    width: 1080,
    height: 1920,
    source: 'builtin',
    aiTags: {
      subjects: ['美食', '产品'],
      visuals: ['暖色', '高调'],
      sceneSummary: '浓缩咖啡注入冰燕麦奶',
    },
  },
  {
    id: 'asset-desk',
    name: '窗边极简创作桌面.jpg',
    type: 'image',
    url: '/src/assets/images/clip_creator_desk_1794793911719.jpg',
    duration: 5,
    width: 1080,
    height: 1920,
    source: 'builtin',
    aiTags: {
      subjects: ['风景', '产品'],
      visuals: ['高调', '冷色'],
      sceneSummary: '明亮窗景与极简工作桌面',
    },
  },
];

export const PLATFORM_META: Record<
  PlatformId,
  {
    id: PlatformId;
    group: PlatformGroup;
    label: string;
    labelEn: string;
    shortLabel: string;
    shortLabelEn: string;
    defaultSubtitleStyle: SubtitleStyle;
    defaultBgm: BgmPreset;
    defaultBpm: number;
    specSummary: string;
    specSummaryEn: string;
    estimatedCampaignValueUsd: number;
  }
> = {
  douyin: {
    id: 'douyin',
    group: 'domestic',
    label: '抖音 Douyin',
    labelEn: 'Douyin (抖音)',
    shortLabel: '抖音',
    shortLabelEn: 'Douyin',
    defaultSubtitleStyle: 'douyin-yellow',
    defaultBgm: 'upbeat-128',
    defaultBpm: 128,
    specSummary: '9:16 竖屏 · 黄金前3秒强钩子 · 中文黄字黑边动效字幕',
    specSummaryEn: '9:16 Vertical · 3s Golden Hook · Classic Yellow-Outline Captions',
    estimatedCampaignValueUsd: 185,
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    group: 'domestic',
    label: '小红书',
    labelEn: 'Xiaohongshu (RED)',
    shortLabel: '小红书',
    shortLabelEn: 'RED / XHS',
    defaultSubtitleStyle: 'xiaohongshu-card',
    defaultBgm: 'fresh-112',
    defaultBpm: 112,
    specSummary: '9:16 竖屏 · 质感种草氛围感 · 奶油卡片高亮字幕',
    specSummaryEn: '9:16 Vertical · Aesthetic Lifestyle Notes · Cream Card Captions',
    estimatedCampaignValueUsd: 160,
  },
  tiktok: {
    id: 'tiktok',
    group: 'global',
    label: 'TikTok',
    labelEn: 'TikTok',
    shortLabel: 'TikTok',
    shortLabelEn: 'TikTok',
    defaultSubtitleStyle: 'tiktok-pill',
    defaultBgm: 'tech-118',
    defaultBpm: 118,
    specSummary: '9:16 竖屏 · 快节奏卡点 · 原生白底胶囊字幕',
    specSummaryEn: '9:16 Vertical · Fast Beat Cuts · Native White Pill Captions',
    estimatedCampaignValueUsd: 240,
  },
  instagram: {
    id: 'instagram',
    group: 'global',
    label: 'Instagram Reels',
    labelEn: 'Instagram Reels',
    shortLabel: 'Instagram',
    shortLabelEn: 'Instagram',
    defaultSubtitleStyle: 'instagram-bold',
    defaultBgm: 'fresh-112',
    defaultBpm: 114,
    specSummary: '9:16 竖屏 · 审美构图与节奏留存 · IG 粗体杂志字幕',
    specSummaryEn: '9:16 Vertical · Aesthetic Story Flow · Bold Editorial Captions',
    estimatedCampaignValueUsd: 265,
  },
  facebook: {
    id: 'facebook',
    group: 'global',
    label: 'Facebook Reels',
    labelEn: 'Facebook Reels',
    shortLabel: 'Facebook',
    shortLabelEn: 'Facebook',
    defaultSubtitleStyle: 'facebook-cinema',
    defaultBgm: 'lofi-95',
    defaultBpm: 95,
    specSummary: '4:5 信息流 · 叙事完播曲线 · 影院级半透明底字幕',
    specSummaryEn: '4:5 Feed · Story Retention Arc · Editorial Lower Captions',
    estimatedCampaignValueUsd: 195,
  },
};

export function getPlatformLabel(pid: PlatformId, uiLang: UiLanguage, short = false): string {
  const meta = PLATFORM_META[pid];
  if (!meta) return pid;
  if (uiLang === 'zh-CN') return short ? meta.shortLabel : meta.label;
  return short ? meta.shortLabelEn : meta.labelEn;
}

/** One Chinese cut and one English cut. The same file can be posted to any platform. */
export const EDITION_IDS: readonly PlatformId[] = ['douyin', 'tiktok'];

export function editionLabel(id: PlatformId): string {
  if (id === 'douyin') return '中文版';
  if (id === 'tiktok') return '英文版';
  return getPlatformLabel(id, 'zh-CN', true);
}

export function createInitialPlatformProjects(): Record<PlatformId, PlatformProjectState> {
  return {
    douyin: {
      platform: 'douyin',
      aspectRatio: '9:16',
      clips: [
        {
          id: 'dy-c1',
          assetId: 'asset-beans',
          label: '开场黄金钩子 · 落豆特写',
          trimStart: 0,
          duration: 2.2,
          transition: 'cut',
          motion: 'ken-burns-in',
          filter: 'warm-film',
          speed: 1,
          hookTag: '前3秒吸睛',
        },
        {
          id: 'dy-c2',
          assetId: 'asset-pourover',
          label: '中段节奏 · 手冲注水升腾',
          trimStart: 0,
          duration: 2.6,
          transition: 'zoom-punch',
          motion: 'pan-left',
          filter: 'cinematic',
          speed: 1,
        },
        {
          id: 'dy-c3',
          assetId: 'asset-swirl',
          label: '高潮卡点 · 浓缩奶咖融合',
          trimStart: 0,
          duration: 2.6,
          transition: 'whip-pan',
          motion: 'ken-burns-out',
          filter: 'vibrant',
          speed: 1,
        },
        {
          id: 'dy-c4',
          assetId: 'asset-desk',
          label: '结尾引导 · 晨间工作桌面',
          trimStart: 0,
          duration: 2.6,
          transition: 'crossfade',
          motion: 'ken-burns-in',
          filter: 'warm-film',
          speed: 1,
        },
      ],
      subtitles: [
        {
          id: 'dy-s1',
          startTime: 0.1,
          duration: 2.0,
          text: '早上3分钟，复刻咖啡店高级感',
          style: 'douyin-yellow',
          position: 'bottom',
        },
        {
          id: 'dy-s2',
          startTime: 2.2,
          duration: 2.5,
          text: '92度水温细水流画圈焖蒸',
          style: 'douyin-yellow',
          position: 'bottom',
        },
        {
          id: 'dy-s3',
          startTime: 4.8,
          duration: 2.5,
          text: '浓缩液缓缓沉入冰燕麦奶',
          style: 'douyin-yellow',
          position: 'bottom',
        },
        {
          id: 'dy-s4',
          startTime: 7.4,
          duration: 2.4,
          text: '点个收藏，明早跟着试一杯',
          style: 'douyin-yellow',
          position: 'bottom',
        },
      ],
      copy: {
        platform: 'douyin',
        title: '早八人3分钟居家手冲，丝滑拿铁一口唤醒状态',
        caption: '不用排队买35块的咖啡，在家用15克豆子就能做出绵密油脂与干净风味。评论区扣“参数”领冲煮比例表。',
        hashtags: ['手冲咖啡', '居家咖啡馆', '早八人日常', '生活仪式感', '好物分享'],
        hookOpening: '早上3分钟，复刻咖啡店高级感',
        ctaText: '点赞收藏，明早跟着做',
      },
      audio: {
        bgmPreset: 'upbeat-128',
        bpm: 128,
        volume: 0.65,
        voiceoverEnabled: false,
        voiceoverVoice: 'Kore',
        voiceoverPresetId: 'zh-kore',
        voiceoverVolume: 0.95,
        bgmAutoDucking: true,
        naturalMode: 'expressive',
      },
      sfxEvents: [],
      voiceoverCues: [],
    },
    xiaohongshu: {
      platform: 'xiaohongshu',
      aspectRatio: '9:16',
      clips: [
        {
          id: 'xhs-c1',
          assetId: 'asset-desk',
          label: '氛围开场 · 晨光窗边桌面',
          trimStart: 0,
          duration: 2.4,
          transition: 'cut',
          motion: 'ken-burns-in',
          filter: 'warm-film',
          speed: 1,
          hookTag: '封面质感定调',
        },
        {
          id: 'xhs-c2',
          assetId: 'asset-beans',
          label: '细节特写 · 现磨烘豆质感',
          trimStart: 0,
          duration: 2.4,
          transition: 'crossfade',
          motion: 'pan-right',
          filter: 'natural',
          speed: 1,
        },
        {
          id: 'xhs-c3',
          assetId: 'asset-pourover',
          label: '治愈瞬间 · 92°C 蒸汽注水',
          trimStart: 0,
          duration: 2.6,
          transition: 'blur-dissolve',
          motion: 'ken-burns-out',
          filter: 'warm-film',
          speed: 1,
        },
        {
          id: 'xhs-c4',
          assetId: 'asset-swirl',
          label: '高光特写 · 燕麦拿铁云朵融合',
          trimStart: 0,
          duration: 2.6,
          transition: 'crossfade',
          motion: 'ken-burns-in',
          filter: 'vibrant',
          speed: 1,
        },
      ],
      subtitles: [
        {
          id: 'xhs-s1',
          startTime: 0.1,
          duration: 2.2,
          text: '把咖啡馆搬进清晨 7 点的书桌',
          style: 'xiaohongshu-card',
          position: 'bottom',
        },
        {
          id: 'xhs-s2',
          startTime: 2.4,
          duration: 2.3,
          text: '中浅烘豆子研磨出柑橘花香',
          style: 'xiaohongshu-card',
          position: 'bottom',
        },
        {
          id: 'xhs-s3',
          startTime: 4.8,
          duration: 2.5,
          text: '注水闷蒸的那 30 秒最治愈',
          style: 'xiaohongshu-card',
          position: 'bottom',
        },
        {
          id: 'xhs-s4',
          startTime: 7.4,
          duration: 2.4,
          text: '配方放评论区啦，姐妹们快码住',
          style: 'xiaohongshu-card',
          position: 'bottom',
        },
      ],
      copy: {
        platform: 'xiaohongshu',
        title: '独居晨间仪式感｜3 分钟复刻好喝到尖叫的居家冰燕麦拿铁',
        caption: '早起不用赶着去买咖啡啦！15g 豆子 + 225ml 水温 92°C，倒入冰燕麦奶的一瞬间真的太治愈了。你们早八都喝什么提神？',
        hashtags: ['居家咖啡角', '晨间仪式感', '小红书vlog', '手冲咖啡分享', '治愈系日常'],
        hookOpening: '把咖啡馆搬进清晨 7 点的书桌',
        ctaText: '喜欢这篇记得点赞收藏防走丢',
      },
      audio: {
        bgmPreset: 'fresh-112',
        bpm: 112,
        volume: 0.62,
        voiceoverEnabled: false,
        voiceoverVoice: 'Zephyr',
        voiceoverPresetId: 'zh-zephyr',
        voiceoverVolume: 0.95,
        bgmAutoDucking: true,
        naturalMode: 'expressive',
      },
      sfxEvents: [],
      voiceoverCues: [],
    },
    tiktok: {
      platform: 'tiktok',
      aspectRatio: '9:16',
      clips: [
        {
          id: 'tk-c1',
          assetId: 'asset-swirl',
          label: 'Hook · Espresso Swirl Macro',
          trimStart: 0,
          duration: 2.0,
          transition: 'cut',
          motion: 'ken-burns-in',
          filter: 'vibrant',
          speed: 1,
          hookTag: 'Visual Hook',
        },
        {
          id: 'tk-c2',
          assetId: 'asset-beans',
          label: 'Beat 2 · Fresh Bean Grind',
          trimStart: 0,
          duration: 2.0,
          transition: 'flash',
          motion: 'pan-right',
          filter: 'warm-film',
          speed: 1,
        },
        {
          id: 'tk-c3',
          assetId: 'asset-pourover',
          label: 'Beat 3 · Steady Pour Steam',
          trimStart: 0,
          duration: 2.4,
          transition: 'whip-pan',
          motion: 'ken-burns-out',
          filter: 'cinematic',
          speed: 1,
        },
        {
          id: 'tk-c4',
          assetId: 'asset-desk',
          label: 'Outro · Morning Desk Setup',
          trimStart: 0,
          duration: 2.4,
          transition: 'zoom-punch',
          motion: 'ken-burns-in',
          filter: 'natural',
          speed: 1,
        },
      ],
      subtitles: [
        {
          id: 'tk-s1',
          startTime: 0.1,
          duration: 1.8,
          text: 'Stop buying $7 iced lattes',
          style: 'tiktok-pill',
          position: 'center',
        },
        {
          id: 'tk-s2',
          startTime: 2.0,
          duration: 1.9,
          text: 'Fresh medium-roast grind',
          style: 'tiktok-pill',
          position: 'bottom',
        },
        {
          id: 'tk-s3',
          startTime: 4.0,
          duration: 2.3,
          text: 'Slow bloom unlocks sweet aroma',
          style: 'tiktok-pill',
          position: 'bottom',
        },
        {
          id: 'tk-s4',
          startTime: 6.4,
          duration: 2.3,
          text: 'Save this 3-minute ritual',
          style: 'tiktok-pill',
          position: 'bottom',
        },
      ],
      copy: {
        platform: 'tiktok',
        title: '3-Minute Morning Pour-Over & Iced Oat Latte Ritual',
        caption: 'The easiest café-level morning workflow right from your desk. No fancy espresso machine needed—just fresh beans and steady water flow.',
        hashtags: ['coffeetok', 'morningritual', 'pourovercoffee', 'aestheticdesk', 'baristahome'],
        hookOpening: 'Stop buying $7 iced lattes',
        ctaText: 'Save for tomorrow morning',
      },
      audio: {
        bgmPreset: 'tech-118',
        bpm: 118,
        volume: 0.65,
        voiceoverEnabled: false,
        voiceoverVoice: 'Puck',
        voiceoverPresetId: 'en-puck',
        voiceoverVolume: 0.95,
        bgmAutoDucking: true,
        naturalMode: 'expressive',
      },
      sfxEvents: [],
      voiceoverCues: [],
    },
    instagram: {
      platform: 'instagram',
      aspectRatio: '9:16',
      clips: [
        {
          id: 'ig-c1',
          assetId: 'asset-pourover',
          label: 'Reels Opener · Warm Pour Steam',
          trimStart: 0,
          duration: 2.4,
          transition: 'cut',
          motion: 'ken-burns-in',
          filter: 'warm-film',
          speed: 1,
          hookTag: 'Aesthetic Hook',
        },
        {
          id: 'ig-c2',
          assetId: 'asset-beans',
          label: 'Macro Cut · Roasted Beans',
          trimStart: 0,
          duration: 2.2,
          transition: 'crossfade',
          motion: 'pan-left',
          filter: 'cinematic',
          speed: 1,
        },
        {
          id: 'ig-c3',
          assetId: 'asset-swirl',
          label: 'Hero Reveal · Iced Oat Swirl',
          trimStart: 0,
          duration: 2.6,
          transition: 'zoom-punch',
          motion: 'ken-burns-out',
          filter: 'vibrant',
          speed: 1,
        },
        {
          id: 'ig-c4',
          assetId: 'asset-desk',
          label: 'Final Frame · Creator Desk',
          trimStart: 0,
          duration: 2.6,
          transition: 'crossfade',
          motion: 'ken-burns-in',
          filter: 'natural',
          speed: 1,
        },
      ],
      subtitles: [
        {
          id: 'ig-s1',
          startTime: 0.1,
          duration: 2.2,
          text: 'MY 3-MINUTE STUDIO COFFEE RITUAL',
          style: 'instagram-bold',
          position: 'bottom',
        },
        {
          id: 'ig-s2',
          startTime: 2.4,
          duration: 2.1,
          text: 'FRESH BEANS · STEADY BLOOMING',
          style: 'instagram-bold',
          position: 'bottom',
        },
        {
          id: 'ig-s3',
          startTime: 4.6,
          duration: 2.5,
          text: 'VELVET OAT MILK POUR OVER ICE',
          style: 'instagram-bold',
          position: 'bottom',
        },
        {
          id: 'ig-s4',
          startTime: 7.2,
          duration: 2.4,
          text: 'SEND THIS TO YOUR COFFEE BUDDY',
          style: 'instagram-bold',
          position: 'bottom',
        },
      ],
      copy: {
        platform: 'instagram',
        title: 'Quiet Desk Mornings & Café-Grade Iced Oat Latte in 3 Minutes',
        caption: 'Proof that you do not need an expensive café bar for a clean, velvety morning brew. Tap Save so you can recreate the exact pour ratio tomorrow.',
        hashtags: ['reelsaesthetic', 'morningcoffee', 'homecafe', 'creatordesk', 'oatlatte'],
        hookOpening: 'MY 3-MINUTE STUDIO COFFEE RITUAL',
        ctaText: 'Save & share with your morning coffee partner',
      },
      audio: {
        bgmPreset: 'fresh-112',
        bpm: 114,
        volume: 0.62,
        voiceoverEnabled: false,
        voiceoverVoice: 'Kore',
        voiceoverPresetId: 'en-kore',
        voiceoverVolume: 0.95,
        bgmAutoDucking: true,
        naturalMode: 'expressive',
      },
      sfxEvents: [],
      voiceoverCues: [],
    },
    facebook: {
      platform: 'facebook',
      aspectRatio: '4:5',
      clips: [
        {
          id: 'fb-c1',
          assetId: 'asset-desk',
          label: 'Opening · Calm Studio Morning',
          trimStart: 0,
          duration: 2.8,
          transition: 'cut',
          motion: 'ken-burns-in',
          filter: 'natural',
          speed: 1,
          hookTag: 'Story Intro',
        },
        {
          id: 'fb-c2',
          assetId: 'asset-beans',
          label: 'Step 1 · Selecting Whole Beans',
          trimStart: 0,
          duration: 2.6,
          transition: 'crossfade',
          motion: 'ken-burns-out',
          filter: 'warm-film',
          speed: 1,
        },
        {
          id: 'fb-c3',
          assetId: 'asset-pourover',
          label: 'Step 2 · Controlled Extraction',
          trimStart: 0,
          duration: 2.8,
          transition: 'crossfade',
          motion: 'pan-left',
          filter: 'cinematic',
          speed: 1,
        },
        {
          id: 'fb-c4',
          assetId: 'asset-swirl',
          label: 'Finish · Velvet Oat Finish',
          trimStart: 0,
          duration: 2.8,
          transition: 'crossfade',
          motion: 'ken-burns-in',
          filter: 'vibrant',
          speed: 1,
        },
      ],
      subtitles: [
        {
          id: 'fb-s1',
          startTime: 0.1,
          duration: 2.6,
          text: 'How a slow 3-minute coffee ritual changes your focus',
          style: 'facebook-cinema',
          position: 'bottom',
        },
        {
          id: 'fb-s2',
          startTime: 2.8,
          duration: 2.5,
          text: 'Step 1: Grind fresh beans right before brewing',
          style: 'facebook-cinema',
          position: 'bottom',
        },
        {
          id: 'fb-s3',
          startTime: 5.4,
          duration: 2.7,
          text: 'Step 2: Pour gently in concentric circles for clarity',
          style: 'facebook-cinema',
          position: 'bottom',
        },
        {
          id: 'fb-s4',
          startTime: 8.2,
          duration: 2.6,
          text: 'Share this with a friend who loves quiet mornings',
          style: 'facebook-cinema',
          position: 'bottom',
        },
      ],
      copy: {
        platform: 'facebook',
        title: 'Why Creators Are Switching to This 3-Minute Morning Coffee Workflow',
        caption: 'Before opening emails or timelines, taking three mindful minutes to brew fresh coffee sets the tone for deep work. Which step is your favorite?',
        hashtags: ['MorningRoutine', 'CoffeeLovers', 'CreatorWorkspace', 'ReelsTips'],
        hookOpening: 'How a slow 3-minute coffee ritual changes your focus',
        ctaText: 'Share with someone who needs a calm morning',
      },
      audio: {
        bgmPreset: 'lofi-95',
        bpm: 95,
        volume: 0.6,
        voiceoverEnabled: false,
        voiceoverVoice: 'Charon',
        voiceoverPresetId: 'en-charon',
        voiceoverVolume: 0.95,
        bgmAutoDucking: true,
        naturalMode: 'expressive',
      },
      sfxEvents: [],
      voiceoverCues: [],
    },
  };
}

const VALID_TRANSITIONS: TransitionType[] = [
  'cut',
  'crossfade',
  'whip-pan',
  'zoom-punch',
  'spin-switch',
  'flash',
  'blur-dissolve',
  'push-pull',
  'page-flip',
  'iris-wipe',
  'curtain-split',
  'glitch-slice',
];
const VALID_MOTIONS: MotionType[] = ['ken-burns-in', 'ken-burns-out', 'pan-left', 'pan-right', 'static'];
const VALID_FILTERS: ColorFilter[] = ['natural', 'cinematic', 'vibrant', 'warm-film', 'cool-clean'];

export function applyAiPlanToProjects(
  plan: AutoEditApiResponse,
  assets: MediaAsset[],
  prevProjects: Record<PlatformId, PlatformProjectState>
): Record<PlatformId, PlatformProjectState> {
  const next = { ...prevProjects };
  const safeAssets = assets.length > 0 ? assets : BUILTIN_MEDIA_ASSETS;
  const recommendedBpm = Math.max(70, Math.min(160, Math.round(plan.recommendedBpm || 120)));

  for (const pPlan of plan.platforms as AutoEditApiPlatformPlan[]) {
    const pid = pPlan.platform;
    if (!ALL_PLATFORM_IDS.includes(pid)) continue;

    const existing = next[pid];
    const subtitleStyle = PLATFORM_META[pid].defaultSubtitleStyle;

    const clips: TimelineClip[] = (pPlan.clips || []).map((c, idx) => {
      const safeIndex = Math.max(0, Math.min(safeAssets.length - 1, Math.floor(c.assetIndex || 0)));
      const asset = safeAssets[safeIndex];
      const maxTrim = asset.type === 'video' ? Math.max(0, asset.duration - 1.2) : 0;
      const trimStart = asset.type === 'video' ? Math.max(0, Math.min(maxTrim, Number(c.trimStart) || 0)) : 0;
      const duration = Math.max(1.2, Math.min(8, Number(c.duration) || 2.5));
      const transition = VALID_TRANSITIONS.includes(c.transition)
        ? idx === 0
          ? 'cut'
          : c.transition
        : idx === 0
          ? 'cut'
          : 'crossfade';
      const motion = VALID_MOTIONS.includes(c.motion) ? c.motion : 'ken-burns-in';
      const filter = VALID_FILTERS.includes(c.filter) ? c.filter : 'cinematic';

      return {
        id: `${pid}-ai-clip-${Date.now()}-${idx}`,
        assetId: asset.id,
        label: c.label || asset.name,
        trimStart,
        duration,
        transition,
        motion,
        filter,
        speed: 1,
        hookTag: c.hookTag || undefined,
      };
    });

    const totalDur = clips.reduce((acc, item) => acc + item.duration, 0);

    const subtitles: SubtitleSegment[] = (pPlan.subtitles || [])
      .filter((s) => s.text && s.text.trim().length > 0)
      .map((s, idx) => {
        const startTime = Math.max(0, Math.min(Math.max(0, totalDur - 0.8), Number(s.startTime) || 0));
        const duration = Math.max(0.8, Math.min(6, Number(s.duration) || 2.0));
        const pos = s.position === 'center' || s.position === 'upper' ? s.position : 'bottom';
        return {
          id: `${pid}-ai-sub-${Date.now()}-${idx}`,
          startTime,
          duration,
          text: s.text.trim(),
          style: subtitleStyle,
          position: pos,
        };
      });

    next[pid] = {
      ...existing,
      clips: clips.length > 0 ? clips : existing.clips,
      subtitles: subtitles.length > 0 ? subtitles : existing.subtitles,
      copy: {
        platform: pid,
        title: pPlan.title || existing.copy.title,
        caption: pPlan.caption || existing.copy.caption,
        hashtags: Array.isArray(pPlan.hashtags)
          ? pPlan.hashtags.map((h) => h.replace(/^#/, '').trim()).filter(Boolean)
          : existing.copy.hashtags,
        hookOpening: pPlan.hookOpening || existing.copy.hookOpening,
        ctaText: pPlan.ctaText || existing.copy.ctaText,
      },
      audio: {
        ...existing.audio,
        bpm: recommendedBpm,
      },
    };
  }

  return next;
}

/**
 * Deterministic local Beat-Sync Auto-Cut algorithm:
 * Slices long videos into beat-aligned highlights & cycles transitions/motions cleanly.
 */
export function buildLocalBeatSyncTimeline(
  platform: PlatformId,
  assets: MediaAsset[],
  bpm: number,
  existingSubtitles: SubtitleSegment[],
  contentLang: ContentLanguage = 'zh-CN'
): { clips: TimelineClip[]; subtitles: SubtitleSegment[] } {
  const safeAssets = assets.length > 0 ? assets : BUILTIN_MEDIA_ASSETS;
  const beatsPerCut = bpm >= 120 ? 4 : 3;
  const beatUnit = (60 / Math.max(70, bpm)) * beatsPerCut;
  const cutDuration = Number(Math.max(1.5, Math.min(3.4, beatUnit)).toFixed(2));

  const motions: MotionType[] = ['ken-burns-in', 'pan-left', 'ken-burns-out', 'pan-right'];
  const transitions: TransitionType[] =
    platform === 'facebook' || platform === 'xiaohongshu'
      ? ['crossfade', 'crossfade', 'zoom-punch', 'crossfade']
      : ['zoom-punch', 'whip-pan', 'flash', 'crossfade'];
  const filters: ColorFilter[] =
    platform === 'douyin' || platform === 'xiaohongshu'
      ? ['vibrant', 'warm-film', 'cinematic', 'vibrant']
      : platform === 'tiktok' || platform === 'instagram'
        ? ['cinematic', 'vibrant', 'cool-clean', 'natural']
        : ['natural', 'warm-film', 'cinematic', 'natural'];

  const clips: TimelineClip[] = [];

  // Build up to 6-8 beat-synced highlight cuts across available assets
  const targetCuts = Math.max(4, Math.min(8, safeAssets.length * 2));
  for (let i = 0; i < targetCuts; i++) {
    const asset = safeAssets[i % safeAssets.length];
    const pass = Math.floor(i / safeAssets.length);
    let trimStart = 0;
    if (asset.type === 'video' && asset.duration > cutDuration + 0.5) {
      const maxStart = asset.duration - cutDuration;
      trimStart = Number(((pass * cutDuration * 1.3 + i * 0.6) % maxStart).toFixed(2));
    }

    const baseName = asset.name.replace(/\.[^.]+$/, '');
    clips.push({
      id: `${platform}-beat-${Date.now()}-${i}`,
      assetId: asset.id,
      label:
        contentLang === 'en'
          ? `Beat Cut ${i + 1} · ${baseName}`
          : `卡点片段 ${i + 1} · ${baseName}`,
      trimStart,
      duration: cutDuration,
      transition: i === 0 ? 'cut' : transitions[i % transitions.length],
      motion: motions[i % motions.length],
      filter: filters[i % filters.length],
      speed: 1,
      hookTag: i === 0 ? (contentLang === 'en' ? 'Beat 01 Hook' : '前3秒卡点钩子') : undefined,
    });
  }

  // Re-align existing subtitles proportionally across the new timeline
  const totalDuration = clips.reduce((acc, c) => acc + c.duration, 0);
  const subCount = Math.max(1, existingSubtitles.length);
  const subSlice = Number((totalDuration / subCount).toFixed(2));
  const subtitles = existingSubtitles.map((s, idx) => ({
    ...s,
    startTime: Number((idx * subSlice + 0.08).toFixed(2)),
    duration: Number(Math.max(0.9, subSlice - 0.16).toFixed(2)),
  }));

  return { clips, subtitles };
}

export function getTotalDuration(clips: TimelineClip[]): number {
  return clips.reduce((sum, clip) => sum + clip.duration, 0);
}

export function formatTimecode(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function toSrtTimestamp(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(msTotal / 3600000);
  const mins = Math.floor((msTotal % 3600000) / 60000);
  const secs = Math.floor((msTotal % 60000) / 1000);
  const ms = msTotal % 1000;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function exportSrtSubtitles(subtitles: SubtitleSegment[]): string {
  const sorted = [...subtitles].sort((a, b) => a.startTime - b.startTime);
  return sorted
    .map((s, idx) => {
      const start = toSrtTimestamp(s.startTime);
      const end = toSrtTimestamp(s.startTime + s.duration);
      return `${idx + 1}\n${start} --> ${end}\n${s.text}\n`;
    })
    .join('\n');
}

/**
 * Checks each voiceover cue against its corresponding video clip duration:
 * - If the synthesized speech exceeds the clip's length, dynamically expands that clip's duration
 * - Shifts all subsequent clips' start times, voiceover cues, subtitles, and SFX events accordingly
 * - Keeps subtitles locked 1:1 with the exact spoken startTime & duration
 */
export function alignProjectTimelineToVoiceover(
  project: PlatformProjectState,
  rawCues: VoiceoverCue[]
): PlatformProjectState {
  if (!rawCues || rawCues.length === 0) {
    return { ...project, voiceoverCues: [] };
  }

  const sortedCues = [...rawCues].sort((a, b) => a.startTime - b.startTime);
  const gapSec = 0.14;

  // Fallback when project has no clips
  if (project.clips.length === 0) {
    let cursor = Math.max(0.08, sortedCues[0]?.startTime ?? 0.1);
    const alignedCues = sortedCues.map((cue, idx) => {
      const rate = cue.playbackRate && cue.playbackRate > 0 ? cue.playbackRate : 1.0;
      const baseAudioSec =
        typeof cue.audioDurationSec === 'number' && cue.audioDurationSec > 0
          ? cue.audioDurationSec
          : cue.duration * rate;
      const spokenDuration = Number(Math.max(0.6, baseAudioSec / rate).toFixed(2));
      const startTime =
        idx === 0
          ? Number(Math.max(0.08, cue.startTime).toFixed(2))
          : Number(Math.max(cue.startTime, cursor).toFixed(2));
      cursor = startTime + spokenDuration + gapSec;
      return {
        ...cue,
        startTime,
        duration: spokenDuration,
        audioDurationSec: Number(baseAudioSec.toFixed(2)),
      };
    });
    return { ...project, voiceoverCues: alignedCues };
  }

  // 1. Compute original clip [start, end) ranges
  const origClipBounds: Array<{ start: number; end: number }> = [];
  let origCursor = 0;
  for (const clip of project.clips) {
    origClipBounds.push({ start: origCursor, end: origCursor + clip.duration });
    origCursor += clip.duration;
  }

  // 2. Map each cue to its corresponding video clip index
  const cuesByClipIdx: Array<Array<{ cue: VoiceoverCue; spokenDur: number; baseAudioSec: number }>> =
    project.clips.map(() => []);

  sortedCues.forEach((cue, idx) => {
    const rate = cue.playbackRate && cue.playbackRate > 0 ? cue.playbackRate : 1.0;
    const baseAudioSec =
      typeof cue.audioDurationSec === 'number' && cue.audioDurationSec > 0
        ? cue.audioDurationSec
        : cue.duration * rate;
    const spokenDur = Number(Math.max(0.6, baseAudioSec / rate).toFixed(2));

    let clipIdx = origClipBounds.findIndex(
      (b) => cue.startTime + 0.05 >= b.start && cue.startTime + 0.05 < b.end
    );
    if (clipIdx === -1) {
      if (project.clips.length === sortedCues.length) {
        clipIdx = idx;
      } else {
        clipIdx = cue.startTime >= origCursor ? project.clips.length - 1 : 0;
      }
    }
    cuesByClipIdx[clipIdx].push({ cue, spokenDur, baseAudioSec });
  });

  // 3. Walk clips sequentially: if voiceover exceeds clip duration, expand clip.duration and shift all subsequent clips/events
  let shiftOffset = 0;
  let newClipStart = 0;
  let prevCueEnd = 0;
  const alignedClips: TimelineClip[] = [];
  const alignedCues: VoiceoverCue[] = [];
  const newClipBounds: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const origStart = origClipBounds[i].start;
    const origEnd = origClipBounds[i].end;
    const assigned = cuesByClipIdx[i];

    let maxRequiredEnd = newClipStart + clip.duration;
    let clipCueEnd = prevCueEnd;

    for (const item of assigned) {
      const shiftedOrigStart = item.cue.startTime + shiftOffset;
      const startTime = Number(
        Math.max(
          newClipStart + 0.06,
          clipCueEnd > 0 ? clipCueEnd + gapSec : 0.08,
          shiftedOrigStart
        ).toFixed(2)
      );
      const cueEnd = startTime + item.spokenDur;
      clipCueEnd = cueEnd;
      prevCueEnd = cueEnd;

      const tailBuffer = i === project.clips.length - 1 ? 0.25 : 0.08;
      if (cueEnd + tailBuffer > maxRequiredEnd) {
        maxRequiredEnd = cueEnd + tailBuffer;
      }

      alignedCues.push({
        ...item.cue,
        startTime,
        duration: item.spokenDur,
        audioDurationSec: Number(item.baseAudioSec.toFixed(2)),
      });
    }

    const updatedDuration = Number(Math.max(clip.duration, maxRequiredEnd - newClipStart).toFixed(2));
    const delta = updatedDuration - clip.duration;
    shiftOffset += delta;

    const clipEnd = Number((newClipStart + updatedDuration).toFixed(2));
    newClipBounds.push({ start: newClipStart, end: clipEnd });
    alignedClips.push({
      ...clip,
      duration: updatedDuration,
    });

    // Advance next clip's start time smoothly after the expanded clip
    newClipStart = clipEnd;
    void origStart;
    void origEnd;
  }

  // 4. Sync subtitles to match the exact startTime & duration of their voiceover cues
  const cueBySubId = new Map<string, VoiceoverCue>();
  alignedCues.forEach((c) => {
    if (c.subtitleId) cueBySubId.set(c.subtitleId, c);
  });

  const sortedSubs = [...project.subtitles].sort((a, b) => a.startTime - b.startTime);
  const alignedSubtitles: SubtitleSegment[] = sortedSubs.map((sub, idx) => {
    const matched =
      cueBySubId.get(sub.id) ??
      (sortedSubs.length === alignedCues.length ? alignedCues[idx] : undefined);
    if (matched) {
      return {
        ...sub,
        startTime: matched.startTime,
        duration: matched.duration,
      };
    }
    // Shift unvoiced subtitles proportionally to their clip's new start
    const origIdx = origClipBounds.findIndex(
      (b) => sub.startTime + 0.05 >= b.start && sub.startTime + 0.05 < b.end
    );
    if (origIdx >= 0) {
      const localOffset = sub.startTime - origClipBounds[origIdx].start;
      return {
        ...sub,
        startTime: Number((newClipBounds[origIdx].start + localOffset).toFixed(2)),
      };
    }
    return sub;
  });

  // 5. Shift SFX events so cut/transition SFX stay aligned to the shifted clip boundaries
  const newTotal = getTotalDuration(alignedClips);
  const shiftedSfx = (project.sfxEvents ?? []).map((ev) => {
    const origIdx = origClipBounds.findIndex(
      (b) => ev.time >= b.start - 0.05 && ev.time <= b.end + 0.05
    );
    if (origIdx >= 0) {
      const origB = origClipBounds[origIdx];
      const newB = newClipBounds[origIdx];
      // If SFX was near a clip end/cut, anchor it to the new clip end
      if (origB.end - ev.time < 0.25) {
        const distFromEnd = Math.max(0, origB.end - ev.time);
        return {
          ...ev,
          time: Number(Math.max(0, Math.min(newTotal - 0.05, newB.end - distFromEnd)).toFixed(2)),
        };
      }
      const localOffset = Math.max(0, ev.time - origB.start);
      return {
        ...ev,
        time: Number(Math.min(newTotal - 0.05, newB.start + localOffset).toFixed(2)),
      };
    }
    return ev;
  });
  const alignedSfx = placeSuggestedSfxEvents(shiftedSfx, {
    totalDuration: newTotal,
    clips: boundsForClips(alignedClips),
    subtitles: alignedSubtitles,
  });

  return {
    ...project,
    clips: alignedClips,
    subtitles: alignedSubtitles,
    voiceoverCues: alignedCues,
    sfxEvents: alignedSfx,
  };
}
