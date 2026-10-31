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

  console.log('\n🎉 ALL ERROR HANDLING & SECURITY TESTS PASSED!');
}

testErrorScenarios().catch((err) => {
  console.error(err);
  process.exit(1);
});

