import sddStartTask from '../.opencode/tools/sdd_start_task';
import sddEndTask from '../.opencode/tools/sdd_end_task';
import { readGuardModeState } from '../.opencode/lib/state-utils';

async function runVerification() {
  console.log('--- Verification Start ---');

  // 1. Start Task
  console.log('1. Starting Task...');
  try {
    const result = await sddStartTask.execute({ taskId: 'Task-Parallel-Test-1' }, {});
    console.log('Start Result:', result);
  } catch (e) {
    console.error('Start Failed:', e);
    process.exit(1);
  }

  // 2. Verify Guard Mode = block
  const stateAfterStart = await readGuardModeState();
  console.log('Guard Mode after Start:', stateAfterStart?.mode);
  if (stateAfterStart?.mode !== 'block') {
    console.error('FAIL: Expected block, got', stateAfterStart?.mode);
    process.exit(1);
  } else {
    console.log('PASS: Guard Mode is block');
  }

  // 3. End Task
  console.log('3. Ending Task...');
  try {
    const result = await sddEndTask.execute({}, {});
    console.log('End Result:', result);
  } catch (e) {
    console.error('End Failed:', e);
    process.exit(1);
  }

  // 4. Verify Guard Mode = disabled
  const stateAfterEnd = await readGuardModeState();
  console.log('Guard Mode after End:', stateAfterEnd?.mode);
  if (stateAfterEnd?.mode !== 'disabled') {
    console.error('FAIL: Expected disabled, got', stateAfterEnd?.mode);
    process.exit(1);
  } else {
    console.log('PASS: Guard Mode is disabled');
  }

  console.log('--- Verification Complete ---');
}

runVerification().catch((e) => {
  console.error('Unhandled Verification Error:', e);
  process.exit(1);
});
