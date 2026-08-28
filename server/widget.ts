const allowedThemes = new Set(["violet", "cyan", "orange", "mono"]);
const allowedPositions = new Set(["bottom-right", "bottom-left"]);

export function makeWidgetSnippet(botId: string, widgetToken: string, bubbleTheme?: string | null, bubblePosition?: string | null) {
  const source = process.env.WIDGET_SCRIPT_URL || "/widget.js";
  const theme = bubbleTheme && allowedThemes.has(bubbleTheme) ? bubbleTheme : undefined;
  const position = bubblePosition && allowedPositions.has(bubblePosition) ? bubblePosition : undefined;
  const themeAttribute = theme ? ` data-theme="${theme}"` : "";
  const positionAttribute = position ? ` data-position="${position}"` : "";
  return `<script src="${source}" data-bot-id="${botId}" data-widget-token="${widgetToken}"${themeAttribute}${positionAttribute} async></script>`;
}
