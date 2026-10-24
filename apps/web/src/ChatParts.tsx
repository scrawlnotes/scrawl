import { type ChatFile, type ChatInfo, type ChatMessage, plainText } from '@scrawlnotes/core';
import { t } from '@scrawlnotes/i18n';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { clock, kindText, MAX_RECORDING_S, Recording, sizeText } from './chatMedia';
import { type ChatServer, store } from './chatStore';
import { Dialog } from './dialogs';
import { Icon } from './Icon';
import { isDesktop, saveFile } from './storage';

// A message's files as its conversation shows them (design/chat.md, 4; design/mockups.html,
// Messaging): photos in a grid that opens large, a video that plays where it is, a recording with
// its player, any other file as a row to open or save. And what writing one takes: the files on
// their way over the box, a voice message being recorded, a message forwarded.

/** A file of a message as an address the page shows, once it is read; null until then. */
export function useFileUrl(url: string, hash: string | undefined, type = ''): string | null {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!hash) return;
    let live = true;
    void store
      .server(url)
      ?.fileUrl(hash, type)
      .then((address) => live && setShown(address))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url, hash]);
  return shown;
}

export const isImage = (file: { type: string }) => file.type.startsWith('image/');
export const isVideo = (file: { type: string }) => file.type.startsWith('video/');
export const isAudio = (file: { type: string }) => file.type.startsWith('audio/');

