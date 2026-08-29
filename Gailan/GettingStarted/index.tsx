// This is the example widget that ships with Gailan. You can modify it as you
// see fit, or simply delete the file to remove it.
//
// Gailan is a fork of Übersicht by Felix Hageloh. The widget API, the server
// underneath, and the whole idea are his work: https://tracesof.net/uebersicht

import { constrainDrag, React, styled } from "gailan";

// this is the shell command that gets executed every time this widget
// refreshes. id -F prints your full name; render keeps the first word.
export const command = "id -F";

// the refresh frequency in milliseconds; your name doesn't change, so this
// widget doesn't refresh
export const refreshFrequency: number | false = false;

// Widget state, typed. Events flow through updateState (a tiny redux),
// which is the documented way to keep state in a widget.
/* Declared in widget.json so the app can build controls for them, and delivered
   to render as props.settings. The widths are what Small, Medium and Large mean. */
const BACKGROUNDS = ["follow", "light", "dark", "pink"];

type Settings = {
  size?: "small" | "medium" | "large";
  showCredits?: boolean;
  opacity?: number;
  background?: string;
};

const WIDTHS: Record<string, number> = { small: 280, medium: 340, large: 420 };

type State = {
  output: string;
  error?: string;
  settings?: Settings;
};

type Event = { type: "UB/COMMAND_RAN"; output: string; error?: string };

export const initialState: State = { output: "" };

export const updateState = (event: Event, previous: State): State => {
  if (event.type === "UB/COMMAND_RAN") {
    return { output: event.output || "", error: event.error };
  }
  return previous;
};

export const className = `
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
`;

/* Window position lives outside render (and in localStorage) so dragging
   survives re-renders and widget reloads. */
const WIDGET_ID = "gailan-welcome";
const POS_KEY = "gailan.welcome.pos";

let pos: { left: number; top: number } | null = null;
try {
  pos = JSON.parse(localStorage.getItem(POS_KEY) || "null");
} catch (e) {
  /* first run */
}

/* Where the middle of the screen turns out to be. The window is as tall as its
   contents, so the only way to sit exactly in the middle is to measure it, and the
   first paint has to happen before there is anything to measure. Kept apart from pos
   so it is not mistaken for a position somebody chose, and so a screen that changes
   size re-centres a window nobody has moved. */
let centered: { left: number; top: number } | null = null;

const placeInMiddle = () => {
  if (pos) return;

  const el = document.getElementById(WIDGET_ID);
  const screen = el && el.parentElement;
  if (!el || !screen) return;

  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const width = screen.clientWidth || rect.width;
  const height = screen.clientHeight || rect.height;
  const left = Math.max(0, Math.round((width - rect.width) / 2));
  const top = Math.max(0, Math.round((height - rect.height) / 2));

  if (centered && centered.left === left && centered.top === top) return;

  centered = { left, top };
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
};

if (!(window as any).__gailanWelcomeCentering) {
  (window as any).__gailanWelcomeCentering = true;
  window.addEventListener("resize", () => {
    centered = null;
    requestAnimationFrame(placeInMiddle);
  });
}

/* macOS grays a window's traffic lights until you click it. Tracked here rather
   than in render, the way pos is, because the widget re-renders on every command
   and this has to survive that. */
let active = false;

const markActive = (next: boolean) => {
  active = next;
  const el = document.getElementById(WIDGET_ID);
  if (el) el.setAttribute("data-active", next ? "true" : "false");
};

/* Once per page, not once per render. A mousedown anywhere else in the page,
   another widget included, puts this one back to sleep. Clicks on the desktop
   itself never reach here: the window ignores the mouse unless the pointer is
   over a widget. */
if (!(window as any).__gailanWelcomeWatching) {
  (window as any).__gailanWelcomeWatching = true;
  document.addEventListener(
    "mousedown",
    (e) => {
      const el = document.getElementById(WIDGET_ID);
      if (!el) return;
      markActive(el.contains(e.target as Node));
    },
    true
  );

  /* Clicks on the desktop or in another app never reach the page, so the app
     reports them. */
  window.addEventListener("gailan:blur", () => markActive(false));
}

