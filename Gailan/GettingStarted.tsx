// the starter widget that ships with Gailan. edit it, copy it, delete it —
// it lives in your widgets folder, and saving any change re-renders it live.
//
// Gailan is a fork of Übersicht by Felix Hageloh. the widget API, the server
// underneath, and the whole idea are his work: https://tracesof.net/uebersicht

import { styled } from "gailan";

// runs once — your name doesn't change between refreshes. id -F prints the
// full name ("Kevin Chen"), the render keeps the first word
export const command = "id -F";
export const refreshFrequency: number | false = false;

// widget state: the command output, plus the window controls up top.
// events flow through updateState (a tiny redux), which is the documented
// way to keep state in a widget — the traffic lights are wired through it.
type State = {
  output: string;
  error?: string;
  closed: boolean;
  collapsed: boolean;
  zoomed: boolean;
};

type Event =
  | { type: "UB/COMMAND_RAN"; output: string; error?: string }
  | { type: "CLOSE" }
  | { type: "COLLAPSE" }
  | { type: "ZOOM" };

export const initialState: State = {
  output: "",
  closed: false,
  collapsed: false,
  zoomed: false,
};

export const updateState = (event: Event, previous: State): State => {
  switch (event.type) {
    case "UB/COMMAND_RAN":
      return { ...previous, output: event.output || "", error: event.error };
    case "CLOSE":
      return { ...previous, closed: true };
    case "COLLAPSE":
      return { ...previous, collapsed: !previous.collapsed };
    case "ZOOM":
      return { ...previous, zoomed: !previous.zoomed };
    default:
      return previous;
  }
};

export const className = `
  top: 10%;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
`;

/* a macOS-ish window: translucent, blurred, hairline border, soft shadow.
   the palette rides on CSS custom properties and follows the system
   appearance. */
const Window = styled("div")`
  --bg: rgba(24, 24, 31, 0.92);
  --header-bg: rgba(255, 255, 255, 0.04);
  --border: rgba(255, 255, 255, 0.1);
  --text: #e6e6ec;
  --dim: #8b8b99;
  --accent: #5aa7f5;

  @media (prefers-color-scheme: light) {
    --bg: rgba(250, 250, 252, 0.94);
    --header-bg: rgba(0, 0, 0, 0.03);
    --border: rgba(0, 0, 0, 0.1);
    --text: #1f1f28;
    --dim: #71717d;
  }

  border-radius: 12px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  font-family: "Alibaba PuHuiTi", "PingFang SC", "Helvetica Neue", sans-serif;
  font-size: 13px;
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
  user-select: none;
`;

/* 12pt lights on a 20pt pitch, like the real ones */
const Lights = styled("div")`
  display: flex;
  gap: 9px;
  padding-right: 2px;
`;

const Light = styled("div")`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  cursor: pointer;
  background: ${(p: { c: string }) => p.c};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  color: rgba(0, 0, 0, 0.55);

  span {
    opacity: 0;
  }

  &:hover span {
    opacity: 1;
  }
`;

const Title = styled("span")`
  margin-left: 4px;
  color: var(--dim);
  font-size: 11px;
  letter-spacing: 0.4px;

  b {
    color: var(--accent);
    font-weight: 600;
  }
`;

const Body = styled("div")`
  padding: 16px 18px;

  h1 {
    font-size: 19px;
    margin-bottom: 10px;
  }

  p {
    margin-bottom: 10px;
    color: var(--text);
  }

  p:last-child {
    margin-bottom: 0;
  }

  em {
    font-style: normal;
    color: var(--accent);
  }
`;

const Logo = styled("img")`
  display: block;
  width: 150px;
  margin-bottom: 12px;
`;

const Footer = styled("div")`
  padding: 8px 18px;
  border-top: 1px solid var(--border);
  color: var(--dim);
  font-size: 11px;
`;

export const render = (
  { output, error, closed, collapsed, zoomed }: State,
  dispatch: (event: Event) => void
) => {
  if (closed) return null;

  return (
    <Window style={{ width: zoomed ? 460 : 340 }}>
      <Header>
        <Lights>
          <Light c="#ff5f57" title="close (until the widget reloads)"
            onClick={() => dispatch({ type: "CLOSE" })}>
            <span>&times;</span>
          </Light>
          <Light c="#febc2e" title="collapse"
            onClick={() => dispatch({ type: "COLLAPSE" })}>
            <span>&minus;</span>
          </Light>
          <Light c="#28c840" title="zoom"
            onClick={() => dispatch({ type: "ZOOM" })}>
            <span>+</span>
          </Light>
        </Lights>
        <Title>
          <b>gailan</b>.welcome
        </Title>
      </Header>

      {!collapsed && (
        <Body>
          <Logo src="/logo.png" />
          <h1>hi, {error ? "there" : output.trim().split(/\s+/)[0] || "there"}</h1>
          <p>
            this is the starter widget. it lives in your widgets folder — grab
            it via <em>Open Widgets Folder</em> in the menu bar, edit it, save,
            and it re-renders live. delete it whenever.
          </p>
          <p>
            widgets are just tsx files: a shell command, a refresh interval,
            and a render function. the traffic lights up there go through{" "}
            <em>updateState</em>, so this file is also the crib sheet.
          </p>
          <p>
            more widgets: <em>Visit Widgets Gallery</em>, also in the menu bar.
            clicks need the interaction shortcut and accessibility access.
          </p>
        </Body>
      )}

      {!collapsed && (
        <Footer>
          gailan is a fork of Übersicht by Felix Hageloh — the widget system is
          his work. tracesof.net/uebersicht
        </Footer>
      )}
    </Window>
  );
};
