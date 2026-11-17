import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ADMIN_TOKEN_HEADER, UI_LANG_HEADER } from '../contracts/http';
import type { ContentLanguage, UiLanguage } from '../types/studio';

export const UI_LANG_STORAGE_KEY = 'clipflow_ui_lang_v1';
export const CONTENT_LANG_STORAGE_KEY = 'clipflow_content_lang_v1';
export const ADMIN_TOKEN_STORAGE_KEY = 'clipflow_admin_token';

export function detectBrowserUiLanguage(): UiLanguage {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const lang = (navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : '') || '').toLowerCase();
  return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

export function getStoredUiLanguage(): UiLanguage {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const saved = window.localStorage.getItem(UI_LANG_STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    // ignore storage restrictions
  }
  return detectBrowserUiLanguage();
}

export function getStoredContentLanguage(): ContentLanguage {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    const saved = window.localStorage.getItem(CONTENT_LANG_STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    // ignore storage restrictions
  }
  return getStoredUiLanguage();
}

export function readStoredAdminToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function focusAdminTokenField(): void {
  if (typeof document === 'undefined') return;
  document.querySelector<HTMLInputElement>('[aria-label="访问令牌"]')?.focus();
}

export function buildApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    [UI_LANG_HEADER]: getStoredUiLanguage(),
    ...extra,
  };
  if (typeof window !== 'undefined') {
    try {
      const token = readStoredAdminToken();
      if (token) {
        headers[ADMIN_TOKEN_HEADER] = token;
      }
    } catch {
      // ignore storage errors
    }
  }
  return headers;
}

export function formatNumberLocale(
  value: number,
  lang: UiLanguage,
  options?: Intl.NumberFormatOptions
): string {
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDateTimeLocale(
  input: string | number | Date,
  lang: UiLanguage,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(
    locale,
    options ?? {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  ).format(date);
}

export function formatShortDateLocale(input: string | number | Date, lang: UiLanguage): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * Formats prices using CNY (¥) in zh-CN and USD ($) in en.
 * Accepts price in USD and converts at a clean 7.2 reference rate for CNY display.
 */
export function formatPriceLocale(
  usdAmount: number,
  lang: UiLanguage,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const locale = lang === 'zh-CN' ? 'zh-CN' : 'en-US';
  const currency = lang === 'zh-CN' ? 'CNY' : 'USD';
  const amount = lang === 'zh-CN' ? usdAmount * 7.2 : usdAmount;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: options?.minimumFractionDigits ?? (amount === 0 ? 2 : 0),
    maximumFractionDigits: options?.maximumFractionDigits ?? (amount === 0 ? 2 : 2),
  }).format(amount);
}

