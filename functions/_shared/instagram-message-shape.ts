/**
 * Diagnostic structurel des DM Instagram. Ne conserve jamais le texte client,
 * les IDs, les URL complètes ou les jetons — seulement les types et noms de clés.
 */
function keysOf(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort().slice(0, 30);
}

function valueTypes(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 30)
      .map(([key, item]) => [key, item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item]),
  );
}

function hostOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.hostname.slice(0, 160) : undefined;
  } catch {
    return undefined;
  }
}

export function summarizeInstagramMessageShape(message: unknown) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return { messageKeys: [], attachments: [] };
  const record = message as Record<string, any>;
  const attachments = Array.isArray(record.attachments) ? record.attachments.slice(0, 5) : [];
  return {
    messageKeys: keysOf(record),
    messageValueTypes: valueTypes(record),
    attachments: attachments.map((attachment: any) => {
      const payload = attachment?.payload;
      const nested = payload?.media || payload?.attachment || payload?.share;
      return {
        type: typeof attachment?.type === 'string' ? attachment.type.slice(0, 40) : typeof attachment?.type,
        attachmentKeys: keysOf(attachment),
        payloadKeys: keysOf(payload),
        payloadValueTypes: valueTypes(payload),
        nestedPayloadKeys: keysOf(nested),
        mediaType: typeof payload?.media_type === 'string' ? payload.media_type.slice(0, 40) : undefined,
        urlHost: hostOf(payload?.url) || hostOf(payload?.uri),
      };
    }),
    shareKeys: keysOf(record.share),
  };
}
