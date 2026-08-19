// Development bypass: raised so the herds & flocks work can be built and
// tested against a realistic number of animals. The shipped Basic limit is 20 —
// restore this before any release build.
export const FREE_ANIMAL_LIMIT = __DEV__ ? 9999 : 20;
export const FREE_RECORD_LIMIT = 100;

export const DEFAULT_REVENUECAT_OFFERING_ID = 'default';
export const REVENUECAT_ENTITLEMENT_ID = 'pro';
