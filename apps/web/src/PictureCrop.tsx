import { t } from '@scrawlnotes/i18n';
import { type PointerEvent, type WheelEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isPhone } from './device';
import { Dialog } from './dialogs';
import type { PictureCut } from './pictures';

// Move and Scale, as a profile picture is chosen elsewhere: the image picked under a round window,
// moved by dragging and made larger by two fingers, the wheel or the slider; the window is never
// left empty. On a phone it fills the screen, Cancel and Choose at its foot; on a computer it is a
// window, Cancel and Save at its foot. What is in the round becomes the picture.

/** How much larger than filling the round an image is made at most. */
const MAX_ZOOM = 4;
/** The room around the round, on each side. */
const MARGIN = 16;

interface Place {
  zoom: number;
  x: number;
  y: number;
}

export function PictureCrop({ image, onCancel, onDone }: { image: Blob; onCancel: () => void; onDone: (cut: PictureCut) => void }) {
  const phone = isPhone();
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [place, setPlace] = useState<Place>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  useEffect(() => {
    const made = URL.createObjectURL(image);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [image]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => setBox({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(element);
    return () => watch.disconnect();
  }, []);

  const round = Math.max(0, Math.min(box.width, box.height) - 2 * MARGIN);
  // The scale at which the image just fills the round; the zoom is over it.
  const base = size ? round / Math.min(size.width, size.height) : 1;
  /** A place kept inside its bounds: the round always on the image. */
  const keep = (next: Place): Place => {
    if (!size) return next;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, next.zoom));
    const scale = base * zoom;
    const roomX = Math.max(0, (size.width * scale - round) / 2);
    const roomY = Math.max(0, (size.height * scale - round) / 2);
    return { zoom, x: Math.min(roomX, Math.max(-roomX, next.x)), y: Math.min(roomY, Math.max(-roomY, next.y)) };
  };
  /** Made larger or smaller about the round's middle: what is in its middle stays there. */
  const zoomTo = (zoom: number, from = place) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
    setPlace(keep({ zoom: next, x: (from.x * next) / from.zoom, y: (from.y * next) / from.zoom }));
  };

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: place.zoom };
    }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const was = pointers.current.get(event.pointerId);
    if (!was) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo((pinch.current.zoom * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinch.current.distance);
    } else if (pointers.current.size === 1) {
      setPlace((now) => keep({ ...now, x: now.x + event.clientX - was.x, y: now.y + event.clientY - was.y }));
    }
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => zoomTo(place.zoom * Math.exp(-event.deltaY * 0.002));

  /** The part of the image in the round, in the image's own pixels. */
  const done = () => {
    if (!size) return;
    const scale = base * place.zoom;
    const side = round / scale;
    onDone({ x: size.width / 2 - place.x / scale - side / 2, y: size.height / 2 - place.y / scale - side / 2, side });
  };

  const scale = base * place.zoom;
  const view = (
    <div className="pc-stage" ref={stage} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          style={size ? { width: size.width * scale, height: size.height * scale, transform: `translate(-50%, -50%) translate(${place.x}px, ${place.y}px)` } : { visibility: 'hidden' }}
        />
      )}
      <div className="pc-round" style={{ width: round, height: round }} />
    </div>
  );
  const zoom = (
    <input className="pc-zoom" type="range" min={1} max={MAX_ZOOM} step={0.01} value={place.zoom} aria-label={t('settings.zoom')} onChange={(event) => zoomTo(Number(event.target.value))} />
  );

  if (phone) {
    return createPortal(
      <div className="pc-phone" role="dialog" aria-label={t('settings.moveAndScale')}>
        <p className="pc-title">{t('settings.moveAndScale')}</p>
        {view}
        <div className="pc-bar">
          <button type="button" onClick={onCancel}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="go" disabled={!size} onClick={done}>
            {t('phone.choose')}
          </button>
        </div>
      </div>,
      document.body,
    );
  }
  return (
    <Dialog label={t('settings.moveAndScale')} className="pc-dialog" onClose={onCancel}>
      <h2>{t('settings.moveAndScale')}</h2>
      {view}
      {zoom}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!size} onClick={done}>
          {t('settings.save')}
        </button>
      </div>
    </Dialog>
  );
}
