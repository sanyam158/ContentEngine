import React from 'react';

interface Variation {
  id: number;
  tweets: string[];
  metadata: {
    totalCharacters: number;
    tweetCount: number;
    generatedAt: string;
  };
}

interface VariationsViewProps {
  variations: Variation[];
  onSelectVariation: (variation: Variation) => void;
  onDelete: (id: number) => void;
  selectedVariationId?: number;
}

export const VariationsView: React.FC<VariationsViewProps> = ({
  variations,
  onSelectVariation,
  onDelete,
  selectedVariationId,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Thread Variations</h2>
        <p className="text-sm text-zinc-500">
          {variations.length} different approaches to your content
        </p>
      </div>

      <div className="space-y-3">
        {variations.map((variation) => (
          <div
            key={variation.id}
            className={`tweet-card p-4 cursor-pointer transition ${
              selectedVariationId === variation.id
                ? 'border-red-500/50 bg-red-500/5'
                : ''
            }`}
            onClick={() => onSelectVariation(variation)}
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-sm text-white">
                  Variation {variation.id}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {variation.tweets.length} tweets
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedVariationId === variation.id && (
                  <span className="text-xs font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                    Selected
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(variation.id);
                  }}
                  className="btn-danger p-1.5 rounded-lg"
                  title="Remove variation"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              {variation.tweets.slice(0, 2).map((tweet, i) => (
                <p key={i} className="text-xs text-zinc-400 truncate">
                  <span className="text-zinc-600 font-mono">{i + 1}.</span> {tweet}
                </p>
              ))}
              {variation.tweets.length > 2 && (
                <p className="text-xs text-zinc-600">
                  + {variation.tweets.length - 2} more
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
