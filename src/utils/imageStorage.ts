import { Directory, File, Paths } from 'expo-file-system';

const ANIMAL_IMAGE_DIRECTORY = new Directory(Paths.document, 'animal-profile-images');
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

type ImageKind = 'photo' | 'logo';

export function filterAccessibleImageUris(imageUris: unknown, limit = 1) {
  if (!Array.isArray(imageUris)) {
    return [];
  }

  return imageUris
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
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
  return destination.uri;
}
