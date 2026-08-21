// Single source of truth for which record types embed structured
// label:value lines inside `RecordEntry.details` (see the payload built in
// add-record.tsx's handleSave — Death/Birth/Health Check/Sale/Purchase all
// join a handful of "Label: value" lines together with the user's own free
// text). Both the Add/Edit Record form (populating its Notes field on edit)
// and View Record (rendering the Details section) need to strip exactly
// these same lines back out — previously each had its own copy of this
// list, and view-record.tsx's copy had drifted to only cover Sale/Purchase,
// silently leaking the other three types' structured lines into what's
// meant to be free-text notes.
export function getStructuredDetailLabels(type: string): string[] {
  if (type === 'Birth') {
    return ['Mother', 'Tag / ID', 'Species', 'Breed', 'Sex', 'Weight'];
  }

  if (type === 'Death') {
    return ['Disposal Method'];
  }

  if (type === 'Health Check') {
    return ['Condition / Diagnosis', 'Vet Seen'];
  }

  if (type === 'Sale') {
    return ['Buyer', 'Sale Price'];
  }

  if (type === 'Purchase') {
    return ['Seller', 'Purchase Price'];
  }

  return [];
}

// Removes any "Label: value" section (one of `labels`) from `details`,
// leaving only the user's own free-text notes.
export function stripStructuredDetailLines(details: string, labels: string[]): string {
  if (labels.length === 0) {
    return details;
  }

  return details
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)
    .filter((section) => !labels.some((label) => section.toLowerCase().startsWith(`${label.toLowerCase()}:`)))
    .join('\n\n');
}