const startDrag = (e: any) => {
  if (e.button !== 0) return;
  const el = document.getElementById(WIDGET_ID);
  if (!el) return;
  e.preventDefault();

  const rect = el.getBoundingClientRect();
  const dx = e.clientX - rect.left;
  const dy = e.clientY - rect.top;

  /* The widgets to keep clear of do not move while this one is being dragged, so
     they are measured once here rather than on every pointer move. */
  const onMove = (ev: MouseEvent) => {
    const { left, top } = constrainDrag(el, {
      left: ev.clientX - dx,
      top: ev.clientY - dy,
    });

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    pos = { left, top };
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch (e) {
      /* position still holds for this session */
    }
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
};

/* a macOS-ish window: a tint over glass, hairline border, soft shadow. The
   palette rides on CSS custom properties and follows the system appearance.
   The fill is deliberately thin, because what shows through it is the material
   macOS draws behind the window. */
const Window = styled("div")`
  /* thin enough to read the frosted wallpaper through, dark enough to read
     text on top of it */
  /* The fill is a setting, so only its transparency is set from outside. Setting the
     whole colour there, which is what this used to do, meant the dark surface was
     written over the light one and the window stayed dark in a light appearance. */
  --panel: rgba(11, 11, 12, var(--fill, 0.82));
  --header-bg: rgba(244, 244, 242, 0.05);
  --border: rgba(244, 244, 242, 0.14);
  --text: #f4f4f2;
  --dim: rgba(244, 244, 242, 0.45);
  --accent: #5aa7f5;
  --light-off: rgba(244, 244, 242, 0.22);

  @media (prefers-color-scheme: light) {
    --panel: rgba(241, 241, 239, var(--fill, 0.9));
    --header-bg: rgba(11, 11, 12, 0.04);
    --border: rgba(11, 11, 12, 0.16);
    --text: #0b0b0c;
    --dim: rgba(11, 11, 12, 0.5);
    --light-off: rgba(11, 11, 12, 0.18);
  }


  /* Told to hold a style, the window holds it whatever the system is set to. The same
     names every widget offers, so a desktop can be one thing throughout. Pink is the
     light window with a modern pink in it. */
  &[data-background="dark"] {
    --panel: rgba(11, 11, 12, var(--fill, 0.82));
    --header-bg: rgba(244, 244, 242, 0.05);
    --border: rgba(244, 244, 242, 0.14);
    --text: #f4f4f2;
    --dim: rgba(244, 244, 242, 0.45);
    --light-off: rgba(244, 244, 242, 0.22);
  }

  &[data-background="light"] {
    --panel: rgba(241, 241, 239, var(--fill, 0.9));
    --header-bg: rgba(11, 11, 12, 0.04);
    --border: rgba(11, 11, 12, 0.16);
    --text: #0b0b0c;
    --dim: rgba(11, 11, 12, 0.5);
    --light-off: rgba(11, 11, 12, 0.18);
  }

  &[data-background="pink"] {
    --panel: rgba(255, 226, 238, var(--fill, 0.9));
    --header-bg: rgba(31, 16, 19, 0.04);
    --border: rgba(31, 16, 19, 0.16);
    --text: #1f1013;
    --dim: rgba(31, 16, 19, 0.5);
    --light-off: rgba(31, 16, 19, 0.18);
  }

  pointer-events: auto;
  position: absolute;
  /* the radius modern macOS windows use */
  border-radius: 13px;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--border);
  /* one hairline, no glow: the border does the work a shadow would */
  box-shadow: inset 0 1px 0 rgba(244, 244, 242, 0.08);

  /* Asleep, like any window you have not clicked: gray lights, a dimmer title
     and a shallower shadow. Hovering the lights brings their color back, which
     is what the real ones do too. */
  &[data-active="false"] [data-lights]:not(:hover) > * {
    --light: var(--light-off);
  }

  &[data-active="false"] [data-title] {
    opacity: 0.55;
  }

  &[data-active="false"] {
    box-shadow: none;
  }
  font-family: "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.55;
`;

const Header = styled("div")`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
`;

/* 12pt lights on a 20pt pitch, like the real ones */
const Lights = styled("div")`
  display: flex;
  gap: 9px;
  padding-right: 2px;
`;

/* decorative only: they reveal their glyphs on hover and dip like the real
   ones when pressed, but close/minimize/zoom make no sense for a widget.
   The glyphs are svg geometry, not text, so they center exactly. */
const Light = styled("div")`
  --light: ${(p: { c: string }) => p.c};
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: default;
  background: var(--light);
  transition: background 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter 0.1s ease, transform 0.1s ease;

  svg {
    display: block;
    opacity: 0;
  }

  &:hover svg {
    opacity: 1;
  }

  &:active {
    filter: brightness(0.8);
    transform: scale(0.92);
  }
`;

const GLYPH = "rgba(0, 0, 0, 0.55)";

const CloseGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path
      d="M3.7 3.7 L8.3 8.3 M8.3 3.7 L3.7 8.3"
      stroke={GLYPH} strokeWidth="1.3" strokeLinecap="round" fill="none"
    />
  </svg>
);

const MinimizeGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path
      d="M3.1 6 L8.9 6"
      stroke={GLYPH} strokeWidth="1.3" strokeLinecap="round" fill="none"
    />
  </svg>
);

/* two filled triangles pointing to opposite corners, like the real zoom
   button: one at the top left, one at the bottom right */
const ZoomGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12">
    <path d="M3.2 3.2 h3.9 L3.2 7.1 Z" fill={GLYPH} />
    <path d="M8.8 8.8 h-3.9 L8.8 4.9 Z" fill={GLYPH} />
  </svg>
);

const Title = styled("span")`
  margin-left: 4px;
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;

  b {
    color: var(--accent);
    font-weight: 500;
  }
`;

/* The mark, then the name set in live text rather than baked into a picture, so
   it takes the widget's own color and needs no font loaded. The dark variant of
   the mark is swapped in by the <picture> below. */
const Brand = styled("div")`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 22px 18px 18px;
  border-bottom: 1px solid var(--border);
`;

const Mark = styled("img")`
  display: block;
  width: 62px;
  height: 62px;
`;

// The same typeface the website sets its wordmark in, copied into this folder by
// the app rather than fetched, so the desktop does not wait on the network to draw
// a name. Only the letters of the name are in the file.
const WordmarkFont = () => (
  <style>{`
    @font-face {
      font-family: "Gailan Wordmark";
      src: url("/wordmark.ttf") format("truetype");
      font-display: block;
    }
  `}</style>
);

const Wordmark = styled("div")`
  font-family: "Gailan Wordmark", "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 25px;
  line-height: 1;
  letter-spacing: 0.34em;
  /* the tracking pushes the block right, so the last letter's space is removed */
  text-indent: 0.34em;
  text-transform: uppercase;
  color: var(--text);
`;

const Pronunciation = styled("div")`
  font-size: 9px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--dim);
`;

const Body = styled("div")`
  padding: 4px 18px 16px;

  h1 {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    margin-bottom: 12px;
  }

  p {
    margin-bottom: 10px;
    line-height: 1.65;
  }

  p:last-child {
    margin-bottom: 0;
  }

  em {
    font-style: normal;
    color: var(--accent);
  }
`;

const Footer = styled("div")`
  padding: 9px 18px;
  border-top: 1px solid var(--border);
  color: var(--dim);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
`;

export const render = ({ output, error, settings = {} }: State) => {
  const width = WIDTHS[settings.size ?? "medium"] ?? WIDTHS.medium;
  const surface = BACKGROUNDS.indexOf(settings.background ?? "") > 0
    ? settings.background
    : undefined;
  const fill = (settings.opacity ?? 42) / 100;
  const firstName = error ? "there" : output.trim().split(/\s+/)[0] || "there";
  const placed = pos || centered;
  /* Half the width is known, so across is exact from the start. Down waits for the
     measurement, and starts near enough that there is nothing to see. */
  const position = placed
    ? { left: `${placed.left}px`, top: `${placed.top}px` }
    : { left: `calc(50% - ${Math.round(width / 2)}px)`, top: "calc(50% - 220px)" };

  if (!pos) requestAnimationFrame(placeInMiddle);

  return (
    // The page cannot reach what is behind its window, so the frosted
    // wallpaper under this one is drawn by macOS: the marker claims the
    // rectangle, System glass in Preferences picks the material.
    <Window
      id={WIDGET_ID}
      data-background={surface}
      data-gailan-desktop-glass={13}
      data-active={active ? "true" : "false"}
      style={
        {
          width,
          // how solid the surface is, whichever colour the appearance calls for
          ["--fill" as string]: String(fill),
          ...position,
        } as Record<string, unknown>
      }
    >
      <Header onMouseDown={startDrag}>
        <Lights data-lights>
          <Light c="#ff5f57">
            <CloseGlyph />
          </Light>
          <Light c="#febc2e">
            <MinimizeGlyph />
          </Light>
          <Light c="#28c840">
            <ZoomGlyph />
          </Light>
        </Lights>
        <Title data-title>
          <b>gailan</b>.welcome
        </Title>
      </Header>

      <Brand>
        <WordmarkFont />
        <picture>
          <source srcSet="/mark-dark.png" media="(prefers-color-scheme: dark)" />
          <Mark src="/mark.png" alt="" />
        </picture>
        <Wordmark>Gailan</Wordmark>
        <Pronunciation>概览 · gàilǎn</Pronunciation>
      </Brand>

      <Body>
        <h1>Hi, {firstName}</h1>
        <p>
          Thanks for trying out Gailan! This is an example widget to get you
          started.
        </p>
        <p>
          To view this example widget, choose <em>'Open Widgets Folder'</em>{" "}
          from the status bar menu. Use it to create your own widget, or
          simply delete it.
        </p>
        <p>
          To download other widgets, choose <em>'Open Widgets Hub'</em>{" "}
          from the status bar menu.
        </p>
      </Body>

      {settings.showCredits === false ? null : (
        <Footer>
          Gailan is a fork of Übersicht by Felix Hageloh.
          tracesof.net/uebersicht
        </Footer>
      )}
    </Window>
  );
};
