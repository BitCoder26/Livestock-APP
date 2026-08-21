// Basic caps records and exports. An animal or a herd on its own produces no
// value until something is logged against it, and counting them punished the
// large flocks the app is meant to serve — a poultry keeper hit the cap before
// entering a single record.
export const FREE_RECORD_LIMIT = 100;

// Exports are the second Basic cap, and a lifetime total like the record one —
// it never resets. Five is sized to "enough to try it, not enough to run a farm
// on": there are three export targets (animals, herds/flocks, records) in two
// formats, so five is a real trial of the feature, while a keeper who exports
// for a vet visit or an inspection burns one per visit and reaches the paywall
// through genuine use rather than a birthday. Counted per completed export in
// the Export tab (PDF and spreadsheet alike); the Reports summary PDF is free,
// and so is Settings → Backup — a backup is how someone rescues their own farm
// data, and there must never be a paywall in front of that.
export const FREE_EXPORT_LIMIT = 5;

// Where the "you're running low" nudge fires (see PlanLimitGate). A
// percentage is the right measure on the record allowance — 70 of 100 is a
// real warning with room left to act on it. On an allowance as small as five
// it isn't: the same 70% lands on four, leaving a single export, which is a
// notification rather than a warning. So the export nudge counts what's left
// instead, and fires with two still in hand.
export const FREE_RECORD_NUDGE_AT = Math.ceil(FREE_RECORD_LIMIT * 0.7);
export const FREE_EXPORT_NUDGE_AT = Math.max(1, FREE_EXPORT_LIMIT - 2);

export const DEFAULT_REVENUECAT_OFFERING_ID = 'default';
export const REVENUECAT_ENTITLEMENT_ID = 'pro';
