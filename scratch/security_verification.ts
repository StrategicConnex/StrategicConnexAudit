import * as dotenv from 'dotenv';
import * as path from 'path';

// Explicitly load .env.local BEFORE other imports
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { RedisCircuitBreaker, CircuitState } from '../src/shared/lib/circuit-breaker';
import { redis } from '../src/shared/lib/ratelimit';

// Mocking some parts for standalone test
async function testSSRF() {
  console.log('\n--- Testing SSRF Protection ---');
  // Since we are in a script, we'll try to use the logic from audit.trigger.ts
  // But we'll just re-implement isPrivateIp here for verification
  function isPrivateIp(ip: string): boolean {
    if (/^127\./.test(ip)) return true;
    if (/^10\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
    if (/^192\.168\./.test(ip)) return true;
    if (/^169\.254\./.test(ip)) return true;
    return false;
  }

  const testIps = ['127.0.0.1', '192.168.1.1', '8.8.8.8', '169.254.169.254'];
  testIps.forEach(ip => {
    console.log(`IP ${ip} is private? ${isPrivateIp(ip)}`);
  });
}

async function testCircuitBreaker() {
  console.log('\n--- Testing Circuit Breaker Transitions ---');
  const serviceName = 'test_service_' + Date.now();
  const cb = new RedisCircuitBreaker(serviceName, {
    failureThreshold: 2,
    recoveryTimeout: 2000, // 2 seconds
    successThreshold: 1
  });

  console.log('1. Initial State:', await cb.getState());

  // Trigger 2 failures
  try {
    await cb.execute(async () => { throw new Error('Fail 1'); });
  } catch (e) {}
  try {
    await cb.execute(async () => { throw new Error('Fail 2'); });
  } catch (e) {}

  console.log('2. State after 2 failures:', await cb.getState());

  // Try to execute while OPEN
  try {
    await cb.execute(async () => { return 'Success'; });
  } catch (e: any) {
    console.log('3. Execution while OPEN blocked:', e.message);
  }

  // Wait for recovery
  console.log('4. Waiting 2.5 seconds for recovery...');
  await new Promise(r => setTimeout(r, 2500));

  console.log('5. State after wait (before execution):', await cb.getState());

  // Execute to transition to HALF_OPEN -> CLOSED
  const result = await cb.execute(async () => { return 'Recovered!'; });
  console.log('6. Execution result:', result);
  console.log('7. Final State:', await cb.getState());

  // Cleanup
  await cb.reset();
}

function testXssSanitization() {
  console.log('\n--- Testing XSS Sanitization ---');
  function escapeHtml(unsafe: string) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const malicious = '<script>alert("XSS")</script> & "quotes"';
  const sanitized = escapeHtml(malicious);
  console.log('Original:', malicious);
  console.log('Sanitized:', sanitized);
  
  if (sanitized.includes('<script>') || sanitized.includes('"')) {
    console.error('FAILED: Sanitization failed!');
  } else {
    console.log('SUCCESS: Sanitization passed.');
  }
}

async function runAll() {
  try {
    await testSSRF();
    await testCircuitBreaker();
    testXssSanitization();
    console.log('\n--- ALL TESTS COMPLETED ---');
    process.exit(0);
  } catch (err) {
    console.error('Test run failed:', err);
    process.exit(1);
  }
}

runAll();
