import { Directory, File, Paths } from 'expo-file-system';

const ANIMAL_IMAGE_DIRECTORY = new Directory(Paths.document, 'animal-profile-images');
const COLLECTIVE_IMAGE_DIRECTORY = new Directory(Paths.document, 'collective-profile-images');
const RECORD_IMAGE_DIRECTORY = new Directory(Paths.document, 'record-images');
const BUSINESS_LOGO_DIRECTORY = new Directory(Paths.document, 'business-logo');

// Photos are downscaled before they are stored, rather than kept at whatever
// resolution the camera produced. A 12MP capture is ~48MB once decoded into a
// bitmap, and these images are only ever drawn into thumbnails and PDF cells —
// so full-resolution files buy nothing and cost a great deal. Android is where
// it bites: several full-size decodes push the app into continuous garbage
// collection, which stalls the JS thread and makes the whole UI, animations
// included, feel unresponsive.
const MAX_PHOTO_DIMENSION = 1600;
const PHOTO_COMPRESSION = 0.7;

// The business logo is kept as PNG at a smaller bound: it is placed in PDF
// headers where transparency matters, and JPEG would flatten the alpha channel
// onto a solid background.
const MAX_LOGO_DIMENSION = 512;

// Thumbnails exist for one reason: a list draws dozens of photos at badge
// size, and decoding a 1600px JPEG for each one is what makes a long list
// stutter on scroll. 256px covers the largest place a thumbnail is used (a
// card avatar at 3x) with room to spare, and lands around 15-25KB.
//
// They are a derived cache, not data: kept in their own directory, excluded
// from backups (only photos the records actually reference are collected), and
// regenerated on demand whenever one is missing. Deleting the whole directory
// costs nothing but the work of making them again.
const THUMBNAIL_DIRECTORY_NAME = 'photo-thumbnails';
const THUMBNAIL_DIRECTORY = new Directory(Paths.document, THUMBNAIL_DIRECTORY_NAME);
const THUMBNAIL_DIMENSION = 256;
const THUMBNAIL_COMPRESSION = 0.6;

type ImageKind = 'photo' | 'logo';

// The four directories above, by name. A stored path is recognised as one of
// ours by the directory segment it contains.
const IMAGE_DIRECTORY_NAMES = [
  'animal-profile-images',
  'collective-profile-images',
  'record-images',
  'business-logo',
] as const;

const STORED_IMAGE_PATTERN = new RegExp(
  `(?:^|/)(${IMAGE_DIRECTORY_NAMES.join('|')})/([^/?#]+)$`,
);

/**
 * Re-points a stored image reference at the *current* document directory.
 *
 * iOS names an app's data container with a UUID, and that UUID is not stable:
 * migrating to a new phone or restoring from an iOS backup brings the files
 * across but under a new container path. An absolute path saved under the old
 * container then resolves to nothing, `exists` reads false, and the photo is
 * silently dropped even though the file is sitting right there. (Observed in
 * this project's own dev data: stored paths pointing at a container the app
 * was no longer running under.)
 *
 * Rebuilding from the directory name plus the filename — the two parts that
 * never change — makes a stored reference survive that. It also accepts the
 * relative form (`animal-profile-images/animal-123.jpeg`), so a reference that
 * arrives without any container prefix at all still resolves.
 *
 * Anything that isn't one of this app's own image files (a remote URL, a
 * photo-library reference) is passed through untouched.
 */
export function resolveStoredImageUri(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(STORED_IMAGE_PATTERN);

  if (!match) {
    return trimmed;
  }

  const [, directoryName, fileName] = match;

  try {
    return new File(new Directory(Paths.document, directoryName), fileName).uri;
  } catch {
    return trimmed;
  }
}

/**
 * Splits a stored image reference into the two parts a backup archive needs:
 * which of this app's image directories it belongs to, and its filename.
 * Returns null for anything that isn't one of our own files.
 */
export function describeStoredImage(value: unknown): { directoryName: string; fileName: string } | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(STORED_IMAGE_PATTERN);

  return match ? { directoryName: match[1], fileName: match[2] } : null;
}

/**
 * The file an image belongs at, given the two parts above — used when writing
 * photos back out of a backup archive. Unknown directory names are rejected so
 * an archive can never place a file outside these four directories.
 */
export function imageFileFor(directoryName: string, fileName: string): File | null {
  if (!(IMAGE_DIRECTORY_NAMES as readonly string[]).includes(directoryName)) {
    return null;
  }

  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.startsWith('.')) {
    return null;
  }

  return new File(new Directory(Paths.document, directoryName), fileName);
}

