/**
 * Noise2Article — Module exports
 */

export { runPipeline } from './pipeline.js';
export type {
  RawPost,
  FilteredPost,
  Theme,
  TavilyContextItem,
  GeneratedArticle,
  PipelineConfig,
  PipelineResult,
  PipelineStageResult,
  SubredditConfig,
  NicheContext,
  NichePreset,
} from './types.js';
export { DEFAULT_CONFIG, NICHE_PRESETS, DEFAULT_NICHE_CONTEXT, getNichePreset } from './types.js';
