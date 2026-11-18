import { useMemo, useRef, useState } from 'react';
import {
  Film,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { MediaAiTags, MediaAsset, PlatformId } from '../types/studio';
import { formatEditSeconds } from '../client/timeline/editSeconds';
import { captureClipSnapshotBase64, type LoadedMediaElement } from '../utils/canvasRenderer';
import { apiFetch } from '../client/api/http';

interface MediaLibraryViewProps {
  assets: MediaAsset[];
  activePlatform: PlatformId;
  mediaCache: Map<string, LoadedMediaElement>;
  onUploadFiles: (files: FileList) => void;
  onInsertAndOpenEditor: (asset: MediaAsset) => void;
  onDeleteAsset: (assetId: string) => void;
  onUpdateAssetTags: (assetId: string, aiTags: MediaAiTags) => void;
}

const DEFAULT_SUBJECT_FILTERS = ['美食', '风景', '人物', '产品', '运动'];
const DEFAULT_VISUAL_FILTERS = ['高调', '低调', '暖色', '冷色'];

export function MediaLibraryView({
  assets,
  activePlatform,
  mediaCache,
  onUploadFiles,
  onInsertAndOpenEditor,
  onDeleteAsset,
  onUpdateAssetTags,
}: MediaLibraryViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('全部');
  const [selectedVisual, setSelectedVisual] = useState<string>('全部');
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [batchTagging, setBatchTagging] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  const subjectOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_SUBJECT_FILTERS);
    assets.forEach((a) => a.aiTags?.subjects.forEach((s) => set.add(s)));
    return ['全部', ...Array.from(set)];
  }, [assets]);

  const visualOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_VISUAL_FILTERS);
    assets.forEach((a) => a.aiTags?.visuals.forEach((v) => set.add(v)));
    return ['全部', ...Array.from(set)];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((asset) => {
      if (selectedSubject !== '全部') {
        if (!asset.aiTags?.subjects.includes(selectedSubject)) return false;
      }
      if (selectedVisual !== '全部') {
        if (!asset.aiTags?.visuals.includes(selectedVisual)) return false;
      }
      if (q) {
        const haystack = [
          asset.name,
          asset.aiTags?.sceneSummary ?? '',
          ...(asset.aiTags?.subjects ?? []),
          ...(asset.aiTags?.visuals ?? []),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [assets, selectedSubject, selectedVisual, searchQuery]);

  const tagSingleAsset = async (asset: MediaAsset) => {
    const el = mediaCache.get(asset.id);
    const frameBase64 = captureClipSnapshotBase64(el, 'natural');
    if (!frameBase64) {
      throw new Error(`素材 "${asset.name}" 尚未加载完成，无法识别。`);
    }

    const res = await apiFetch('/api/tag-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: asset.name,
        type: asset.type,
        frameBase64,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'AI 标签识别失败，请稍后重试。');
    }

    onUpdateAssetTags(asset.id, {
      subjects: Array.isArray(data.subjects) ? data.subjects : [],
      visuals: Array.isArray(data.visuals) ? data.visuals : [],
      sceneSummary: typeof data.sceneSummary === 'string' ? data.sceneSummary : undefined,
    });
  };

  const handleTagAssetClick = async (asset: MediaAsset) => {
    setTaggingId(asset.id);
    setTagError(null);
    try {
      await tagSingleAsset(asset);
    } catch (err: unknown) {
      setTagError(err instanceof Error ? err.message : '标签识别失败，请重试。');
    } finally {
      setTaggingId(null);
    }
  };

  const handleBatchTagAll = async () => {
    const untagged = assets.filter((a) => !a.aiTags);
    const targets = untagged.length > 0 ? untagged : assets;
    if (targets.length === 0) return;

    setBatchTagging(true);
    setTagError(null);
    try {
      for (const asset of targets) {
        setTaggingId(asset.id);
        await tagSingleAsset(asset);
      }
    } catch (err: unknown) {
      setTagError(err instanceof Error ? err.message : '批量识别失败，请稍后重试。');
    } finally {
      setTaggingId(null);
      setBatchTagging(false);
    }
  };

  const hasActiveFilter =
    selectedSubject !== '全部' || selectedVisual !== '全部' || searchQuery.trim().length > 0;

  const resetFilters = () => {
    setSelectedSubject('全部');
    setSelectedVisual('全部');
    setSearchQuery('');
  };

  const untaggedCount = assets.filter((a) => !a.aiTags).length;

  return (
    <main className="flex-1 overflow-y-auto bg-[#0B0D10] p-6">
      <div className="max-w-[1240px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 font-display">媒体素材库</h1>
            <p className="mt-1 text-xs text-zinc-400">
              导入本地实拍视频（MP4 / MOV / WebM）或高清产品图片，支持按 AI 识别的主体内容与视觉特征快速筛选。
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={batchTagging || assets.length === 0}
              onClick={handleBatchTagAll}
              className="px-3.5 py-2 rounded-lg border border-zinc-700/90 bg-[#11141B] hover:border-rose-500/70 disabled:opacity-50 text-xs font-medium text-zinc-200 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              {batchTagging ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                  <span>正在 AI 识别标签...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                  <span>
                    {untaggedCount > 0
                      ? `AI 识别未打标素材 (${untaggedCount})`
                      : 'AI 重新识别全部标签'}
                  </span>
                </>
              )}
            </button>

            <input
              ref={inputRef}
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
              onClick={() => inputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>上传本地素材</span>
            </button>
          </div>
        </div>

        {/* AI Content & Visual Filter Bar */}
        <section
          aria-label="AI 内容标签筛选"
          className="rounded-xl border border-zinc-800/90 bg-[#11141B] p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索素材文件名、场景或标签..."
                className="w-full rounded-lg bg-[#0B0D10] border border-zinc-800 pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono-nums">
              <span>
                显示 {filteredAssets.length} / {assets.length} 个素材
              </span>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-sans text-xs transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>重置筛选</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 pt-1 border-t border-zinc-800/70">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-400 mr-1 whitespace-nowrap">
                主体内容
              </span>
              {subjectOptions.map((subj) => {
                const active = selectedSubject === subj;
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => setSelectedSubject(subj)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-rose-600 text-white font-medium'
                        : 'bg-[#0B0D10] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                    }`}
                  >
                    {subj}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-400 mr-1 whitespace-nowrap">
                视觉特征
              </span>
              {visualOptions.map((vis) => {
                const active = selectedVisual === vis;
                return (
                  <button
                    key={vis}
                    type="button"
                    onClick={() => setSelectedVisual(vis)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-zinc-100 text-zinc-950 font-semibold'
                        : 'bg-[#0B0D10] text-zinc-400 hover:text-zinc-200 border border-zinc-800/80'
                    }`}
                  >
                    {vis}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {tagError && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">
            {tagError}
          </div>
        )}

        {/* Asset Grid or Empty State */}
        {filteredAssets.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-[#11141B] py-14 px-6 text-center space-y-3">
            <p className="text-sm font-medium text-zinc-200">
              未找到匹配「{selectedSubject !== '全部' ? selectedSubject : '任意主体'} /{' '}
              {selectedVisual !== '全部' ? selectedVisual : '任意视觉特征'}」的素材
            </p>
            <p className="text-xs text-zinc-500">
              你可以放宽筛选条件，或上传新素材后使用 AI 自动识别标签。
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-1 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 transition-colors"
            >
              清除筛选条件
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredAssets.map((asset) => {
              const allTags = [
                ...(asset.aiTags?.subjects ?? []),
                ...(asset.aiTags?.visuals ?? []),
              ];
              const isTaggingThis = taggingId === asset.id;

              return (
                <div
                  key={asset.id}
                  className="border border-zinc-800 bg-[#11141B] rounded-xl overflow-hidden flex flex-col justify-between"
                >
                  <div className="aspect-[9/16] bg-black relative overflow-hidden">
                    {asset.type === 'video' ? (
                      <video
                        src={asset.url}
                        muted
                        playsInline
                        controls
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

                  <div className="p-3 space-y-2.5">
                    <div>
                      <p className="text-xs font-medium text-zinc-100 truncate">{asset.name}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono-nums">
                        {asset.type === 'video' ? (
                          <Film className="w-3 h-3 shrink-0" />
                        ) : (
                          <ImageIcon className="w-3 h-3 shrink-0" />
                        )}
                        <span>{asset.type === 'video' ? '视频' : '图片'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatEditSeconds(asset.duration)}s</span>
                        {asset.fileSizeLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{asset.fileSizeLabel}</span>
                          </>
                        )}
                      </div>

                      {/* Unboxed AI content & visual tags metadata */}
                      <div className="mt-2 pt-2 border-t border-zinc-800/70 space-y-0.5">
                        {asset.aiTags ? (
                          <>
                            {asset.aiTags.sceneSummary && (
                              <p className="text-[11px] text-zinc-300 truncate">
                                {asset.aiTags.sceneSummary}
                              </p>
                            )}
                            <p className="text-[11px] text-rose-300/90 truncate">
                              {allTags.join(' · ')}
                            </p>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isTaggingThis}
                            onClick={() => handleTagAssetClick(asset)}
                            className="text-[11px] text-zinc-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                          >
                            {isTaggingThis ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3 text-rose-400" />
                            )}
                            <span>{isTaggingThis ? '识别中...' : 'AI 识别内容标签'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onInsertAndOpenEditor(asset)}
                        className="flex-1 py-1.5 px-2 rounded-md bg-zinc-800 hover:bg-rose-600 text-[11px] font-medium text-zinc-100 flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3" />
                        <span>
                          插入{' '}
                          {activePlatform === 'douyin'
                            ? '抖音'
                            : activePlatform === 'tiktok'
                              ? 'TikTok'
                              : 'Facebook'}
                        </span>
                      </button>
                      {asset.source === 'upload' && (
                        <button
                          type="button"
                          onClick={() => onDeleteAsset(asset.id)}
                          title="移除素材"
                          className="p-1.5 rounded-md bg-zinc-800 hover:bg-red-600/80 text-zinc-300 hover:text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
