import { Directory, File, Paths } from 'expo-file-system';

const ANIMAL_IMAGE_DIRECTORY = new Directory(Paths.document, 'animal-profile-images');
const RECORD_IMAGE_DIRECTORY = new Directory(Paths.document, 'record-images');
const BUSINESS_LOGO_DIRECTORY = new Directory(Paths.document, 'business-logo');

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
  return persistImage(sourceUri, ANIMAL_IMAGE_DIRECTORY, 'animal');
}

export async function persistRecordImage(sourceUri: string) {
  return persistImage(sourceUri, RECORD_IMAGE_DIRECTORY, 'record');
}

export async function persistBusinessLogo(sourceUri: string) {
  return persistImage(sourceUri, BUSINESS_LOGO_DIRECTORY, 'logo');
}

async function persistImage(sourceUri: string, directory: Directory, filenamePrefix: string) {
  const source = new File(sourceUri);

  if (!source.exists) {
    throw new Error('Selected image is no longer available.');
  }

  directory.create({ idempotent: true, intermediates: true });
  const extension = source.extension || '.jpg';
  const destination = new File(
    directory,
    `${filenamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extension}`,
  );

  await source.copy(destination);
  return destination.uri;
}
