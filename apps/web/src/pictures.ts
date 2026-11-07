import { isAgentId, MY_PICTURE, pictureFile } from '@scrawlnotes/core';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { type ChatSnapshot, store } from './chatStore';
import { serverAccount } from './servers';
import type { Session } from './session';

// People's pictures, as each sets one in Settings › Profile (design/chat.md, Profile picture). A
// face shows its person's picture where the app has one, else the person's initial. A picture is
// found, by the person's id and its version, in the person's own Profile, on a server they are on
// (their account's), or among a space's people (its file beside them), and read once.

/** The side of a picture, in pixels: a square, made from the middle of the image picked. */
const SIDE = 256;

let session: Session | null = null;

/** The session pictures are read from: the person's own, and the spaces'. */
export function pictureSession(made: Session) {
  session = made;
}

/** The part of an image that becomes a picture: a square, in the image's own pixels, as Move and Scale leaves it. */
export interface PictureCut {
  x: number;
  y: number;
  side: number;
}

/** Sets the person's picture from the part of an image they picked, or takes it away with null. */
export async function setMyPicture(image: Blob | null, cut?: PictureCut) {
  await session?.setPicture(image ? await squarePicture(image, cut) : null);
}

/** Where someone's picture is read from: what it is known by, its version with it, and how it is read. */
interface Source {
  key: string;
  read: () => Promise<Blob>;
}

/** The pictures read, by key: an address to show them at. */
const read = new Map<string, Promise<string>>();

const load = (source: Source) => {
  let url = read.get(source.key);
  if (!url) {
    url = source.read().then((blob) => URL.createObjectURL(blob));
    // One that could not be read is tried again the next time it is asked for.
    url.catch(() => read.delete(source.key));
    read.set(source.key, url);
  }
  return url;
};

/** Who has a picture, by id, as the chat and the spaces say now: made again when either changes. */
let index: { chat: ChatSnapshot; spaces: unknown; me: unknown; sources: Map<string, Source> } | null = null;

function sourcesNow(): Map<string, Source> {
  const chat = store.read();
  const snapshot = session?.getSnapshot();
  if (index && index.chat === chat && index.spaces === snapshot?.spaces && index.me === snapshot?.me) return index.sources;
  const sources = new Map<string, Source>();
  // Spaces first, servers over them, the person's own over all: what is nearer is newer.
  for (const space of snapshot?.spaces ?? []) {
    for (const person of space.people) {
      if (person.picture && !isAgentId(person.id)) sources.set(person.id, { key: `${space.id} ${person.id} ${person.picture}`, read: () => session!.readSpaceFile(space.id, pictureFile(person.id)) });
    }
  }
  for (const server of chat.servers) {
    for (const each of server.chats) {
      for (const person of each.members) {
        if (person.picture) sources.set(person.id, { key: `${server.url} ${person.id} ${person.picture}`, read: () => serverAccount(server.url).picture(person.id, person.picture) });
      }
    }
  }
  const me = snapshot?.me;
  if (me?.picture) sources.set(me.id, { key: `me ${me.picture}`, read: () => session!.readPersonalFile(MY_PICTURE) });
  index = { chat, spaces: snapshot?.spaces, me: snapshot?.me, sources };
  return sources;
}

const subscribe = (listener: () => void) => {
  const fromChat = store.subscribe(listener);
  const fromSession = session?.subscribe(listener);
  return () => {
    fromChat();
    fromSession?.();
  };
};

/** The address of someone's picture to show, once it is read; null without one, and until then. */
export function usePicture(id: string | undefined): string | null {
  const source = useSyncExternalStore(subscribe, () => (id ? (sourcesNow().get(id) ?? null) : null));
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!source) return;
    let live = true;
    load(source)
      .then((url) => live && setShown({ key: source.key, url }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [source?.key]);
  return source && shown?.key === source.key ? shown.url : null;
}

/**
 * A picture made from an image picked: the part cut from it, a square from its middle without one,
 * 256 pixels a side, as a JPEG, which every browser writes; what has no colour of its own is white.
 */
export async function squarePicture(image: Blob, cut?: PictureCut): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const side = cut?.side ?? Math.min(bitmap.width, bitmap.height);
  const x = cut?.x ?? (bitmap.width - side) / 2;
  const y = cut?.y ?? (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const draw = canvas.getContext('2d');
  if (!draw) throw new Error('No canvas');
  draw.fillStyle = '#fff';
  draw.fillRect(0, 0, SIDE, SIDE);
  draw.imageSmoothingQuality = 'high';
  draw.drawImage(bitmap, x, y, side, side, 0, 0, SIDE, SIDE);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No picture'))), 'image/jpeg', 0.86));
}
