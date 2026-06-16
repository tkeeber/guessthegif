/**
 * Lobby Cleanup Job
 * 
 * Closes any lobbies older than 12 hours.
 * Scheduled to run at 23:00 GMT daily.
 */

import pool from '../db';

/**
 * Close all lobbies that are older than 12 hours (regardless of status).
 * Sets status to 'closed' so they no longer appear in active checks.
 */
export async function cleanupStaleLobbies(): Promise<number> {
  const result = await pool.query(
    `UPDATE lobbies
        SET status = 'closed'
      WHERE status IN ('waiting', 'in_session')
        AND created_at < NOW() - INTERVAL '12 hours'
      RETURNING id`
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[LobbyCleanup] Closed ${count} stale lobbies`);
  }
  return count;
}

/**
 * Start the nightly cleanup scheduler.
 * Checks every minute if it's 23:00 GMT and runs the cleanup once per day.
 */
export function startCleanupScheduler(): void {
  let lastRunDate = '';

  setInterval(() => {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Run at 23:00 GMT, only once per day
    if (hour === 23 && minute === 0 && dateStr !== lastRunDate) {
      lastRunDate = dateStr;
      console.log('[LobbyCleanup] Running nightly cleanup...');
      cleanupStaleLobbies().catch((err) => {
        console.error('[LobbyCleanup] Error:', err);
      });
    }
  }, 60_000); // Check every minute

  console.log('[LobbyCleanup] Scheduler started (runs at 23:00 GMT daily)');
}
