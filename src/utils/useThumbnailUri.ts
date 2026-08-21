import { useEffect, useState } from 'react';

import { ensureThumbnail, thumbnailUriIfPresent } from './imageStorage';

/**
 * The image a list row should draw: the photo's thumbnail when one exists, the
 * full-size photo until then.
 *
 * Lists are where photo decoding actually costs something — a screen of animal
 * cards decodes one 1600px JPEG per row otherwise, which is what makes a long
 * list stutter on scroll. Detail screens draw a single large image and should
 * keep using the full-size file directly.
 *
 * Missing thumbnails are generated in the background on first display, so a
 * photo library that predates thumbnails fills in as it is browsed rather than
 * through a launch-time migration over every photo at once.
 */

// Generation is shared across rows: the same photo can appear in several
// places at once (a list and a picker behind it), and without this each would
// start its own encode of the same file.
const inFlight = new Map<string, Promise<string | null>>();

function generateOnce(uri: string) {
  const existing = inFlight.get(uri);

  if (existing) {
    return existing;
  }

  const pending = ensureThumbnail(uri).finally(() => {
    inFlight.delete(uri);
  });

  inFlight.set(uri, pending);
  return pending;
}

export function useThumbnailUri(sourceUri: string | null | undefined): string | null {
  const source = sourceUri?.trim() || null;
  // Starts on whatever is available synchronously, so a row with a thumbnail
  // already made draws it on the first frame rather than flashing the
  // full-size image first.
  const [resolved, setResolved] = useState<string | null>(() =>
    source ? thumbnailUriIfPresent(source) ?? source : null,
  );

  useEffect(() => {
    if (!source) {
      setResolved(null);
      return;
    }

    const ready = thumbnailUriIfPresent(source);
    setResolved(ready ?? source);

    if (ready) {
      return;
    }

    let active = true;

    void generateOnce(source).then((thumbnail) => {
      if (active && thumbnail) {
        setResolved(thumbnail);
      }
    });

    return () => {
      active = false;
    };
  }, [source]);

  return resolved;
}
