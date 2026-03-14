import pc from "picocolors";

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

function trueColor(r: number, g: number, b: number) {
  const code = `${ESC}38;2;${r};${g};${b}m`;
  return (text: string) => `${code}${text}${RESET}`;
}

// Brand colors — exact match to skillbase.space
const brandPrimary = trueColor(0, 229, 160);   // #00e5a0
const brandInfo = trueColor(34, 211, 238);      // #22d3ee
const brandError = trueColor(239, 68, 68);      // #ef4444
const brandWarning = trueColor(251, 191, 36);   // #fbbf24

export const theme = {
  primary: (text: string) => brandPrimary(text),
  error: (text: string) => brandError(text),
  warning: (text: string) => brandWarning(text),
  info: (text: string) => brandInfo(text),
  muted: (text: string) => pc.dim(text),
  bold: (text: string) => pc.bold(text),

  symbols: {
    success: brandPrimary("\u2713"),
    error: brandError("\u2717"),
    warning: brandWarning("\u26A0"),
    info: brandInfo("\u2139"),
    arrow: brandPrimary("\u203A"),
    bullet: pc.dim("\u2022"),
  },
} as const;
