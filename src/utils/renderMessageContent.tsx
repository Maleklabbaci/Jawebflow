import React from 'react';
import { LinkPreviewCard } from '../components/LinkPreviewCard';

export function renderMessageContent(text: string, themeMode: 'dark' | 'light' = 'dark') {
  if (!text) return null;

  // Clean any markdown bold/italic asterisks
  const cleanedText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1');

  // Regex to detect URLs
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.(?:com|dz|fr|net|org|io|co|gov|edu)(?:\/[^\s]*)?)/gi;
  
  const matches = cleanedText.match(urlRegex);
  const uniqueUrls = matches ? Array.from(new Set(matches)) : [];

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap leading-relaxed">{cleanedText}</p>
      {uniqueUrls.map((url, idx) => (
        <LinkPreviewCard key={idx} url={url} themeMode={themeMode} />
      ))}
    </div>
  );
}
