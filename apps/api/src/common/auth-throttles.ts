/**
 * Rate limits for unauthenticated endpoints. Production limits are strict because registration
 * is public; development and tests register many throw-away users, so limits there are relaxed.
 */
const prod = () => process.env.NODE_ENV === 'production';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const REGISTER_THROTTLE = {
  default: { limit: () => (prod() ? 5 : 100), ttl: () => (prod() ? HOUR : MINUTE) },
};
export const LOGIN_THROTTLE = { default: { limit: () => (prod() ? 10 : 100), ttl: MINUTE } };
