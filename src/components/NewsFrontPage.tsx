import { useRef, useState } from "react";
import type { Headline } from "../lib/headlines";
import { useCustomManagerImage } from "../lib/managerImage";
import { teamColor, teamColorAlpha } from "../lib/teamColors";

const SITE_NEON = "#00e5ff"; // for headlines not about one manager

/**
 * Stories listed beside the lead; the rest go in a grid underneath.
 * Three rows is about the height of the lead story at desktop width -
 * listing all nine beside it left most of the lead's column empty.
 */
const SIDE_COUNT = 3;

/**
 * Stories listed under the lead on a phone before "Show all". Everything
 * at once made the section about a screen and a half tall there; desktop
 * lays the same stories out side by side and always shows them all.
 */
const PHONE_VISIBLE = 4;

/** The lead story's banner: the manager's custom art when they have
 * one, otherwise a neon placeholder, with the BREAKING ribbon and tag. */
function HeroBanner({
  headline,
  aspectClass = "aspect-[21/9] sm:aspect-[21/6]",
}: {
  headline: Headline;
  /** Box shape. The front page passes the banners' own 21:8 so the art
   * isn't cropped at half width. */
  aspectClass?: string;
}) {
  const userId = headline.manager?.userId;
  const accent = userId ? teamColor(userId) : SITE_NEON;
  const glow = userId ? teamColorAlpha(userId, 0.35) : "rgba(0, 229, 255, 0.35)";
  const customImage = useCustomManagerImage(userId ?? "");

  return (
    <div
      className={`relative w-full overflow-hidden bg-ink ${aspectClass}`}
      style={{ boxShadow: `inset 0 0 120px ${teamColorAlpha(userId ?? "", 0.12)}` }}
    >
      {customImage ? (
        <img src={customImage} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          {/* Neon grid floor + glow, no photo yet */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(${teamColorAlpha(userId ?? "", 0.12)} 1px, transparent 1px),
                linear-gradient(90deg, ${teamColorAlpha(userId ?? "", 0.12)} 1px, transparent 1px)`,
              backgroundSize: "44px 44px",
              maskImage: "linear-gradient(to top, black, transparent 75%)",
            }}
          />
          <div
            aria-hidden
            className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: glow }}
          />
          <div className="relative flex h-full items-center justify-center">
            <span
              className="text-6xl sm:text-7xl"
              style={{ filter: `drop-shadow(0 0 18px ${accent})` }}
            >
              🏈
            </span>
          </div>
        </>
      )}

      {/* Scanline sheen over the whole banner, ties photo and placeholder together */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)",
        }}
      />
      {/* Bottom fade so the headline text below reads as one unit with the art */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
        style={{ background: "linear-gradient(to top, #0c0e16, transparent)" }}
      />

      {/* BREAKING ribbon */}
      <div
        className="absolute left-0 top-0 flex items-center gap-1.5 px-3 py-1.5"
        style={{ background: accent, boxShadow: `0 0 24px ${glow}` }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink">
          Breaking
        </span>
      </div>

      {/* Tag badge */}
      <div
        className="absolute right-3 top-3 rounded-full border px-3 py-1 backdrop-blur-sm"
        style={{
          borderColor: teamColorAlpha(userId ?? "", 0.5),
          background: "rgba(5, 6, 11, 0.55)",
        }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: accent }}
        >
          {headline.tag}
        </span>
      </div>
    </div>
  );
}

/**
 * The week's news laid out like a front page: the lead story large, with
 * its manager's banner, and every other headline in a list beside it.
 *
 * Replaces a carousel that showed one story at a time on a 7-second
 * rotation - ten headlines took over a minute to see, and most visitors
 * saw one or two before scrolling past. Now the whole week reads at a
 * glance. Tapping a story in the list makes it the lead, so every banner
 * is still one tap away without anything moving on its own.
 */
export function NewsFrontPage({ headlines }: { headlines: Headline[] }) {
  const [featured, setFeatured] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const leadRef = useRef<HTMLElement | null>(null);
  if (headlines.length === 0) return null;

  const leadIndex = Math.min(featured, headlines.length - 1);
  const lead = headlines[leadIndex];
  const leadUser = lead.manager?.userId;
  // The rest keep their original order - generateHeadlines already ranks
  // them from the week's biggest story down.
  const rest = headlines.map((h, i) => ({ h, i })).filter(({ i }) => i !== leadIndex);
  const side = rest.slice(0, SIDE_COUNT);
  const more = rest.slice(SIDE_COUNT);
  // On a phone the side list and the grid read as one list, so the cut
  // falls this far into the grid.
  const phoneCutInMore = Math.max(0, PHONE_VISIBLE - side.length);
  const phoneHidden = expanded ? 0 : Math.max(0, more.length - phoneCutInMore);

  function feature(i: number) {
    setFeatured(i);
    // On a phone the list sits below the lead, so the reader is scrolled
    // away from where the story just appeared. "nearest" is a no-op on
    // desktop, where the lead is right beside the list.
    leadRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <section
      aria-label="League news"
      className="overflow-hidden rounded-2xl border bg-surface transition-colors"
      style={{
        borderColor: teamColorAlpha(leadUser ?? "", 0.35),
        boxShadow: `0 0 40px ${teamColorAlpha(leadUser ?? "", 0.1)}`,
      }}
    >
      {/* minmax(0, 1fr) rather than a bare `grid`: an implicit column sizes
          to its widest unbreakable content, and a one-line truncated
          subhead is exactly that - it pushed the phone layout past the
          card's edge, where overflow-hidden cut the text off. */}
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <article ref={leadRef} className="scroll-mt-24">
          <HeroBanner headline={lead} aspectClass="aspect-[21/8]" />
          <div className="px-5 py-4">
            <p className="text-lg font-extrabold leading-tight text-primary sm:text-xl">
              {lead.text}
            </p>
            <p className="mt-1 text-sm text-muted">{lead.subhead}</p>
          </div>
        </article>

        {side.length > 0 && (
          <ul className="divide-y divide-line border-t border-line md:border-l md:border-t-0">
            {side.map(({ h, i }) => (
              <li key={h.tag + i}>
                <StoryRow headline={h} onSelect={() => feature(i)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {more.length > 0 && (
        // One column on phones, three across on desktop. Borders are drawn
        // per cell rather than with a gap-and-background trick, which would
        // paint any empty cell in a short last row as a grey block.
        <ul id="news-more" className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-3">
          {more.map(({ h, i }, pos) => (
            <li
              key={h.tag + i}
              className={`border-t border-line md:[&:not(:nth-child(3n+1))]:border-l ${
                // Hidden on phones only - desktop always shows the grid.
                !expanded && pos >= phoneCutInMore ? "hidden md:block" : ""
              }`}
            >
              <StoryRow headline={h} onSelect={() => feature(i)} />
            </li>
          ))}
        </ul>
      )}

      {(phoneHidden > 0 || expanded) && more.length > phoneCutInMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="news-more"
          className="w-full border-t border-line px-4 py-3 text-sm font-semibold text-neon transition-colors hover:bg-surface-2 md:hidden"
        >
          {expanded ? "Show fewer stories" : `Show all ${headlines.length} stories`}
        </button>
      )}
    </section>
  );
}

function StoryRow({ headline, onSelect }: { headline: Headline; onSelect: () => void }) {
  const userId = headline.manager?.userId;
  const accent = userId ? teamColor(userId) : SITE_NEON;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
    >
      {userId ? (
        <img
          src={`/manager-avatars/${userId}.png`}
          alt=""
          className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
          style={{ border: `1.5px solid ${accent}` }}
        />
      ) : (
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-sm">
          🏈
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className="mb-0.5 inline-block rounded px-1.5 py-px text-[10px] font-bold uppercase tracking-wider"
          style={{ color: accent, background: teamColorAlpha(userId ?? "", 0.12) }}
        >
          {headline.tag}
        </span>
        <span className="line-clamp-2 block text-sm font-semibold leading-snug text-primary">
          {headline.text}
        </span>
        <span className="block truncate text-xs text-muted">{headline.subhead}</span>
      </span>
    </button>
  );
}
