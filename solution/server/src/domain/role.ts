export type Role = 'admin' | 'survivor' | 'nikita';

/** Roles are assigned once, when the user is created, from the username. */
export function roleForUsername(username: string): Role {
  if (username === 'admin') return 'admin';
  if (username === 'Никита') return 'nikita';
  return 'survivor';
}

/** Никита may tap, but his taps never count. */
export function tapsCount(role: Role): boolean {
  return role !== 'nikita';
}
