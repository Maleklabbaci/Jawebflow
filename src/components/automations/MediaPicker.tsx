/**
 * Sélecteur de publication : le marchand voit ses vrais posts / reels
 * (miniatures) et clique sur celui qu'il veut automatiser.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Film, Image as ImageIcon, Loader2, MessageCircle, RefreshCw, X } from 'lucide-react';
import { ApiError, igApi, type MediaItem } from '../../lib/ig-automations-api';
import { Notice, ghostBtn, secondaryBtn } from './ui';

export interface PickedMedia {
  id: string;
  permalink: string;
  thumbnail: string;
  caption: string;
  type: string;
}

export function MediaPicker({ onPick, onClose }: { onPick: (m: PickedMedia) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string>('');

  const load = useCallback(async (after?: string) => {
    if (after) setMore(true); else setLoading(true);
    setError('');
    try {
      const res = await igApi.media(after);
      setItems((prev) => (after ? [...prev, ...res.media] : res.media));
      setNext(res.next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger tes publications.');
    } finally {
      setLoading(false);
      setMore(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Choisir une publication">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Choisis la publication</h2>
            <p className="text-xs text-slate-500">Le robot ne répondra qu’aux commentaires écrits sous celle-ci.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement de tes publications…
            </div>
          ) : error ? (
            <div className="space-y-3">
              <Notice kind="error">{error}</Notice>
              <button type="button" onClick={() => load()} className={secondaryBtn}><RefreshCw className="h-4 w-4" /> Réessayer</button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">Aucune publication trouvée sur ce compte. Publie un post ou un reel, puis reviens ici.</p>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Tes publications">
                {items.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => onPick({ id: m.id, permalink: m.permalink, thumbnail: m.thumbnail, caption: m.caption, type: m.type })}
                      className="group block w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-purple-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                      aria-label={`Choisir la publication : ${m.caption || 'sans légende'}`}
                    >
                      <div className="relative aspect-square w-full bg-slate-100">
                        {m.thumbnail ? (
                          <img src={m.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400"><ImageIcon className="h-8 w-8" /></div>
                        )}
                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-slate-900/75 px-2 py-0.5 text-[10px] font-medium text-white">
                          {m.type === 'REEL' || m.type === 'VIDEO' ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                          {m.type === 'REEL' ? 'Reel' : m.type === 'VIDEO' ? 'Vidéo' : m.type === 'CAROUSEL_ALBUM' ? 'Carrousel' : 'Photo'}
                        </span>
                      </div>
                      <div className="space-y-1 p-2.5">
                        <p className="line-clamp-2 min-h-[2rem] text-xs text-slate-700">{m.caption || <span className="italic text-slate-400">Sans légende</span>}</p>
                        <p className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>{m.timestamp ? new Date(m.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{m.comments}</span>
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {next && (
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => load(next)} disabled={more} className={ghostBtn}>
                    {more ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Voir plus de publications
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