export function formatFileSizeLocale(bytes: number, lang: UiLanguage): string {
  if (bytes <= 0) return `0 KB`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${formatNumberLocale(Math.round(kb), lang)} KB`;
  const mb = kb / 1024;
  return `${formatNumberLocale(Number(mb.toFixed(mb >= 100 ? 0 : 1)), lang, {
    minimumFractionDigits: mb >= 100 ? 0 : 1,
    maximumFractionDigits: mb >= 100 ? 0 : 1,
  })} MB`;
}

export const ZH_CN_DICT = {
  // Document / Brand
  'app.docTitle': 'ClipFlow Studio — 短视频多平台智能剪辑工作台',
  'app.nav.editor': '自动剪辑台',
  'app.nav.matrix': '多端成片对比',
  'app.nav.media': '媒体素材库',
  'app.exportBtn': '导出成片',
  'app.langToggleLabel': '切换界面语言',

  // Platform Groups & Names
  'platform.group.domestic': '国内平台',
  'platform.group.global': '海外平台',
  'platform.douyin': '抖音 Douyin',
  'platform.douyin.short': '抖音',
  'platform.xiaohongshu': '小红书',
  'platform.xiaohongshu.short': '小红书',
  'platform.tiktok': 'TikTok',
  'platform.tiktok.short': 'TikTok',
  'platform.instagram': 'Instagram Reels',
  'platform.instagram.short': 'Instagram',
  'platform.facebook': 'Facebook Reels',
  'platform.facebook.short': 'Facebook',

  // BriefAndMediaPanel
  'brief.tab.ai': '智能自动剪辑',
  'brief.tab.media': '素材库',
  'brief.label': '成片主题与脚手架提示',
  'brief.contentLangLabel': 'AI 内容输出语言',
  'brief.contentLangHint': '仅影响 AI 生成的文案、字幕与口播语言（可与界面语言分开）',
  'brief.contentLang.zh': '简体中文',
  'brief.contentLang.en': 'English',
  'brief.placeholder': '描述你想生成的短视频内容、卖点或镜头顺序...',
  'brief.preset.coffee': '手冲咖啡',
  'brief.preset.coffeeText': '早八人3分钟居家手冲冰拿铁教程：展示磨豆、V60注水蒸汽、浓缩液倒入燕麦奶，最后呈现窗边极简办公桌面。',
  'brief.preset.coffeeTextEn': '3-minute morning iced oat latte tutorial at home: freshly ground coffee beans, V60 pour-over steam bloom, espresso swirl into iced oat milk, and a minimal sunlit creator desk.',
  'brief.preset.review': '好物测评',
  'brief.preset.reviewText': '桌面生产力装备开箱测评：突出产品质感细节、实际使用场景对比和真实口碑推荐，适合海外 TikTok 与国内抖音小红书种草带货。',
  'brief.preset.reviewTextEn': 'Creator desk setup unboxing review: highlight tactile product details, real workflow comparison, and honest recommendation for Reels, TikTok, and Xiaohongshu.',
  'brief.preset.lifestyle': '生活方式',
  'brief.preset.lifestyleText': '城市晨间高效工作流 Vlog：从第一杯咖啡开启专注早晨，强调极简审美与安静治愈的生活节奏。',
  'brief.preset.lifestyleTextEn': 'Urban calm morning workflow vlog: starting deep focus with freshly brewed coffee, clean desk minimalism, and unhurried daily rhythm.',
  'brief.polish.title': 'AI 脚本辅助润色',
  'brief.polish.subtitle': '简述变爆款分镜',
  'brief.polish.tone.viralHook': '强钩子高完播',
  'brief.polish.tone.storytelling': '沉浸故事感',
  'brief.polish.tone.conversion': '种草高转化',
  'brief.polish.loading': '正在拆解吸睛分镜文案...',
  'brief.polish.regenerate': '重新生成分镜润色',
  'brief.polish.generate': '拆解并润色为分镜文案',
  'brief.polish.hookLabel': '黄金 3 秒钩子',
  'brief.polish.shotPrefix': '镜',
  'brief.polish.visualPrefix': '画面：',
  'brief.polish.voicePrefix': '口播：',
  'brief.polish.applied': '已更新到上方脚本 Brief',
  'brief.polish.applyBtn': '一键更新至上方脚本 (Brief)',
  'brief.polish.collapse': '收起润色结果',
  'brief.targetPlatforms': '目标发布平台',
  'brief.editingStyle': '自动剪辑风格',
  'brief.style.beatSync': '高燃卡点混剪 (快切 + 推拉转场)',
  'brief.style.productShowcase': '爆款种草带货 (黄金3秒 + 卖点字幕)',
  'brief.style.cinematicStory': '电影感叙事 (叠化 + 慢推镜头)',
  'brief.style.talkingHead': '干货口播节奏 (结构化分段)',
  'brief.durationLabel': '目标时长',
  'brief.duration.10': '10 秒 · 极速',
  'brief.duration.15': '15 秒 · 标准',
  'brief.duration.24': '24 秒 · 深度',
  'brief.bpmLabel': '节拍速度 (BPM)',
  'brief.autoSoundTitle': '同步配齐 AI 声音（配音 + 配乐 + 音效）',
  'brief.autoSoundDesc': '剪辑完成后自动为当前平台生成自然口播配音、匹配 BGM 与节点音效并开启人声闪避',
  'brief.runAiLoading': '正在编排多端剪辑时间线...',
  'brief.runAiBtn': 'AI 生成多平台成片',
  'brief.beatSyncBtn': '一键节拍自动卡点重剪',
  'brief.uploadBtn': '导入本地视频或图片素材',
  'brief.uploadHint': '支持 MP4 / MOV / WebM / JPG / PNG',
  'brief.insertTooltip': '添加到当前时间线',
  'media.type.video': '视频',
  'media.type.image': '图片',

  // PreviewStage
  'preview.safeZones': '平台安全区',
  'preview.safeTop.douyin': '抖音安全顶栏',
  'preview.safeTop.xiaohongshu': '小红书 · 发现 / 笔记',
  'preview.safeTop.tiktok': 'Following · For You',
  'preview.safeTop.instagram': 'Instagram Reels Safe Top',
  'preview.safeTop.facebook': 'Facebook Reels Safe Top',
  'preview.creatorHandle': '@创作者',
  'preview.playAria': '播放预览',
  'preview.seekStartTitle': '回到开头',
  'preview.play': '播放',
  'preview.pause': '暂停',
  'preview.split': '分割',
  'preview.splitTitle': '在当前播放头位置分割片段',
  'preview.mute': '静音',
  'preview.unmute': '取消静音',
  'preview.copyCardSuffix': '发布文案',
  'preview.copy': '复制',
  'preview.copied': '已复制',
  'preview.hookLabel': '开场黄金钩子',
  'preview.titleLabel': '推荐标题',
  'preview.captionTagsLabel': '正文引导与标签',
  'preview.metaClips': '镜头',
  'preview.metaSubtitles': '字幕',

  // TimelineDock
  'timeline.title': '多轨自动剪辑时间线',
  'timeline.totalPrefix': '总长',
  'timeline.bpmAlign': 'BPM 节拍对齐',
  'timeline.addSubtitle': '插入字幕',
  'timeline.snapToBeat': '对齐节拍点',
  'timeline.ruler': 'TIMECODE',
  'timeline.track.video': '视频轨',
  'timeline.track.subtitle': '字幕轨',
  'timeline.track.voiceover': '配音轨',
  'timeline.track.audio': '音效 · 节拍',
  'timeline.dhFullBadge': '数字人主播',
  'timeline.dhPipBadge': '+数字人PiP',
  'timeline.motionBlurBadge': '动态模糊',
  'timeline.opticalFlowBadge': '光流平滑',
  'timeline.micHuman': '真人',
  'timeline.micLabel': '真人录音',
  'timeline.aiVoiceLabel': 'AI 配音',

  // MultiPlatformMatrixView
  'matrix.title': '多端成片对比与分发中心',
  'matrix.subtitle': '同一组素材已按国内（抖音、小红书）与海外（TikTok、Instagram Reels、Facebook Reels）的钩子、画幅比例及字幕风格独立剪辑完成。',
  'matrix.editBtn': '精修时间线',
  'matrix.hookLabel': '开场钩子',
  'matrix.titleLabel': '推荐发布标题',
  'matrix.exportBtn': '导出此端视频',
  'matrix.copyBtn': '复制文案',
  'matrix.copiedBtn': '已复制',
  'matrix.estValueLabel': '预估单条商业投放参考价',
  'matrix.updatedLabel': '同步于',
  'matrix.clipsUnit': '镜头',
  'matrix.subtitlesUnit': '字幕',

  // MediaLibraryView
  'media.title': '媒体素材库',
  'media.subtitle': '导入本地实拍视频（MP4 / MOV / WebM）或高清产品图片，支持按 AI 识别的主体内容与视觉特征快速筛选。',
  'media.batchTagging': '正在 AI 识别标签...',
  'media.tagUntagged': 'AI 识别未打标素材',
  'media.retagAll': 'AI 重新识别全部标签',
  'media.uploadLocal': '上传本地素材',
  'media.searchPlaceholder': '搜索素材文件名、场景或标签...',
  'media.showingCount': '显示 {shown} / {total} 个素材',
  'media.resetFilter': '重置筛选',
  'media.subjectFilter': '主体内容',
  'media.visualFilter': '视觉特征',
  'media.filterAll': '全部',
  'media.emptyTitle': '未找到匹配「{subject} / {visual}」的素材',
  'media.emptyAnySubject': '任意主体',
  'media.emptyAnyVisual': '任意视觉特征',
  'media.emptyHint': '你可以放宽筛选条件，或上传新素材后使用 AI 自动识别标签。',
  'media.clearFilters': '清除筛选条件',
  'media.tagging': '识别中...',
  'media.tagBtn': 'AI 识别内容标签',
  'media.insertTo': '插入 {platform}',
  'media.removeTitle': '移除素材',

  // VoiceCloneModal
  'vclone.title': 'AI 声音克隆 · 专属音色引导向导',
  'vclone.subtitle': '录制 30 秒个人朗读音频，自动提取声纹音调、气声质感与语速节奏，生成个性化语音合成音色',
  'vclone.step1': '1. 录制 30s 个人朗读',
  'vclone.step2': '2. 上传训练声学模型',
  'vclone.step3': '3. 试听并启用音色',
  'vclone.voiceNameLabel': '自定义音色名称',
  'vclone.voiceNameDefault': '我的专属口播音色',
  'vclone.voiceNamePlaceholder': '例如：阿泽自然口播',
  'vclone.scriptStyleLabel': '朗读引导词风格',
  'vclone.teleprompterTitle': '朗读提词器（请用平时拍视频的自然语速朗读以下段落）',
  'vclone.teleprompterTip': '建议保持安静环境 · 距麦 15cm',
  'vclone.statusRecording': '正在采集中 · 请自然朗读上方文字',
  'vclone.statusRecorded': '已完成录制 ({sec} 秒)',
  'vclone.statusReady': '准备就绪 · 点击下方按钮开始 30 秒录制',
  'vclone.micLevel': '电平',
  'vclone.btnStopMin': '录制中 (建议至少 {min}s，推荐满 30s)...',
  'vclone.btnStopEarly': '提前结束录制并预览',
  'vclone.btnRerecord': '重新录制 30 秒样本',
  'vclone.btnStartRecord': '开始 30 秒麦克风录制',
  'vclone.btnUploadSample': '上传本地干声',
  'vclone.clearTooltip': '清空当前录音',
  'vclone.durWarn': '当前时长 {sec}s（可训练，但录制接近 30s 音色还原更稳）',
  'vclone.durOk': '样本时长 {sec}s 充足，可开始上传训练',
  'vclone.durEmpty': '点击开始录制后，按上方提词器正常朗读 30 秒即可',
  'vclone.trainBtn': '上传音频并训练音色',
  'vclone.trainingTitle': '正在为「{name}」进行声纹特征建模...',
  'vclone.trainingSub': '基于上传的 {sec} 秒原声样本提取个人音高、语速节奏与呼吸质感',
  'vclone.stage1': '上传 30s 个人朗读样本并完成降噪解析',
  'vclone.stage2': '提取基频音域、共振峰暖度、停顿习惯与气声特征',
  'vclone.stage3': '构建 Voice Design 专属声线参数并合成首条试听样音',
  'vclone.backRecord': '返回重录',
  'vclone.retryTrain': '重试训练',
  'vclone.baseVoiceLabel': '基底声学：',
  'vclone.testLabel': '输入任意文本测试你的克隆音色合成效果',
  'vclone.replaySample': '重播首句样音',
  'vclone.synthesizing': '正在用你的专属音色实时合成...',
  'vclone.auditionBtn': '试听新文案合成效果',
  'vclone.resampleBtn': '重新采样训练',
  'vclone.saveActivateBtn': '保存并设为当前配音音色',

  // ExportModal
  'export.titlePrefix': '导出成片',
  'export.optimizedBadge': '平台优化已启用',
  'export.step1': '1. 多平台优化与编码配置',
  'export.step2': '2. 导出预览与成片合成',
  'export.multiPlatformTitle': '多平台导出优化',
  'export.multiPlatformDesc': '根据目标分发平台自动匹配推荐画幅、编码器、码率与分辨率档位',
  'export.strategyPrefix': '优化策略:',
  'export.encodingSection': '编码参数 · 码率 · 分辨率配置',
  'export.modeAuto': '平台自动预设（可微调）',
  'export.modeManual': '手动自定义模式',
  'export.aspectLabel': '导出画面比例',
  'export.aspect916': '9:16 竖屏',
  'export.aspect45': '4:5 信息流',
  'export.resLabel': '导出分辨率',
  'export.res1080': '1080p 超清',
  'export.res720': '720p 极速',
  'export.codecLabel': '视频编码格式',
  'export.codec.vp9': 'VP9 + Opus (高清推荐)',
  'export.codec.h264': 'H.264 / 高兼容优先',
  'export.codec.vp8': 'VP8 + Opus (快速合成)',
  'export.codec.auto': '自动选择最佳支持编码',
  'export.fpsLabel': '导出帧率',
  'export.bitrateLabel': '目标视频码率',
  'export.audioLabel': '音频',
  'export.watermarkTitle': '「AI 生成」标识水印',
  'export.watermarkDesc': '默认开启，直接烧录至成片右上角',
  'export.watermarkText': 'AI 生成',
  'export.transcodeTitle': '自动转码 H.264 MP4',
  'export.transcodeNative': '浏览器已原生支持 H.264 MP4',
  'export.transcodeFfmpeg': '非 H.264 MP4 时服务端 FFmpeg 转码',
  'export.estimateTitle': '预计导出：',
  'export.approxSize': '约',
  'export.actualCodec': '实际编码：',
  'export.renderCostLabel': '本地渲染费用：',
  'export.renderCostCompare': '（对比云端渲染 {cloudPrice}）',
  'export.genPreviewLoading': '正在生成预览...',
  'export.genPreviewBtn': '生成导出预览',
  'export.framePreviewTitle': '成片画面预览',
  'export.hideSafeZone': '隐藏安全区',
  'export.showSafeZone': '显示安全区',
  'export.safeInteract': '互动区',
  'export.safeCaption': '文案与话题避让区',
  'export.safeFeed': 'Feed 信息流底部安全边',
  'export.previewTimeLabel': '预览时间点',
  'export.snapOpening': '开场画面',
  'export.snapMiddle': '中段节奏',
  'export.snapEnding': '高潮结尾',
  'export.preflightTitle': '导出预检与文件估算',
  'export.finalRatioLabel': '最终画面比例',
  'export.ratioVertical': '竖屏全屏比例',
  'export.ratioFeed': 'Feed 信息流比例',
  'export.estSizeLabel': '预计文件大小',
  'export.vbrRange': 'VBR 区间：',
  'export.checkTarget': '目标平台优化',
  'export.checkAutoPreset': '自动预设',
  'export.checkCustom': '自定义配置',
  'export.checkCodec': '编码与封装',
  'export.checkWatermark': 'AI 生成角标',
  'export.checkWatermarkOn': '已开启 · 烧录右上角',
  'export.checkWatermarkOff': '已关闭',
  'export.checkBitrate': '目标码率',
  'export.checkTracks': '合成轨道',
  'export.checkTracksSummary': '{clips} 镜头 · {subs} 字幕 · {audioMode}',
  'export.withVoiceover': '含AI配音',
  'export.bgmOnly': '配乐音轨',
  'export.renderDone': '渲染完成 · 实际大小 {size} · 完成于 {time}',
  'export.renderProgressLabel': '视频渲染合成 (画面 + 音轨)',
  'export.backAdjust': '调整参数',
  'export.transcodingBtn': '正在服务端 FFmpeg 转码 H.264 MP4...',
  'export.renderingBtn': '正在实时合成视频帧 ({pct}%)...',
  'export.startRenderBtn': '开始合成并导出视频',
  'export.downloadBtn': '下载成片 (.{ext} · {size})',
  'export.exportSrtBtn': '导出字幕 (.srt)',
  'export.copyPackBtn': '复制标题与标签',
  'export.copiedPackBtn': '已复制发布文案',
  'export.transcodingNote': '浏览器录制格式非 H.264 MP4，正在服务端通过 FFmpeg 转码...',
  'export.transcodedOkNote': '已通过服务端 FFmpeg 转码为高兼容 H.264 MP4',
  'export.transcodedFallbackNote': '{reason}（已为您保留原始 {ext} 成片供直接下载）',

  // Inspector & Voice grouping
  'voice.group.zh': '中文配音音色（普通话）',
  'voice.group.en': '英语配音音色（English）',
  'voice.group.cloned': '我的克隆专属音色',
  'inspector.tab.clip': '片段与转场',
  'inspector.tab.subtitle': '字幕样式',
  'inspector.tab.audio': '配音与配乐',
  'inspector.tab.dh': '数字人驱动',

  // Digital Human Tab Cache & Core
  'dh.cache.hitBadge': '服务端帧缓存命中',
  'dh.cache.freshBadge': '服务端帧序列已缓存',
  'dh.cache.framesCount': '{frames} 帧序列',
  'dh.cache.pathLabel': '缓存路径：',
  'dh.cache.cachedAt': '缓存时间：',

  // Bilingual Error Strings
  'err.network': '请求失败，请检查网络连接后重试。',
  'err.autoEditFailed': 'AI 自动剪辑生成失败，请稍后重试。',
  'err.polishFailed': 'AI 脚本辅助润色失败，请稍后重试。',
  'err.tagNotReady': '素材 "{name}" 尚未加载完成，无法识别。',
  'err.tagFailed': 'AI 标签识别失败，请稍后重试。',
  'err.batchTagFailed': '批量识别失败，请稍后重试。',
  'err.noMediaRecorder': '当前浏览器不支持 MediaRecorder 视频录制，请使用最新版 Chrome 或 Edge。',
  'err.noCanvasCtx': '无法初始化画布渲染上下文。',
  'err.exportFailed': '视频导出失败，请重试。',
  'err.transcodeFailed': '服务端 FFmpeg 转码失败',
  'err.fileReadFailed': '音频文件读取失败',
  'err.noMicBrowser': '当前浏览器不支持麦克风录制，请点击右下方「上传本地干声」导入音频。',
  'err.micShort': '录音过短或未检测到语音信号，请靠近麦克风重试。',
  'err.micPerm': '未能开启麦克风，请在浏览器地址栏允许麦克风权限或导入本地音频文件。',
  'err.voiceCloneTrainFailed': 'AI 声音克隆建模失败，请重试。',
  'err.voiceCloneNetwork': '模型训练请求失败，请检查网络后重试。',
  'err.voiceClonePreviewFailed': '试听生成失败，请重试。',
} as const;

export type TranslationKey = keyof typeof ZH_CN_DICT;

export const EN_DICT: Record<TranslationKey, string> = {
  // Document / Brand
  'app.docTitle': 'ClipFlow Studio — Multi-Platform AI Short Video Editor',
  'app.nav.editor': 'Auto Editor',
  'app.nav.matrix': 'Platform Matrix',
  'app.nav.media': 'Media Library',
  'app.exportBtn': 'Export Video',
  'app.langToggleLabel': 'Switch UI language',

  // Platform Groups & Names
  'platform.group.domestic': 'Domestic (China)',
  'platform.group.global': 'Global',
  'platform.douyin': 'Douyin (抖音)',
  'platform.douyin.short': 'Douyin',
  'platform.xiaohongshu': 'Xiaohongshu (小红书)',
  'platform.xiaohongshu.short': 'RED / XHS',
  'platform.tiktok': 'TikTok',
  'platform.tiktok.short': 'TikTok',
  'platform.instagram': 'Instagram Reels',
  'platform.instagram.short': 'Instagram',
  'platform.facebook': 'Facebook Reels',
  'platform.facebook.short': 'Facebook',

  // BriefAndMediaPanel
  'brief.tab.ai': 'AI Auto-Edit',
  'brief.tab.media': 'Media',
  'brief.label': 'Video Brief & Script Prompt',
  'brief.contentLangLabel': 'AI Content Language',
  'brief.contentLangHint': 'Controls generated scripts, captions & voiceover (independent from UI)',
  'brief.contentLang.zh': '简体中文',
  'brief.contentLang.en': 'English',
  'brief.placeholder': 'Describe the short video topic, key selling points, or shot sequence...',
  'brief.preset.coffee': 'Pour-Over Coffee',
  'brief.preset.coffeeText': '早八人3分钟居家手冲冰拿铁教程：展示磨豆、V60注水蒸汽、浓缩液倒入燕麦奶，最后呈现窗边极简办公桌面。',
  'brief.preset.coffeeTextEn': '3-minute morning iced oat latte tutorial at home: freshly ground coffee beans, V60 pour-over steam bloom, espresso swirl into iced oat milk, and a minimal sunlit creator desk.',
  'brief.preset.review': 'Gear Review',
  'brief.preset.reviewText': '桌面生产力装备开箱测评：突出产品质感细节、实际使用场景对比和真实口碑推荐，适合海外 TikTok 与国内抖音小红书种草带货。',
  'brief.preset.reviewTextEn': 'Creator desk setup unboxing review: highlight tactile product details, real workflow comparison, and honest recommendation for Reels, TikTok, and Xiaohongshu.',
  'brief.preset.lifestyle': 'Lifestyle Vlog',
  'brief.preset.lifestyleText': '城市晨间高效工作流 Vlog：从第一杯咖啡开启专注早晨，强调极简审美与安静治愈的生活节奏。',
  'brief.preset.lifestyleTextEn': 'Urban calm morning workflow vlog: starting deep focus with freshly brewed coffee, clean desk minimalism, and unhurried daily rhythm.',
  'brief.polish.title': 'AI Script Polisher',
  'brief.polish.subtitle': 'Idea to Viral Beats',
  'brief.polish.tone.viralHook': 'Viral Retention',
  'brief.polish.tone.storytelling': 'Story Arc',
  'brief.polish.tone.conversion': 'Product Conversion',
  'brief.polish.loading': 'Structuring storyboard beats...',
  'brief.polish.regenerate': 'Regenerate Storyboard',
  'brief.polish.generate': 'Polish into Storyboard Script',
  'brief.polish.hookLabel': '3-Second Opening Hook',
  'brief.polish.shotPrefix': 'Shot',
  'brief.polish.visualPrefix': 'Visual: ',
  'brief.polish.voicePrefix': 'VO: ',
  'brief.polish.applied': 'Updated Brief Above',
  'brief.polish.applyBtn': 'Apply to Brief Above',
  'brief.polish.collapse': 'Collapse polished script',
  'brief.targetPlatforms': 'Target Platforms',
  'brief.editingStyle': 'Auto-Edit Style',
  'brief.style.beatSync': 'Beat-Sync Montage (Fast Cuts + Motion)',
  'brief.style.productShowcase': 'Product Showcase (3s Hook + Callouts)',
  'brief.style.cinematicStory': 'Cinematic Story (Dissolves + Slow Push)',
  'brief.style.talkingHead': 'Talking Head (Structured Pacing)',
  'brief.durationLabel': 'Target Duration',
  'brief.duration.10': '10s · Snappy',
  'brief.duration.15': '15s · Standard',
  'brief.duration.24': '24s · Deep Dive',
  'brief.bpmLabel': 'Tempo (BPM)',
  'brief.autoSoundTitle': 'Auto-Score Full Audio (VO + BGM + SFX)',
  'brief.autoSoundDesc': 'Automatically synthesizes voiceover, matches BGM & transition SFX, and enables vocal ducking',
  'brief.runAiLoading': 'Arranging multi-platform timelines...',
  'brief.runAiBtn': 'Generate Multi-Platform Cuts',
  'brief.beatSyncBtn': 'Quick Local Beat-Sync Cut',
  'brief.uploadBtn': 'Import Local Videos or Photos',
  'brief.uploadHint': 'Supports MP4 / MOV / WebM / JPG / PNG',
  'brief.insertTooltip': 'Add to current timeline',
  'media.type.video': 'Video',
  'media.type.image': 'Image',

  // PreviewStage
  'preview.safeZones': 'Safe Zones',
  'preview.safeTop.douyin': 'Douyin Safe Top',
  'preview.safeTop.xiaohongshu': 'Xiaohongshu · Explore / Note',
  'preview.safeTop.tiktok': 'Following · For You',
  'preview.safeTop.instagram': 'Instagram Reels Safe Top',
  'preview.safeTop.facebook': 'Facebook Reels Safe Top',
  'preview.creatorHandle': '@Creator',
  'preview.playAria': 'Play preview',
  'preview.seekStartTitle': 'Seek to start',
  'preview.play': 'Play',
  'preview.pause': 'Pause',
  'preview.split': 'Split',
  'preview.splitTitle': 'Split clip at playhead',
  'preview.mute': 'Mute',
  'preview.unmute': 'Unmute',
  'preview.copyCardSuffix': 'Post Copy',
  'preview.copy': 'Copy',
  'preview.copied': 'Copied',
  'preview.hookLabel': 'Opening Hook',
  'preview.titleLabel': 'Suggested Title',
  'preview.captionTagsLabel': 'Caption & Hashtags',
  'preview.metaClips': 'clips',
  'preview.metaSubtitles': 'subs',

  // TimelineDock
  'timeline.title': 'Multi-Track AI Timeline',
  'timeline.totalPrefix': 'Total',
  'timeline.bpmAlign': 'BPM Grid',
  'timeline.addSubtitle': 'Add Subtitle',
  'timeline.snapToBeat': 'Snap to Beat',
  'timeline.ruler': 'TIMECODE',
  'timeline.track.video': 'Video',
  'timeline.track.subtitle': 'Subtitles',
  'timeline.track.voiceover': 'Voiceover',
  'timeline.track.audio': 'SFX · Beat',
  'timeline.dhFullBadge': 'AI Avatar',
  'timeline.dhPipBadge': '+Avatar PiP',
  'timeline.motionBlurBadge': 'Motion Blur',
  'timeline.opticalFlowBadge': 'Optical Flow',
  'timeline.micHuman': 'Mic',
  'timeline.micLabel': 'Mic Recording',
  'timeline.aiVoiceLabel': 'AI Voiceover',

  // MultiPlatformMatrixView
  'matrix.title': 'Multi-Platform Distribution Matrix',
  'matrix.subtitle': 'The same media assets tailored independently for Domestic (Douyin, Xiaohongshu) and Global (TikTok, Instagram Reels, Facebook Reels) specs.',
  'matrix.editBtn': 'Edit Timeline',
  'matrix.hookLabel': 'Opening Hook',
  'matrix.titleLabel': 'Recommended Title',
  'matrix.exportBtn': 'Export Video',
  'matrix.copyBtn': 'Copy Post',
  'matrix.copiedBtn': 'Copied',
  'matrix.estValueLabel': 'Est. Creator Campaign Value',
  'matrix.updatedLabel': 'Updated',
  'matrix.clipsUnit': 'clips',
  'matrix.subtitlesUnit': 'subs',

  // MediaLibraryView
  'media.title': 'Media Library',
  'media.subtitle': 'Import local footage (MP4 / MOV / WebM) or high-res photos, and filter instantly by AI-detected subjects and visual tone.',
  'media.batchTagging': 'AI Tagging Assets...',
  'media.tagUntagged': 'AI Tag Untagged',
  'media.retagAll': 'Re-Tag All with AI',
  'media.uploadLocal': 'Upload Local Media',
  'media.searchPlaceholder': 'Search filename, scene summary, or tags...',
  'media.showingCount': 'Showing {shown} of {total} assets',
  'media.resetFilter': 'Reset Filters',
  'media.subjectFilter': 'Subject',
  'media.visualFilter': 'Visual Tone',
  'media.filterAll': 'All',
  'media.emptyTitle': 'No assets matching "{subject} / {visual}"',
  'media.emptyAnySubject': 'Any Subject',
  'media.emptyAnyVisual': 'Any Visual',
  'media.emptyHint': 'Try broadening your filters or upload new media and run AI auto-tagging.',
  'media.clearFilters': 'Clear Filters',
  'media.tagging': 'Tagging...',
  'media.tagBtn': 'AI Tag Content',
  'media.insertTo': 'Add to {platform}',
  'media.removeTitle': 'Remove asset',

  // VoiceCloneModal
  'vclone.title': 'AI Voice Clone · Guided Calibration',
  'vclone.subtitle': 'Record 30s of natural speech to capture pitch, breath texture, and cadence for custom voiceover synthesis.',
  'vclone.step1': '1. Record 30s Sample',
  'vclone.step2': '2. Train Voice Model',
  'vclone.step3': '3. Audition & Activate',
  'vclone.voiceNameLabel': 'Custom Voice Name',
  'vclone.voiceNameDefault': 'My Studio Voice',
  'vclone.voiceNamePlaceholder': 'e.g. Alex Studio Voice',
  'vclone.scriptStyleLabel': 'Teleprompter Style',
  'vclone.teleprompterTitle': 'Teleprompter (read aloud at your natural creator pace)',
  'vclone.teleprompterTip': 'Quiet room · 15cm from mic',
  'vclone.statusRecording': 'Recording · Read the teleprompter naturally',
  'vclone.statusRecorded': 'Recorded ({sec}s)',
  'vclone.statusReady': 'Ready · Click below to start 30s recording',
  'vclone.micLevel': 'Level',
  'vclone.btnStopMin': 'Recording (min {min}s, 30s ideal)...',
  'vclone.btnStopEarly': 'Finish & Preview',
  'vclone.btnRerecord': 'Re-record 30s Sample',
  'vclone.btnStartRecord': 'Start 30s Mic Recording',
  'vclone.btnUploadSample': 'Upload Audio Sample',
  'vclone.clearTooltip': 'Clear recording',
  'vclone.durWarn': '{sec}s captured (trainable, though ~30s gives more stable timbre)',
  'vclone.durOk': '{sec}s sample ready for acoustic training',
  'vclone.durEmpty': 'Press record and read the teleprompter for 30 seconds',
  'vclone.trainBtn': 'Upload & Train Voice',
  'vclone.trainingTitle': 'Modeling vocal fingerprint for "{name}"...',
  'vclone.trainingSub': 'Extracting pitch, cadence, and breath timbre from {sec}s sample',
  'vclone.stage1': 'Upload 30s reading sample & apply noise floor parsing',
  'vclone.stage2': 'Extract pitch range, formant warmth & pause cadence',
  'vclone.stage3': 'Build Voice Design profile & synthesize audition sample',
  'vclone.backRecord': 'Back to Record',
  'vclone.retryTrain': 'Retry Training',
  'vclone.baseVoiceLabel': 'Base Acoustic: ',
  'vclone.testLabel': 'Enter any line to audition your cloned voice',
  'vclone.replaySample': 'Replay Initial Sample',
  'vclone.synthesizing': 'Synthesizing with your cloned voice...',
  'vclone.auditionBtn': 'Audition Test Script',
  'vclone.resampleBtn': 'Re-sample Audio',
  'vclone.saveActivateBtn': 'Save & Set as Active Voice',

  // ExportModal
  'export.titlePrefix': 'Export Video',
  'export.optimizedBadge': 'Platform Optimized',
  'export.step1': '1. Platform & Encoding Config',
  'export.step2': '2. Preview & Render',
  'export.multiPlatformTitle': 'Multi-Platform Optimization',
  'export.multiPlatformDesc': 'Automatically applies recommended aspect ratio, codec, bitrate, and resolution per platform',
  'export.strategyPrefix': 'Strategy:',
  'export.encodingSection': 'Codec · Bitrate · Resolution',
  'export.modeAuto': 'Auto Platform Preset (Editable)',
  'export.modeManual': 'Custom Manual Mode',
  'export.aspectLabel': 'Aspect Ratio',
  'export.aspect916': '9:16 Vertical',
  'export.aspect45': '4:5 Feed',
  'export.resLabel': 'Resolution',
  'export.res1080': '1080p Full HD',
  'export.res720': '720p Fast',
  'export.codecLabel': 'Video Codec',
  'export.codec.vp9': 'VP9 + Opus (High Quality)',
  'export.codec.h264': 'H.264 / Max Compatibility',
  'export.codec.vp8': 'VP8 + Opus (Fast Encode)',
  'export.codec.auto': 'Auto Best Supported',
  'export.fpsLabel': 'Frame Rate',
  'export.bitrateLabel': 'Target Video Bitrate',
  'export.audioLabel': 'Audio',
  'export.watermarkTitle': '"AI Generated" Watermark',
  'export.watermarkDesc': 'On by default · burned into top-right corner',
  'export.watermarkText': 'AI Generated',
  'export.transcodeTitle': 'Auto-Transcode H.264 MP4',
  'export.transcodeNative': 'Native browser H.264 MP4 active',
  'export.transcodeFfmpeg': 'Server FFmpeg transcodes non-MP4 captures',
  'export.estimateTitle': 'Estimated Output:',
  'export.approxSize': '~',
  'export.actualCodec': 'Active Codec:',
  'export.renderCostLabel': 'Local Render Cost:',
  'export.renderCostCompare': '(vs. {cloudPrice} cloud GPU)',
  'export.genPreviewLoading': 'Generating preview...',
  'export.genPreviewBtn': 'Generate Export Preview',
  'export.framePreviewTitle': 'Frame Preview',
  'export.hideSafeZone': 'Hide Safe Zones',
  'export.showSafeZone': 'Show Safe Zones',
  'export.safeInteract': 'UI Rail',
  'export.safeCaption': 'Caption & Hashtag Safe Margin',
  'export.safeFeed': 'Feed Bottom Safe Margin',
  'export.previewTimeLabel': 'Preview Timecode',
  'export.snapOpening': 'Opening',
  'export.snapMiddle': 'Middle',
  'export.snapEnding': 'Ending',
  'export.preflightTitle': 'Preflight Check & Estimate',
  'export.finalRatioLabel': 'Output Dimensions',
  'export.ratioVertical': 'Vertical Fullscreen',
  'export.ratioFeed': 'Feed Ratio',
  'export.estSizeLabel': 'Estimated File Size',
  'export.vbrRange': 'VBR Range:',
  'export.checkTarget': 'Platform Optimization',
  'export.checkAutoPreset': 'Auto Preset',
  'export.checkCustom': 'Custom Config',
  'export.checkCodec': 'Codec & Container',
  'export.checkWatermark': 'AI Disclosure Badge',
  'export.checkWatermarkOn': 'Enabled · Top-Right Burn-In',
  'export.checkWatermarkOff': 'Disabled',
  'export.checkBitrate': 'Target Bitrate',
  'export.checkTracks': 'Mixed Tracks',
  'export.checkTracksSummary': '{clips} clips · {subs} subs · {audioMode}',
  'export.withVoiceover': 'With AI VO',
  'export.bgmOnly': 'BGM Track',
  'export.renderDone': 'Render Complete · {size} · Finished {time}',
  'export.renderProgressLabel': 'Video & Audio Render',
  'export.backAdjust': 'Adjust Settings',
  'export.transcodingBtn': 'Transcoding to H.264 MP4 via FFmpeg...',
  'export.renderingBtn': 'Rendering video frames ({pct}%)...',
  'export.startRenderBtn': 'Start Render & Export',
  'export.downloadBtn': 'Download Video (.{ext} · {size})',
  'export.exportSrtBtn': 'Export Subtitles (.srt)',
  'export.copyPackBtn': 'Copy Title & Tags',
  'export.copiedPackBtn': 'Copied Post Copy',
  'export.transcodingNote': 'Browser captured non-H.264 format; transcoding on server via FFmpeg...',
  'export.transcodedOkNote': 'Server FFmpeg transcoded to compatible H.264 MP4',
  'export.transcodedFallbackNote': '{reason} (Original {ext} kept ready for direct download)',

  // Inspector & Voice grouping
  'voice.group.zh': 'Chinese Voices (Mandarin)',
  'voice.group.en': 'English Voices (US / Studio)',
  'voice.group.cloned': 'My Cloned Voices',
  'inspector.tab.clip': 'Clips & FX',
  'inspector.tab.subtitle': 'Subtitles',
  'inspector.tab.audio': 'Audio & VO',
  'inspector.tab.dh': 'Digital Human',

  // Digital Human Tab Cache & Core
  'dh.cache.hitBadge': 'Server Frame Cache Hit',
  'dh.cache.freshBadge': 'Server Frame Sequence Cached',
  'dh.cache.framesCount': '{frames} frames',
  'dh.cache.pathLabel': 'Cache path:',
  'dh.cache.cachedAt': 'Cached at:',

  // Bilingual Error Strings
  'err.network': 'Request failed. Please check your connection and try again.',
  'err.autoEditFailed': 'AI auto-edit generation failed. Please try again shortly.',
  'err.polishFailed': 'AI script polishing failed. Please try again shortly.',
  'err.tagNotReady': 'Asset "{name}" is still loading and cannot be tagged yet.',
  'err.tagFailed': 'AI asset tagging failed. Please try again shortly.',
  'err.batchTagFailed': 'Batch AI tagging failed. Please try again shortly.',
  'err.noMediaRecorder': 'MediaRecorder is unavailable in this browser. Please use recent Chrome or Edge.',
  'err.noCanvasCtx': 'Could not initialize 2D canvas context for export.',
  'err.exportFailed': 'Video export failed. Please try again.',
  'err.transcodeFailed': 'Server FFmpeg transcode failed',
  'err.fileReadFailed': 'Failed to read audio file.',
  'err.noMicBrowser': 'Microphone recording is unsupported in this browser. Please upload a local audio sample.',
  'err.micShort': 'Recording was too short or silent. Please speak closer to the mic and retry.',
  'err.micPerm': 'Microphone access was denied. Enable mic permission or upload a local audio file.',
  'err.voiceCloneTrainFailed': 'AI voice clone training failed. Please retry.',
  'err.voiceCloneNetwork': 'Voice training request failed. Please check network and retry.',
  'err.voiceClonePreviewFailed': 'Audition synthesis failed. Please retry.',
};

interface I18nContextValue {
  uiLang: UiLanguage;
  setUiLang: (lang: UiLanguage) => void;
  contentLang: ContentLanguage;
  setContentLang: (lang: ContentLanguage) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDateTime: (input: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatShortDate: (input: string | number | Date) => string;
  formatPrice: (usdAmount: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => string;
  formatFileSize: (bytes: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [uiLang, setUiLangState] = useState<UiLanguage>(() => getStoredUiLanguage());
  const [contentLang, setContentLangState] = useState<ContentLanguage>(() => getStoredContentLanguage());

  const setUiLang = useCallback((lang: UiLanguage) => {
    setUiLangState(lang);
    try {
      window.localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, []);

  const setContentLang = useCallback((lang: ContentLanguage) => {
    setContentLangState(lang);
    try {
      window.localStorage.setItem(CONTENT_LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const dict = uiLang === 'zh-CN' ? ZH_CN_DICT : EN_DICT;
    document.documentElement.lang = uiLang === 'zh-CN' ? 'zh-CN' : 'en';
    document.title = dict['app.docTitle'];
  }, [uiLang]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const dict = uiLang === 'zh-CN' ? ZH_CN_DICT : EN_DICT;
      let text: string = dict[key] ?? ZH_CN_DICT[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    [uiLang]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => formatNumberLocale(value, uiLang, options),
    [uiLang]
  );

  const formatDateTime = useCallback(
    (input: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
      formatDateTimeLocale(input, uiLang, options),
    [uiLang]
  );

  const formatShortDate = useCallback(
    (input: string | number | Date) => formatShortDateLocale(input, uiLang),
    [uiLang]
  );

  const formatPrice = useCallback(
    (usdAmount: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) =>
      formatPriceLocale(usdAmount, uiLang, options),
    [uiLang]
  );

  const formatFileSize = useCallback(
    (bytes: number) => formatFileSizeLocale(bytes, uiLang),
    [uiLang]
  );

  return (
    <I18nContext.Provider
      value={{
        uiLang,
        setUiLang,
        contentLang,
        setContentLang,
        t,
        formatNumber,
        formatDateTime,
        formatShortDate,
        formatPrice,
        formatFileSize,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return ctx;
}
