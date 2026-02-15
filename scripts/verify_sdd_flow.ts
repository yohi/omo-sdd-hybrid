import sddStartTask from '../.opencode/tools/sdd_start_task';
import sddEndTask from '../.opencode/tools/sdd_end_task';
import { readGuardModeState } from '../.opencode/lib/state-utils';

async function runVerification() {
  console.log('--- Verification Start ---');

  let originalError: unknown = null;

  try {
    // 1. Start Task
    console.log('1. Starting Task...');
    const startResult = await sddStartTask.execute({ taskId: 'Task-Parallel-Test-1' }, {});
    console.log('Start Result:', startResult);

    // 2. Verify Guard Mode = block
    const stateAfterStart = await readGuardModeState();
    console.log('Guard Mode after Start:', stateAfterStart?.mode);
    if (stateAfterStart?.mode !== 'block') {
      throw new Error(`FAIL: Expected block, got ${stateAfterStart?.mode}`);
    } else {
      console.log('PASS: Guard Mode is block');
    }

  } catch (e) {
    console.error('Verification Start Phase Failed:', e);
    originalError = e;
    process.exitCode = 1;
  } finally {
    // 3. End Task (Cleanup)
    console.log('3. Ending Task (Cleanup)...');
    try {
      const endResult = await sddEndTask.execute({}, {});
      console.log('End Result:', endResult);
    } catch (e) {
      console.error('End Task Failed:', e);
      process.exitCode = 1;
      if (!originalError) {
        originalError = e;
      }
    }
  }

  if (originalError) {
    throw originalError;
  }

  // 4. Verify Guard Mode = disabled
  const stateAfterEnd = await readGuardModeState();
  console.log('Guard Mode after End:', stateAfterEnd?.mode);
  if (stateAfterEnd?.mode !== 'disabled') {
    throw new Error(`FAIL: Expected disabled, got ${stateAfterEnd?.mode}`);
  } else {
    console.log('PASS: Guard Mode is disabled');
  }

  console.log('--- Verification Complete ---');
}

runVerification().catch((e) => {
  console.error('Unhandled Verification Error:', e);
  process.exit(1);
});
