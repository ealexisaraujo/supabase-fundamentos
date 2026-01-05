export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200/20 rounded-md ${className}`} />
  );
}

export function PostCardSkeleton() {
  return (
    <div className="bg-card-bg border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="w-24 h-4" />
          <Skeleton className="w-16 h-3" />
        </div>
      </div>

      {/* Image */}
      <div className="w-full aspect-square bg-card-bg">
        <Skeleton className="w-full h-full rounded-none" />
      </div>

      {/* Actions */}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-7 h-7 rounded-full" />
          <Skeleton className="w-20 h-4" />
        </div>
        <div className="flex flex-col gap-1">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-2/3 h-4" />
        </div>
      </div>
    </div>
  );
}

export function RankItemSkeleton() {
  return (
    <div className="relative aspect-square">
      <Skeleton className="w-full h-full rounded-none" />
    </div>
  );
}

export function CommentSkeleton() {
  return (
    <div className="flex items-start gap-2 py-2">
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-1/3 h-3" />
        <Skeleton className="w-full h-3" />
      </div>
    </div>
  );
}
