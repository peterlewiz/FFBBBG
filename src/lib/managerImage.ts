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
 * Which image exists for a manager, resolved once per page load. The
 * answer can't change while the page is open, so memoizing it matters:
 * the headline ticker remounts this on every rotation, and re-probing
 * each time made the hero flash its fallback before the real image
 * reappeared.
 */
const resolved = new Map<string, string | null>();

/**
 * Checks (client-side) whether a custom image exists for this manager yet,
 * without needing a build-time manifest - lets the UI use a completely
 * different, full-bleed layout once a real photo is available instead of
 * the small-avatar placeholder, without any code changes when images get
 * added to /public/manager-images later.
 */
export function useCustomManagerImage(userId: string): string | null {
  const [url, setUrl] = useState<string | null>(() => resolved.get(userId) ?? null);

  useEffect(() => {
    if (resolved.has(userId)) {
      setUrl(resolved.get(userId) ?? null);
      return;
    }
    // Headlines with no specific manager (e.g. "DRAFT DAY") pass "" here.
    // There's nothing to probe for - skip straight to "no image" instead
    // of firing four requests that all fall through to the SPA rewrite.
    if (!userId) {
      resolved.set(userId, null);
      setUrl(null);
      return;
    }

    let cancelled = false;
    setUrl(null);
    (async () => {
      for (const candidate of customImageCandidates(userId)) {
        if (await probeImage(candidate)) {
          resolved.set(userId, candidate);
          if (!cancelled) setUrl(candidate);
          return;
        }
      }
      resolved.set(userId, null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return url;
}
