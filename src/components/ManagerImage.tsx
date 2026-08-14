import { useState } from "react";
import { managerImageCandidates } from "../lib/managerImage";

/**
 * A manager's photo, preferring a custom-uploaded image over their
 * Sleeper avatar, with a generic icon as the last resort. See
 * public/manager-images/README.md for how to add a custom image.
 */
export function ManagerImage({
  userId,
  avatar,
  alt = "",
  className,
}: {
  userId: string;
  avatar: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  const candidates = managerImageCandidates(userId, avatar);
  const [index, setIndex] = useState(0);

  return (
    <img
      src={candidates[index]}
      alt={alt}
      className={className}
      onError={() => setIndex((i) => Math.min(i + 1, candidates.length - 1))}
    />
  );
}
