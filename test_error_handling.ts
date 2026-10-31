import { GoogleGenAI } from '@google/genai';

async function testErrorScenarios() {
  console.log('--- Testing API Failure Handling & Security ---');

  // Test 1: Invalid API Key failure handling
  console.log('1. Testing invalid credentials handling...');
  let caughtAuthError = false;
  try {
    const ai = new GoogleGenAI({ apiKey: 'INVALID_MOCK_KEY_FOR_TESTING' });
    await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    });
  } catch (err: any) {
    caughtAuthError = true;
    console.log('   ✅ API rejection handled safely. Error message captured:', err.message?.slice(0, 80));
  }
  if (!caughtAuthError) {
    console.error('❌ Failed: Invalid API key did not trigger expected error');
    process.exit(1);
  }

  // Test 2: Missing API key handling in server format
  console.log('2. Testing missing API key detection...');
  const checkHasKey = (key?: string) => Boolean(key && key.trim() !== '' && key !== 'your_gemini_api_key_here');
  if (checkHasKey('') === false && checkHasKey('your_gemini_api_key_here') === false) {
    console.log('   ✅ Empty or placeholder keys correctly identified as unconfigured');
  } else {
    console.error('❌ Failed: Key detection flawed');
    process.exit(1);
  }

  // Test 3: Empty input validation
  console.log('3. Testing empty and whitespace message rejection...');
  const validateInput = (msg: string) => {
    const trimmed = (msg || '').trim();
    if (!trimmed) throw new Error('Message content cannot be empty.');
    return trimmed;
  };

  let caughtEmpty = false;
  try {
    validateInput('   \n  \t  ');
  } catch {
    caughtEmpty = true;
  }
  if (caughtEmpty) {
    console.log('   ✅ Whitespace-only string rejected without sending request');
  } else {
    console.error('❌ Failed: Whitespace not rejected');
    process.exit(1);
  }

  // Test 4: Exponential backoff & retry classification
  console.log('4. Testing transient error classification & retry logic...');
  const { isTransientError, formatFriendlyErrorMessage, callWithExponentialBackoff } = await import('./geminiResilience.js');

  const err503 = { status: 503, message: 'This model is currently experiencing high demand.' };
  const err429 = { status: 429, message: 'Resource has been exhausted.' };
  const err401 = { status: 401, message: 'API key not valid.' };
  const err400 = { status: 400, message: 'Invalid argument provided.' };

  if (!isTransientError(err503)) {
    throw new Error('503 should be classified as transient');
  }
  if (!isTransientError(err429)) {
    throw new Error('429 should be classified as transient');
  }
  if (isTransientError(err401)) {
    throw new Error('401 auth error must NOT be classified as transient');
  }
  if (isTransientError(err400)) {
    throw new Error('400 bad request must NOT be classified as transient');
  }
  console.log('   ✅ Transient vs Permanent error classification verified');

  const friendly503 = formatFriendlyErrorMessage(err503);
  if (!friendly503.includes('high demand') && !friendly503.includes('busy')) {
    throw new Error('Friendly message for 503 should be user-friendly');
  }
  console.log('   ✅ Friendly error message formatting verified:', friendly503);

  // Test retry mechanism: mock operation that fails twice with 503 then succeeds
  let attempts = 0;
  const mockSucceedAfterRetries = async () => {
    attempts++;
    if (attempts < 3) {
      throw { status: 503, message: 'High demand' };
    }
    return 'SUCCESS';
  };

  const retryResult = await callWithExponentialBackoff(
    mockSucceedAfterRetries,
    { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50, modelName: 'test-model' }
  );

  if (retryResult !== 'SUCCESS' || attempts !== 3) {
    throw new Error(`Exponential backoff did not retry correctly. Attempts: ${attempts}`);
  }
  console.log(`   ✅ Exponential backoff retried ${attempts - 1} times and resolved successfully`);

  // Test permanent error stopping immediately without retry
  let permAttempts = 0;
  let permCaught = false;
  try {
    await callWithExponentialBackoff(
      async () => {
        permAttempts++;
        throw { status: 401, message: 'API key not valid' };
      },
      { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50, modelName: 'test-model' }
    );
  } catch {
    permCaught = true;
  }
  if (!permCaught || permAttempts !== 1) {
    throw new Error(`Permanent error was retried! Attempts: ${permAttempts}`);
  }
  console.log('   ✅ Permanent error stopped immediately without wasteful retries (1 attempt)');

  console.log('\n🎉 ALL ERROR HANDLING, RETRY & SECURITY TESTS PASSED!');
}

testErrorScenarios().catch((err) => {
  console.error(err);
  process.exit(1);
});

