import { theme } from "./theme.js";

function write(symbol: string, msg: string): void {
  console.log(`  ${symbol}  ${msg}`);
}

export const log = {
  success: (msg: string) => write(theme.symbols.success, msg),
  error: (msg: string) => write(theme.symbols.error, theme.error(msg)),
  warning: (msg: string) => write(theme.symbols.warning, msg),
  info: (msg: string) => write(theme.symbols.info, msg),
  step: (msg: string) => write(theme.symbols.arrow, msg),
  message: (msg: string) => console.log(`     ${msg}`),
};