/** A message's files, each kind as it shows: photos first, in a grid of four at most. */
export function Attachments({ url, files }: { url: string; files: ChatFile[] }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const images = files.filter(isImage);
  const grid = images.slice(0, 4);
  return (
    <div className="ch-files">
      {images.length > 0 && (
        <div className={`ch-imgs n${grid.length}`}>
          {grid.map((file, i) => (
            <ImageThumb key={`${file.hash}${i}`} url={url} file={file} one={images.length === 1} more={i === 3 ? images.length - 4 : 0} onOpen={() => setViewing(i)} />
          ))}
        </div>
      )}
      {files.filter(isVideo).map((file, i) => (
        <VideoBox key={`${file.hash}${i}`} url={url} file={file} />
      ))}
      {files.filter(isAudio).map((file, i) => (
        <AudioPlayer key={`${file.hash}${i}`} url={url} file={file} />
      ))}
      {files
        .filter((file) => !isImage(file) && !isVideo(file) && !isAudio(file))
        .map((file, i) => (
          <FileRow key={`${file.hash}${i}`} url={url} file={file} />
        ))}
      {viewing !== null && <Lightbox url={url} images={images} at={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ImageThumb({ url, file, one, more, onOpen }: { url: string; file: ChatFile; one: boolean; more: number; onOpen: () => void }) {
  const shown = useFileUrl(url, file.thumb ?? file.hash, file.thumb ? 'image/webp' : file.type);
  // One photo keeps its shape, at most 360 by 260; in a grid each is a square.
  const ratio = file.width && file.height ? file.width / file.height : 4 / 3;
  const style = one ? { width: Math.round(Math.min(360, 260 * ratio)), height: 'auto', aspectRatio: String(ratio) } : undefined;
  return (
    <button type="button" className="ch-img" style={style} title={file.name} aria-label={file.name || t('chat.photo')} onClick={onOpen}>
      {shown ? <img src={shown} alt="" draggable={false} /> : <span className="ch-wait" />}
      {more > 0 && <span className="more">+{more}</span>}
    </button>
  );
}

/**
 * A photo large, over everything; the arrows go through the message's photos, or a conversation's
 * in its Info window, where Show in chat goes to the message it came in.
 */
export function Lightbox({ url, images, at, onClose, onShow }: { url: string; images: ChatFile[]; at: number; onClose: () => void; onShow?: (index: number) => void }) {
  const [index, setIndex] = useState(at);
  const file = images[index]!;
  const shown = useFileUrl(url, file.hash, file.type);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus(), []);
  const step = (by: number) => setIndex((index + by + images.length) % images.length);
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowRight' && images.length > 1) step(1);
    else if (event.key === 'ArrowLeft' && images.length > 1) step(-1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div className="ch-view" ref={box} tabIndex={-1} role="dialog" aria-label={file.name || t('chat.photo')} onKeyDown={onKey} onContextMenu={(event) => event.stopPropagation()} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="bar">
        <span className="nm">{file.name}</span>
        {images.length > 1 && <span className="ct">{t('chat.photoOf', { at: index + 1, count: images.length })}</span>}
        {onShow && (
          <button type="button" onClick={() => onShow(index)}>
            <Icon name="chat" />
            {t('chat.showInChat')}
          </button>
        )}
        <button type="button" onClick={() => void save(url, file)}>
          <Icon name="download" />
          {t('chat.download')}
        </button>
        <button type="button" className="x" aria-label={t('dialog.close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {shown ? <img src={shown} alt={file.name} onMouseDown={(event) => event.stopPropagation()} /> : <span className="ch-wait big" />}
      {images.length > 1 && (
        <>
          <button type="button" className="go prev" aria-label={t('chat.previous')} onClick={() => step(-1)}>
            <Icon name="back" />
          </button>
          <button type="button" className="go next" aria-label={t('chat.next')} onClick={() => step(1)}>
            <Icon name="chevron" />
          </button>
        </>
      )}
    </div>
  );
}

/** A video with its first picture; it is read from the server when it is played. */
function VideoBox({ url, file }: { url: string; file: ChatFile }) {
  const poster = useFileUrl(url, file.thumb, 'image/webp');
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ratio = file.width && file.height ? file.width / file.height : 16 / 9;
  const style = { width: Math.round(Math.min(400, 260 * ratio)), aspectRatio: String(ratio) };
  if (source) return <video className="ch-video" style={style} src={source} controls autoPlay />;
  const play = () => {
    setLoading(true);
    void store
      .server(url)
      ?.fileUrl(file.hash, file.type)
      .then(setSource, () => undefined)
      .finally(() => setLoading(false));
  };
  return (
    <button type="button" className="ch-video" style={style} aria-label={file.name || t('chat.video')} onClick={play}>
      {poster && <img src={poster} alt="" draggable={false} />}
      <span className="play">{loading ? <span className="ch-wait" /> : <Icon name="playFill" />}</span>
      {file.duration !== undefined && <small>{clock(file.duration)}</small>}
    </button>
  );
}

/** The bars of a recording's player: the same for a recording every time, from its digest. */
function barsOf(hash: string, count: number): number[] {
  let seed = parseInt(hash.slice(0, 8), 16) || 1;
  return Array.from({ length: count }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return 5 + (seed % 14);
  });
}

const SPEEDS = [1, 1.5, 2];

/** A recording's player: play, the bars as far as it played, its time, and how fast. */
export function AudioPlayer({ url, file }: { url: string; file: ChatFile }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [length, setLength] = useState(file.duration ?? 0);
  const bars = barsOf(file.hash, 30);
  useEffect(() => () => audio.current?.pause(), []);
  const ready = async (): Promise<HTMLAudioElement | null> => {
    if (audio.current) return audio.current;
    const address = await store
      .server(url)
      ?.fileUrl(file.hash, file.type)
      .catch(() => undefined);
    if (!address) return null;
    const made = new Audio(address);
    made.playbackRate = speed;
    made.ontimeupdate = () => setAt(made.currentTime);
    made.onloadedmetadata = () => Number.isFinite(made.duration) && setLength(made.duration);
    // What the button shows is what the player does, a play the browser refused too.
    made.onplay = () => setPlaying(true);
    made.onpause = () => setPlaying(false);
    made.onended = () => setAt(0);
    audio.current = made;
    return made;
  };
  const toggle = async () => {
    const player = await ready();
    if (!player) return;
    if (player.paused) await player.play().catch(() => undefined);
    else player.pause();
  };
  const seek = async (fraction: number) => {
    const player = await ready();
    if (!player || !length) return;
    player.currentTime = Math.max(0, Math.min(1, fraction)) * length;
    setAt(player.currentTime);
  };
  const played = length ? at / length : 0;
  return (
    <div className="ch-voice">
      <button type="button" className={`pl${playing ? ' on' : ''}`} aria-label={playing ? t('chat.pause') : t('chat.play')} onClick={() => void toggle()}>
        <Icon name={playing ? 'pauseFill' : 'playFill'} />
      </button>
      <span
        className="wv"
        role="slider"
        tabIndex={0}
        aria-label={t('chat.voice')}
        aria-valuemin={0}
        aria-valuemax={Math.round(length)}
        aria-valuenow={Math.round(at)}
        onPointerDown={(event) => {
          // The progress follows the pointer while it is held on the bars.
          const bar = event.currentTarget;
          const box = bar.getBoundingClientRect();
          const to = (x: number) => void seek((x - box.left) / box.width);
          to(event.clientX);
          bar.setPointerCapture(event.pointerId);
          const move = (moved: PointerEvent) => to(moved.clientX);
          const up = () => {
            bar.removeEventListener('pointermove', move);
            bar.removeEventListener('pointerup', up);
          };
          bar.addEventListener('pointermove', move);
          bar.addEventListener('pointerup', up);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          if (length) void seek((at + (event.key === 'ArrowRight' ? 5 : -5)) / length);
        }}
      >
        {bars.map((height, i) => (
          <i key={i} className={i / bars.length < played ? 'p' : ''} style={{ height }} />
        ))}
      </span>
      <span className="du">{clock(playing || at ? at : length)}</span>
      <button
        type="button"
        className="spd"
        title={t('chat.speed')}
        onClick={() => {
          const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
          setSpeed(next);
          if (audio.current) audio.current.playbackRate = next;
        }}
      >
        {speed}x
      </button>
    </div>
  );
}

/** Saves a file of a message where the person says. */
async function save(url: string, file: ChatFile) {
  const blob = await store
    .server(url)
    ?.fileBlob(file.hash, file.type)
    .catch(() => undefined);
  if (!blob) return;
  const extension = /\.([a-z0-9]{1,8})$/i.exec(file.name)?.[1] ?? file.type.split('/')[1]?.split(/[;+]/)[0] ?? 'bin';
  await saveFile(file.name || `file.${extension}`, blob, extension);
}

/** Any other file: its name, size and kind. Open shows it where the browser shows it, else saves it. */
export function FileRow({ url, file }: { url: string; file: ChatFile }) {
  const viewable = !isDesktop && (file.type === 'application/pdf' || file.type.startsWith('text/'));
  const open = async () => {
    if (!viewable) return void save(url, file);
    const address = await store
      .server(url)
      ?.fileUrl(file.hash, file.type)
      .catch(() => undefined);
    if (address) window.open(address, '_blank', 'noopener');
  };
  return (
    <div className="ch-file">
      <button type="button" className="fo" title={file.name} onClick={() => void open()}>
        <span className="fi">
          <Icon name="file" />
        </span>
        <span className="tx">
          <b>{file.name || t('chat.file')}</b>
          <small>{[sizeText(file.size), kindText(file.name, file.type)].filter(Boolean).join(' · ')}</small>
        </span>
      </button>
      <button type="button" className="dl" title={t('chat.download')} aria-label={t('chat.download')} onClick={() => void save(url, file)}>
        <Icon name="download" />
      </button>
    </div>
  );
}

// ---------- writing ----------

/** A file on its way into a message: how far it went, then what it is on the server; or why it did not go. */
export interface Going {
  key: string;
  name: string;
  type: string;
  size: number;
  sent: number;
  /** A picture of it, from this device, for the tray. */
  preview: string | null;
  file?: ChatFile;
  failed?: string;
  stop: AbortController;
}

/** The files on their way, over the box to write in: each with its picture or icon, how far it went, and ×. */
export function Tray({ going, onRemove }: { going: Going[]; onRemove: (key: string) => void }) {
  if (!going.length) return null;
  return (
    <div className="ch-tray">
      {going.map((each) => {
        const part = Math.round((each.sent / Math.max(1, each.size)) * 100);
        return (
          <div key={each.key} className={`ch-going-file${each.failed ? ' failed' : ''}${each.preview ? ' pic' : ''}`} title={each.failed ?? each.name}>
            {each.preview ? (
              <img src={each.preview} alt="" />
            ) : (
              <span className="fi">
                <Icon name={isAudio(each) ? 'audio' : isVideo(each) ? 'playFill' : 'file'} />
              </span>
            )}
            {!each.preview && (
              <span className="tx">
                <b>{each.name}</b>
                <small>{each.failed ?? (each.file ? sizeText(each.size) : `${part}%`)}</small>
              </span>
            )}
            {!each.file && !each.failed && (
              <span className="prog">
                <span style={{ width: `${part}%` }} />
              </span>
            )}
            {isVideo(each) && each.preview && (
              <span className="vd">
                <Icon name="playFill" />
              </span>
            )}
            {each.failed && each.preview && (
              <span className="no">
                <Icon name="warn" />
              </span>
            )}
            <button type="button" className="x" aria-label={t('chat.removeFile')} title={t('chat.removeFile')} onClick={() => onRemove(each.key)}>
              <Icon name="close" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A voice message being recorded, in the place of the box: the red dot, its time, how loud it is,
 * Cancel and Send. At fifteen minutes it stops and waits for Send.
 */
export function RecorderBar({ onSend, onCancel }: { onSend: (blob: Blob, seconds: number) => Promise<void>; onCancel: () => void }) {
  const [recording, setRecording] = useState<Recording | null>(null);
  const [failed, setFailed] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const stopped = useRef<Promise<Blob> | null>(null);
  const length = useRef(0);
  // Send has the keyboard once it records: Enter sends, Esc cancels.
  const sendButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (recording) sendButton.current?.focus();
  }, [recording]);
  useEffect(() => {
    let made: Recording | null = null;
    let live = true;
    void Recording.start().then((started) => {
      if (!live) return void started?.stop();
      if (!started) return setFailed(true);
      made = started;
      setRecording(started);
    });
    return () => {
      live = false;
      if (made && !stopped.current) void made.stop();
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      if (stopped.current) return;
      const now = recording.seconds();
      length.current = Math.min(now, MAX_RECORDING_S);
      setSeconds(length.current);
      setLevels((was) => [...was.slice(-59), recording.level()]);
      if (now >= MAX_RECORDING_S) stopped.current = recording.stop();
    }, 100);
    return () => window.clearInterval(timer);
  }, [recording]);
  const send = async () => {
    if (!recording || sending) return;
    setSending(true);
    if (!stopped.current) length.current = Math.min(recording.seconds(), MAX_RECORDING_S);
    stopped.current ??= recording.stop();
    try {
      await onSend(await stopped.current, length.current);
    } catch {
      setSending(false);
    }
  };
  const cancel = () => {
    if (recording) stopped.current ??= recording.stop();
    onCancel();
  };
  // Enter is the focused button's own: Send, or Cancel.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };
  if (failed) {
    return (
      <div className="ch-rec" onKeyDown={onKeyDown}>
        <Icon name="warn" />
        <span className="ch-rec-no">{t('format.noMicrophone')}</span>
        <button type="button" className="st-btn" autoFocus onClick={onCancel}>
          {t('dialog.cancel')}
        </button>
      </div>
    );
  }
  return (
    <div className="ch-rec" onKeyDown={onKeyDown}>
      <span className={`rd${stopped.current ? ' still' : ''}`} />
      <span className="tm">{clock(seconds)}</span>
      <span className="wv">
        {levels.map((level, i) => (
          <i key={i} style={{ height: 3 + Math.round(level * 21) }} />
        ))}
      </span>
      {sending && <span className="ch-rec-no">{t('chat.sending')}</span>}
      <button type="button" className="st-btn" onClick={cancel}>
        {t('dialog.cancel')}
      </button>
      <button type="button" ref={sendButton} className="send go" title={t('chat.send')} aria-label={t('chat.send')} disabled={!recording || sending} onClick={() => void send()}>
        <Icon name="send" />
      </button>
    </div>
  );
}

/**
 * Forward…: the message over it, the server's conversations under it, the latest first, five
 * picked at most, and words to go with it (design/chat.md, 3.4).
 */
export function ForwardDialog({ server, message, face, from, titleOf, leadOf, onClose, onDone }: {
  server: ChatServer;
  message: ChatMessage;
  /** The face of whoever wrote it. */
  face: ReactNode;
  /** Who wrote it, where and when: Elif Demir · #dev · 11:40. */
  from: ReactNode;
  titleOf: (chat: ChatInfo) => string;
  leadOf: (chat: ChatInfo) => ReactNode;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [going, setGoing] = useState(false);
  const [failed, setFailed] = useState(false);
  // Where it can go: what is open to write in, not archived, not a direct message with only those gone.
  const chats = server.chats
    .filter((chat) => (chat.kind === 'direct' || chat.joined) && chat.archived === null)
    .filter((chat) => chat.kind !== 'direct' || chat.members.some((person) => person.id !== server.me && !chat.gone.includes(person.id)))
    .sort((a, b) => (b.last?.at ?? b.createdAt) - (a.last?.at ?? a.createdAt));
  const words = find.trim().toLowerCase();
  const shown = chats.filter((chat) => !words || titleOf(chat).toLowerCase().includes(words) || (chat.kind !== 'direct' && chat.spaceName.toLowerCase().includes(words)));
  const forward = async () => {
    if (!picked.length || going) return;
    setGoing(true);
    setFailed(false);
    try {
      await store.server(server.url)?.forward(message.id, picked, note);
      onDone(picked.length);
    } catch {
      setFailed(true);
      setGoing(false);
    }
  };
  const text = plainText(message.body);
  const kinds = [...new Set(message.files.map((file) => (isImage(file) ? t('chat.photo') : isVideo(file) ? t('chat.video') : isAudio(file) ? t('chat.voice') : t('chat.file'))))];
  return (
    <Dialog label={t('chat.forwardTitle')} className="ch-fwd" onClose={onClose}>
      <h2>{t('chat.forwardTitle')}</h2>
      <div className="ch-fq">
        {face}
        <span className="by">{from}</span>
        {text && <p>{text}</p>}
        {kinds.length > 0 && <small>{kinds.join(', ')}</small>}
      </div>
      <label className="ch-ff">
        <Icon name="search" />
        <input autoFocus placeholder={t('chat.findChat')} value={find} onChange={(event) => setFind(event.target.value)} />
      </label>
      <p className="choices-label">{words ? t('chat.found') : t('chat.recent')}</p>
      <div className="ch-picks" role="listbox" aria-multiselectable="true">
        {shown.map((chat) => {
          const on = picked.includes(chat.id);
          return (
            <button
              type="button"
              role="option"
              aria-selected={on}
              key={chat.id}
              className={`ch-pick-row${on ? ' on' : ''}`}
              disabled={!on && picked.length >= 5}
              onClick={() => setPicked(on ? picked.filter((id) => id !== chat.id) : [...picked, chat.id])}
            >
              <span className="bx">{on && <Icon name="check" />}</span>
              {leadOf(chat)}
              <span className="nm">{titleOf(chat)}</span>
              <small>{chat.kind === 'direct' ? t('chat.direct') : chat.spaceName}</small>
            </button>
          );
        })}
        {shown.length === 0 && <p className="ch-none">{t('chat.noneFound')}</p>}
      </div>
      <p className="choices-label">{t('chat.addMessage')}</p>
      <input value={note} aria-label={t('chat.addMessage')} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), void forward())} />
      {failed && <p className="ch-fail-note">{t('chat.forwardFailed')}</p>}
      <div className="dialog-actions">
        <span className="count">{picked.length ? t('chat.picked', { count: picked.length }) : ''}</span>
        <button type="button" onClick={onClose}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="primary" disabled={!picked.length || going} onClick={() => void forward()}>
          {t('chat.forward')}
        </button>
      </div>
    </Dialog>
  );
}
