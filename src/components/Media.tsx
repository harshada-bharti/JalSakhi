import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { ImageIcon, Video } from "lucide-react";

/**
 * Renders an evidence file stored in Convex storage.
 * Shows nothing until the (signed) URL is available.
 */
export function MediaView({
  storageId,
  kind,
  label,
}: {
  storageId: string;
  kind: "image" | "video";
  label?: string;
}) {
  const url = useQuery(api.complaints.fileUrl, {
    storageId: storageId as Id<"_storage">,
  });
  if (!url) return null;

  return (
    <div>
      {label && (
        <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          {kind === "image" ? (
            <ImageIcon className="size-3.5" />
          ) : (
            <Video className="size-3.5" />
          )}
          {label}
        </p>
      )}
      {kind === "image" ? (
        <img
          src={url}
          alt={label ?? "Evidence"}
          className="max-h-44 rounded-lg border object-contain"
        />
      ) : (
        <video src={url} controls className="max-h-52 rounded-lg border" />
      )}
    </div>
  );
}