/** Bytes a stored image occupies, or 0 if it is no longer there. */
export function storedImageSize(uri: string): number {
  try {
    const file = new File(uri);
    return file.exists ? file.info().size ?? 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * The thumbnail file for a stored photo, or null if the photo is not one of
 * ours. Thumbnails are named after their source, which is already unique
 * (`<kind>-<timestamp>-<random>`), so one flat directory holds them all.
 */
function thumbnailFileFor(storedUri: string): File | null {
  const described = describeStoredImage(storedUri);

  if (!described || described.directoryName === THUMBNAIL_DIRECTORY_NAME) {
    return null;
  }

  return new File(THUMBNAIL_DIRECTORY, described.fileName);
}

/** The thumbnail's uri if one has already been made, otherwise null. */
export function thumbnailUriIfPresent(storedUri: string): string | null {
  try {
    const thumbnail = thumbnailFileFor(storedUri);
    return thumbnail?.exists ? thumbnail.uri : null;
  } catch {
    return null;
  }
}

/**
 * Returns the thumbnail for a photo, making it first if it does not exist yet.
 * Photos saved before thumbnails existed are filled in this way, one at a
 * time as they are actually displayed, rather than through a migration that
 * would re-encode a farm's entire photo library at once on launch.
 *
 * Returns null when a thumbnail cannot be produced; callers fall back to the
 * full-size photo, which is what the app did before thumbnails existed.
 */
export async function ensureThumbnail(storedUri: string): Promise<string | null> {
  const resolved = resolveStoredImageUri(storedUri);

  if (!resolved) {
    return null;
  }

  const thumbnail = thumbnailFileFor(resolved);

  if (!thumbnail) {
    return null;
  }

  try {
    if (thumbnail.exists) {
      return thumbnail.uri;
    }

    const source = new File(resolved);

    if (!source.exists) {
      return null;
    }

    // Imported lazily for the same reason as in optimizeImage: the native
    // module resolves on import, and a binary built before the dependency was
    // added would take the screen down at load time.
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const original = await ImageManipulator.manipulate(resolved).renderAsync();
    const longestSide = Math.max(original.width, original.height);

    const rendered =
      longestSide > THUMBNAIL_DIMENSION
        ? await ImageManipulator.manipulate(resolved)
            .resize(
              original.width >= original.height
                ? { width: THUMBNAIL_DIMENSION }
                : { height: THUMBNAIL_DIMENSION },
            )
            .renderAsync()
        : original;

    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: THUMBNAIL_COMPRESSION,
    });

    THUMBNAIL_DIRECTORY.create({ idempotent: true, intermediates: true });
    await new File(saved.uri).copy(thumbnail);

    return thumbnail.uri;
  } catch {
    return null;
  }
}

export function filterAccessibleImageUris(imageUris: unknown, limit = 1) {
  if (!Array.isArray(imageUris)) {
    return [];
  }

  return imageUris
    .map(resolveStoredImageUri)
    .filter((uri): uri is string => uri !== null)
    .filter((uri) => {
      if (!uri.startsWith('file://')) {
        return true;
      }

      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    })
    .slice(0, limit);
}

export async function persistAnimalProfileImage(sourceUri: string) {
  return persistImage(sourceUri, ANIMAL_IMAGE_DIRECTORY, 'animal', 'photo');
}

export async function persistCollectiveImage(sourceUri: string) {
  return persistImage(sourceUri, COLLECTIVE_IMAGE_DIRECTORY, 'collective', 'photo');
}

export async function persistRecordImage(sourceUri: string) {
  return persistImage(sourceUri, RECORD_IMAGE_DIRECTORY, 'record', 'photo');
}

export async function persistBusinessLogo(sourceUri: string) {
  return persistImage(sourceUri, BUSINESS_LOGO_DIRECTORY, 'logo', 'logo');
}

// Downscales to fit within the kind's bound and re-encodes. The longest side is
// what gets constrained, so portrait and landscape sources both end up with a
// comparable pixel budget. Images already within the bound are re-encoded but
// not resized.
async function optimizeImage(sourceUri: string, kind: ImageKind) {
  const maxDimension = kind === 'logo' ? MAX_LOGO_DIMENSION : MAX_PHOTO_DIMENSION;

  // Imported lazily rather than at module scope. expo-image-manipulator resolves
  // its native module on import, so a static import would throw while this file
  // is being loaded — taking the whole screen down — on any binary built before
  // the dependency was added. Deferring it keeps that failure inside the caller's
  // try/catch, where it degrades to storing the original image.
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');

  const original = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const longestSide = Math.max(original.width, original.height);

  const rendered =
    longestSide > maxDimension
      ? await ImageManipulator.manipulate(sourceUri)
          .resize(
            original.width >= original.height
              ? { width: maxDimension }
              : { height: maxDimension },
          )
          .renderAsync()
      : original;

  return kind === 'logo'
    ? rendered.saveAsync({ format: SaveFormat.PNG })
    : rendered.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_COMPRESSION });
}

async function persistImage(
  sourceUri: string,
  directory: Directory,
  filenamePrefix: string,
  kind: ImageKind,
) {
  const source = new File(sourceUri);

  if (!source.exists) {
    throw new Error('Selected image is no longer available.');
  }

  // A failure here should not cost the user their photo — fall back to storing
  // the original, which is what happened for every image before this step
  // existed.
  let storableUri = sourceUri;
  try {
    const optimized = await optimizeImage(sourceUri, kind);
    storableUri = optimized.uri;
  } catch {
    storableUri = sourceUri;
  }

  const storable = new File(storableUri);
  directory.create({ idempotent: true, intermediates: true });
  const extension = storable.extension || '.jpg';
  const destination = new File(
    directory,
    `${filenamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`,
  );

  await storable.copy(destination);

  // Made now rather than on first display, so the list a user lands on right
  // after adding a photo already has one. A failure here is not worth losing
  // the photo over — ensureThumbnail will try again when it is displayed.
  void ensureThumbnail(destination.uri);

  return destination.uri;
}
