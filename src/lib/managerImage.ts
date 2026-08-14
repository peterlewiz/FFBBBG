import { useEffect, useState } from "react";

const CUSTOM_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

export const DEFAULT_AVATAR_URL = "https://sleepercdn.com/images/v2/icons/player_default.webp";

export function sleeperAvatarUrl(avatar: string | null | undefined): string {
  return avatar ? `https://sleepercdn.com/avatars/thumbs/${avatar}` : DEFAULT_AVATAR_URL;
}

function customImageCandidates(userId: string): string[] {
  return CUSTOM_IMAGE_EXTENSIONS.map((ext) => `/manager-images/${userId}.${ext}`);
}

/**
 * Ordered fallback chain for a manager's image: custom-uploaded image
 * (any of a few extensions, checked in order) → their Sleeper avatar →
 * a generic default icon. Custom images live in /public/manager-images -
 * see the README there for the naming convention.
 */
export function managerImageCandidates(
  userId: string,
  avatar: string | null | undefined,
): string[] {
  return [...customImageCandidates(userId), sleeperAvatarUrl(avatar), DEFAULT_AVATAR_URL];
}

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

/**
 * Checks (client-side) whether a custom image exists for this manager yet,
 * without needing a build-time manifest - lets the UI use a completely
 * different, full-bleed layout once a real photo is available instead of
 * the small-avatar placeholder, without any code changes when images get
 * added to /public/manager-images later.
 */
export function useCustomManagerImage(userId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    (async () => {
      for (const candidate of customImageCandidates(userId)) {
        if (await probeImage(candidate)) {
          if (!cancelled) setUrl(candidate);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return url;
}
