import { executeCalculate, executeConvertUnits, executeCalculatePercentage, executeTool } from './tools';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ Passed: ${msg}`);
  }
}

async function runTests() {
  console.log('--- Testing Safe Math Evaluator ---');
  {
    const res1 = executeCalculate({ expression: '125 * 48 + 360 / 6' });
    assert(res1.result === 6060, `125 * 48 + 360 / 6 should be 6060 (got ${res1.result})`);

    const res2 = executeCalculate({ expression: '2500 * 0.18' });
    assert(res2.result === 450, `2500 * 0.18 should be 450 (got ${res2.result})`);

    const res3 = executeCalculate({ expression: '(500 + 300) / 4' });
    assert(res3.result === 200, `(500 + 300) / 4 should be 200 (got ${res3.result})`);

    const res4 = executeCalculate({ expression: '2 ^ 8 + 10' });
    assert(res4.result === 266, `2 ^ 8 + 10 should be 266 (got ${res4.result})`);

    const res5 = executeCalculate({ expression: 'sqrt(144) + 8' });
    assert(res5.result === 20, `sqrt(144) + 8 should be 20 (got ${res5.result})`);

    let threwDivZero = false;
    try {
      executeCalculate({ expression: '100 / 0' });
    } catch {
      threwDivZero = true;
    }
    assert(threwDivZero, 'Division by zero must throw an error');
  }

  console.log('\n--- Testing Unit Converter ---');
  {
    const res1 = executeConvertUnits({ value: 5, from_unit: 'kilometers', to_unit: 'miles' });
    assert(Math.abs(res1.converted_value - 3.10686) < 0.001, `5 km to miles should be approx 3.10686 (got ${res1.converted_value})`);

    const res2 = executeConvertUnits({ value: 10, from_unit: 'km', to_unit: 'mi' });
    assert(Math.abs(res2.converted_value - 6.21371) < 0.001, `10 km to mi should be approx 6.21371 (got ${res2.converted_value})`);

    const res3 = executeConvertUnits({ value: 100, from_unit: 'celsius', to_unit: 'fahrenheit' });
    assert(res3.converted_value === 212, `100 C to F should be 212 (got ${res3.converted_value})`);

    const res4 = executeConvertUnits({ value: 32, from_unit: 'fahrenheit', to_unit: 'celsius' });
    assert(res4.converted_value === 0, `32 F to C should be 0 (got ${res4.converted_value})`);

    const res5 = executeConvertUnits({ value: 1, from_unit: 'liters', to_unit: 'milliliters' });
    assert(res5.converted_value === 1000, `1 L to mL should be 1000 (got ${res5.converted_value})`);

    const res6 = executeConvertUnits({ value: 50, from_unit: 'kg', to_unit: 'lbs' });
    assert(Math.abs(res6.converted_value - 110.23113) < 0.01, `50 kg to lbs should be approx 110.23 (got ${res6.converted_value})`);

    let incompatibleThrew = false;
    try {
      executeConvertUnits({ value: 5, from_unit: 'km', to_unit: 'kg' });
    } catch {
      incompatibleThrew = true;
    }
    assert(incompatibleThrew, 'Incompatible units conversion must throw an error');
  }

  console.log('\n--- Testing Percentage Calculator ---');
  {
    const res1 = executeCalculatePercentage({ operation: 'percentage_of', value1: 18, value2: 2500 });
    assert(res1.result === 450, `18% of 2500 should be 450 (got ${res1.result})`);

    const res2 = executeCalculatePercentage({ operation: 'percentage_of', value1: 12, value2: 850 });
    assert(res2.result === 102, `12% of 850 should be 102 (got ${res2.result})`);

    const res3 = executeCalculatePercentage({ operation: 'percentage_change', value1: 250, value2: 400 });
    assert(res3.result === 60, `Change from 250 to 400 should be 60% (got ${res3.result})`);
    assert(res3.details.direction === 'increase', `Direction should be 'increase'`);

    const res4 = executeCalculatePercentage({ operation: 'what_percentage', value1: 50, value2: 200 });
    assert(res4.result === 25, `50 of 200 should be 25% (got ${res4.result})`);

    let zeroDivThrew = false;
    try {
      executeCalculatePercentage({ operation: 'what_percentage', value1: 50, value2: 0 });
    } catch {
      zeroDivThrew = true;
    }
    assert(zeroDivThrew, 'Denominator 0 in percentage must throw an error');
  }

  console.log('\n--- Testing Tool Dispatcher ---');
  {
    const calcCall = await executeTool('calculate', { expression: '125 * 48 + 360 / 6' });
    assert(calcCall.success && calcCall.data.result === 6060, 'Dispatcher calculate succeeds with 6060');

    const convCall = await executeTool('convert_units', { value: 5, from_unit: 'km', to_unit: 'mi' });
    assert(convCall.success && Math.abs(convCall.data.converted_value - 3.10686) < 0.001, 'Dispatcher convert_units succeeds');

    const pctCall = await executeTool('calculate_percentage', { operation: 'percentage_of', value1: 18, value2: 2500 });
    assert(pctCall.success && pctCall.data.result === 450, 'Dispatcher calculate_percentage succeeds');

    const badCall = await executeTool('unknown_tool', {});
    assert(!badCall.success, 'Unknown tool returns error status gracefully');
  }

  console.log('\n🎉 ALL TOOL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
