import { type GuardMode, writeGuardModeState } from '../lib/state-utils';

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode !== 'warn' && mode !== 'block') {
    console.error('Usage: sdd_set_guard_mode <warn|block>');
    process.exit(1);
  }

  const currentUser = process.env.USER || 'unknown';

  try {
    await writeGuardModeState({
      mode: mode as GuardMode,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser
    });
    console.log(`Guard mode set to '${mode}'`);
  } catch (error) {
    console.error('Failed to set guard mode:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
