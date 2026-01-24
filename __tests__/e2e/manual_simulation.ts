
import { test, expect, mock } from "bun:test";

console.log("Starting manual QA simulation...");

// 1. Mock dependencies
const mockReadState = mock();
const mockReadGuardModeState = mock();
const mockDetermineEffectiveGuardMode = mock();
const mockValidateGapInternal = mock();

mock.module("../../.opencode/lib/state-utils", () => ({
  readState: mockReadState,
  readGuardModeState: mockReadGuardModeState
}));

mock.module("../../.opencode/lib/access-policy", () => ({
  determineEffectiveGuardMode: mockDetermineEffectiveGuardMode
}));

mock.module("../../.opencode/tools/sdd_validate_gap", () => ({
  validateGapInternal: mockValidateGapInternal
}));

// Import Plugins (after mocks)
import { SddContextInjector } from "../../.opencode/plugins/sdd-context-injector";
import { SddFeedbackLoop, resetThrottleForTesting } from "../../.opencode/plugins/sdd-feedback-loop";

// 2. Initialize State Mocks for all tests
mockReadState.mockResolvedValue({
  status: 'ok',
  state: {
    activeTaskId: 'Task-Sim',
    allowedScopes: ['src/safe/**'],
    validationAttempts: 0
  }
});
mockReadGuardModeState.mockResolvedValue({ mode: 'warn' });
mockDetermineEffectiveGuardMode.mockReturnValue('warn');

test("Simulation: Context Injector", async () => {
  console.log("\n[1/3] Simulating Context Injector...");
  
  const plugin = await SddContextInjector({});
  const hook = plugin['experimental.chat.system.transform'];
  
  const input = {};
  const output = { system: [] as string[] };
  
  await hook(input, output);
  
  console.log("Context Output:", output.system[0]);
  expect(output.system[0]).toContain("Active Task: Task-Sim");
  expect(output.system[0]).toContain("Guard: warn");
});

test("Simulation: Feedback Loop (Violation)", async () => {
  console.log("\n[2/3] Simulating Feedback Loop (Violation)...");
  
  // Mock validation failure
  mockValidateGapInternal.mockResolvedValue("WARN: 1 files outside scope\n  src/evil.ts");
  
  const plugin = await SddFeedbackLoop({ client: {} as any });
  const hook = plugin['tool.execute.after'];
  
  const input = { tool: 'edit' };
  const output = { output: "Original Output" };
  
  // Reset throttle logic by mocking Date.now
  const originalNow = Date.now;
  try {
    // Use a fixed timestamp
    Date.now = () => 1000000000000; 
    
    await hook(input, output);
    
    console.log("Feedback Output (Violation):");
    console.log(output.output);
    
    expect(output.output).toContain("[SDD-FEEDBACK]");
    expect(output.output).toContain("⚠️ 整合性チェック警告");
  } finally {
    Date.now = originalNow;
  }
});

test("Simulation: Feedback Loop (Valid)", async () => {
  console.log("\n[3/3] Simulating Feedback Loop (Valid)...");
  
  resetThrottleForTesting();

  // Mock validation success
  mockValidateGapInternal.mockResolvedValue("PASS: All clean");
  
  const plugin = await SddFeedbackLoop({ client: {} as any });
  const hook = plugin['tool.execute.after'];
  
  const input = { tool: 'edit' };
  const output = { output: "Original Output" };
  
  // Advance time to bypass throttle (previous was 1000000000000)
  const originalNow = Date.now;
  try {
    Date.now = () => 1000000005000; // +5 seconds
    
    await hook(input, output);
    
    console.log("Feedback Output (Valid):");
    console.log(output.output);
    
    expect(output.output).not.toContain("[SDD-FEEDBACK]");
    expect(output.output).toBe("Original Output");
  } finally {
    Date.now = originalNow;
  }
});
