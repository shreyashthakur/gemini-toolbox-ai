import { Type, FunctionDeclaration } from '@google/genai';

// ============================================================================
// 1. SAFE MATHEMATICAL EXPRESSION PARSER & EVALUATOR (No eval() or Function())
// ============================================================================

export interface CalculationResult {
  expression: string;
  result: number;
  formatted: string;
}

export class SafeMathEvaluator {
  private pos = 0;
  private tokens: string[] = [];

  private tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const clean = expr.trim();

    while (i < clean.length) {
      const ch = clean[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Numbers (integers and floating point)
      if (/\d/.test(ch) || (ch === '.' && i + 1 < clean.length && /\d/.test(clean[i + 1]))) {
        let numStr = '';
        let hasDot = false;
        while (i < clean.length && (/\d/.test(clean[i]) || clean[i] === '.')) {
          if (clean[i] === '.') {
            if (hasDot) throw new Error('Invalid number with multiple decimal points');
            hasDot = true;
          }
          numStr += clean[i];
          i++;
        }
        tokens.push(numStr);
        continue;
      }

      // Word identifiers (function names like sqrt, abs, round)
      if (/[a-zA-Z_]/.test(ch)) {
        let id = '';
        while (i < clean.length && /[a-zA-Z0-9_]/.test(clean[i])) {
          id += clean[i];
          i++;
        }
        tokens.push(id.toLowerCase());
        continue;
      }

      // Operators and punctuation
      if (['+', '-', '*', '/', '%', '^', '(', ')', ','].includes(ch)) {
        // Handle double asterisk ** as exponentiation ^
        if (ch === '*' && i + 1 < clean.length && clean[i + 1] === '*') {
          tokens.push('^');
          i += 2;
          continue;
        }
        // Handle x or × as multiplication if needed
        tokens.push(ch);
        i++;
        continue;
      }

      // Handle Unicode multiplication and division symbols
      if (ch === '×') {
        tokens.push('*');
        i++;
        continue;
      }
      if (ch === '÷') {
        tokens.push('/');
        i++;
        continue;
      }

      throw new Error(`Unsupported character in mathematical expression: '${ch}'`);
    }

    return tokens;
  }

  public evaluate(expression: string): number {
    if (!expression || !expression.trim()) {
      throw new Error('Expression cannot be empty');
    }

    this.tokens = this.tokenize(expression);
    this.pos = 0;

    if (this.tokens.length === 0) {
      throw new Error('No valid tokens found in mathematical expression');
    }

    const result = this.parseExpression();

    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token at position ${this.pos}: '${this.tokens[this.pos]}'`);
    }

    if (!Number.isFinite(result)) {
      throw new Error('Evaluation resulted in a non-finite number (Infinity or NaN)');
    }

    return result;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (this.pos < this.tokens.length) {
      const op = this.tokens[this.pos];
      if (op === '+' || op === '-') {
        this.pos++;
        const nextVal = this.parseTerm();
        value = op === '+' ? value + nextVal : value - nextVal;
      } else {
        break;
      }
    }

    return value;
  }

  private parseTerm(): number {
    let value = this.parsePower();

    while (this.pos < this.tokens.length) {
      const op = this.tokens[this.pos];
      if (op === '*' || op === '/' || op === '%') {
        this.pos++;
        const nextVal = this.parsePower();
        if (op === '*') {
          value = value * nextVal;
        } else if (op === '/') {
          if (nextVal === 0) {
            throw new Error('Division by zero is undefined');
          }
          value = value / nextVal;
        } else if (op === '%') {
          if (nextVal === 0) {
            throw new Error('Modulo by zero is undefined');
          }
          value = value % nextVal;
        }
      } else {
        break;
      }
    }

    return value;
  }

  private parsePower(): number {
    let value = this.parseFactor();

    while (this.pos < this.tokens.length && this.tokens[this.pos] === '^') {
      this.pos++;
      const exponent = this.parseFactor();
      value = Math.pow(value, exponent);
    }

    return value;
  }

  private parseFactor(): number {
    if (this.pos >= this.tokens.length) {
      throw new Error('Unexpected end of expression');
    }

    const token = this.tokens[this.pos];

    // Unary plus
    if (token === '+') {
      this.pos++;
      return this.parseFactor();
    }

    // Unary minus
    if (token === '-') {
      this.pos++;
      return -this.parseFactor();
    }

    // Parentheses
    if (token === '(') {
      this.pos++;
      const val = this.parseExpression();
      if (this.pos >= this.tokens.length || this.tokens[this.pos] !== ')') {
        throw new Error('Mismatched parentheses: missing closing ")"');
      }
      this.pos++;
      return val;
    }

    // Function calls: sqrt, abs, round, floor, ceil, sin, cos, tan, log
    if (/^[a-z_]+$/.test(token)) {
      const funcName = token;
      this.pos++;
      if (this.pos >= this.tokens.length || this.tokens[this.pos] !== '(') {
        // Check for constant values: pi, e
        if (funcName === 'pi') return Math.PI;
        if (funcName === 'e') return Math.E;
        throw new Error(`Expected '(' after function '${funcName}'`);
      }
      this.pos++; // skip '('

      const args: number[] = [];
      if (this.pos < this.tokens.length && this.tokens[this.pos] !== ')') {
        args.push(this.parseExpression());
        while (this.pos < this.tokens.length && this.tokens[this.pos] === ',') {
          this.pos++;
          args.push(this.parseExpression());
        }
      }

      if (this.pos >= this.tokens.length || this.tokens[this.pos] !== ')') {
        throw new Error(`Mismatched parentheses in function '${funcName}' call`);
      }
      this.pos++; // skip ')'

      switch (funcName) {
        case 'sqrt':
          if (args[0] < 0) throw new Error('Square root of negative number is undefined for real numbers');
          return Math.sqrt(args[0]);
        case 'abs':
          return Math.abs(args[0]);
        case 'round':
          return args.length > 1 ? Number(args[0].toFixed(args[1])) : Math.round(args[0]);
        case 'floor':
          return Math.floor(args[0]);
        case 'ceil':
          return Math.ceil(args[0]);
        case 'pow':
          return Math.pow(args[0], args[1] ?? 1);
        case 'sin':
          return Math.sin(args[0]);
        case 'cos':
          return Math.cos(args[0]);
        case 'tan':
          return Math.tan(args[0]);
        case 'log':
        case 'ln':
          if (args[0] <= 0) throw new Error('Logarithm of non-positive number is undefined');
          return Math.log(args[0]);
        default:
          throw new Error(`Unsupported math function: '${funcName}'`);
      }
    }

    // Numeric literal
    const num = Number(token);
    if (isNaN(num)) {
      throw new Error(`Invalid token: '${token}'`);
    }
    this.pos++;
    return num;
  }
}

export function executeCalculate(args: { expression: string }): CalculationResult {
  if (!args || typeof args.expression !== 'string') {
    throw new Error('Parameter "expression" is required and must be a string.');
  }

  const evaluator = new SafeMathEvaluator();
  const rawResult = evaluator.evaluate(args.expression);
  // Round floating point precision issues (e.g. 0.1 + 0.2)
  const result = Math.abs(rawResult - Math.round(rawResult)) < 1e-10 ? Math.round(rawResult) : Number(rawResult.toFixed(8));

  const formatted = Number.isInteger(result)
    ? result.toLocaleString('en-US')
    : result.toLocaleString('en-US', { maximumFractionDigits: 6 });

  return {
    expression: args.expression.trim(),
    result,
    formatted,
  };
}

// ============================================================================
// 2. UNIT CONVERTER TOOL (Kilometers/Miles, Meters/Feet, Kg/Lbs, C/F, L/mL)
// ============================================================================

export interface UnitConversionResult {
  original_value: number;
  from_unit: string;
  converted_value: number;
  to_unit: string;
  formula: string;
}

type UnitCategory = 'length' | 'weight' | 'temperature' | 'volume';

interface UnitDef {
  canonical: string;
  category: UnitCategory;
  symbol: string;
  aliases: string[];
}

const SUPPORTED_UNITS: Record<string, UnitDef> = {
  kilometer: { canonical: 'kilometer', category: 'length', symbol: 'km', aliases: ['km', 'kms', 'kilometer', 'kilometers', 'kilometre', 'kilometres'] },
  mile: { canonical: 'mile', category: 'length', symbol: 'mi', aliases: ['mi', 'mis', 'mile', 'miles'] },
  meter: { canonical: 'meter', category: 'length', symbol: 'm', aliases: ['m', 'meter', 'meters', 'metre', 'metres'] },
  foot: { canonical: 'foot', category: 'length', symbol: 'ft', aliases: ['ft', 'foot', 'feet'] },
  kilogram: { canonical: 'kilogram', category: 'weight', symbol: 'kg', aliases: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'] },
  pound: { canonical: 'pound', category: 'weight', symbol: 'lb', aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  celsius: { canonical: 'celsius', category: 'temperature', symbol: '°C', aliases: ['c', 'celsius', 'centigrade', '°c'] },
  fahrenheit: { canonical: 'fahrenheit', category: 'temperature', symbol: '°F', aliases: ['f', 'fahrenheit', '°f'] },
  liter: { canonical: 'liter', category: 'volume', symbol: 'L', aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  milliliter: { canonical: 'milliliter', category: 'volume', symbol: 'mL', aliases: ['ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
};

function normalizeUnit(raw: string): UnitDef {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Unit must be a non-empty string');
  }
  const clean = raw.trim().toLowerCase().replace(/[^a-z°]/g, '');

  for (const def of Object.values(SUPPORTED_UNITS)) {
    if (def.aliases.includes(clean)) {
      return def;
    }
  }

  const validUnits = Object.values(SUPPORTED_UNITS)
    .map((u) => `${u.canonical} (${u.aliases.slice(0, 2).join(', ')})`)
    .join(', ');
  throw new Error(`Unsupported unit: "${raw}". Supported units are: ${validUnits}`);
}

export function executeConvertUnits(args: {
  value: number;
  from_unit: string;
  to_unit: string;
}): UnitConversionResult {
  if (args.value === undefined || args.value === null || typeof args.value !== 'number' || isNaN(args.value)) {
    throw new Error('Parameter "value" must be a valid number.');
  }

  const fromDef = normalizeUnit(args.from_unit);
  const toDef = normalizeUnit(args.to_unit);

  if (fromDef.category !== toDef.category) {
    throw new Error(
      `Cannot convert between incompatible dimensions: "${fromDef.canonical}" (${fromDef.category}) and "${toDef.canonical}" (${toDef.category}).`
    );
  }

  let convertedValue: number;
  let formula = '';

  const v = args.value;

  if (fromDef.canonical === toDef.canonical) {
    convertedValue = v;
    formula = `${v} ${fromDef.symbol} = ${v} ${toDef.symbol}`;
  } else if (fromDef.category === 'length') {
    if (fromDef.canonical === 'kilometer' && toDef.canonical === 'mile') {
      convertedValue = v * 0.621371192237334;
      formula = `${v} km × 0.621371 = ${convertedValue.toFixed(5)} mi`;
    } else if (fromDef.canonical === 'mile' && toDef.canonical === 'kilometer') {
      convertedValue = v * 1.609344;
      formula = `${v} mi × 1.609344 = ${convertedValue.toFixed(5)} km`;
    } else if (fromDef.canonical === 'meter' && toDef.canonical === 'foot') {
      convertedValue = v * 3.280839895013123;
      formula = `${v} m × 3.28084 = ${convertedValue.toFixed(5)} ft`;
    } else if (fromDef.canonical === 'foot' && toDef.canonical === 'meter') {
      convertedValue = v * 0.3048;
      formula = `${v} ft × 0.3048 = ${convertedValue.toFixed(5)} m`;
    } else if (fromDef.canonical === 'kilometer' && toDef.canonical === 'meter') {
      convertedValue = v * 1000;
      formula = `${v} km × 1000 = ${convertedValue} m`;
    } else if (fromDef.canonical === 'meter' && toDef.canonical === 'kilometer') {
      convertedValue = v / 1000;
      formula = `${v} m / 1000 = ${convertedValue} km`;
    } else if (fromDef.canonical === 'mile' && toDef.canonical === 'foot') {
      convertedValue = v * 5280;
      formula = `${v} mi × 5280 = ${convertedValue} ft`;
    } else if (fromDef.canonical === 'foot' && toDef.canonical === 'mile') {
      convertedValue = v / 5280;
      formula = `${v} ft / 5280 = ${convertedValue.toFixed(5)} mi`;
    } else {
      // General length conversion through meters
      const toMeters: Record<string, number> = {
        kilometer: 1000,
        meter: 1,
        mile: 1609.344,
        foot: 0.3048,
      };
      const meters = v * toMeters[fromDef.canonical];
      convertedValue = meters / toMeters[toDef.canonical];
      formula = `${v} ${fromDef.symbol} -> ${convertedValue.toFixed(5)} ${toDef.symbol}`;
    }
  } else if (fromDef.category === 'weight') {
    if (fromDef.canonical === 'kilogram' && toDef.canonical === 'pound') {
      convertedValue = v * 2.2046226218487757;
      formula = `${v} kg × 2.20462 = ${convertedValue.toFixed(5)} lbs`;
    } else if (fromDef.canonical === 'pound' && toDef.canonical === 'kilogram') {
      convertedValue = v * 0.45359237;
      formula = `${v} lbs × 0.453592 = ${convertedValue.toFixed(5)} kg`;
    } else {
      throw new Error(`Conversion between ${fromDef.canonical} and ${toDef.canonical} not supported.`);
    }
  } else if (fromDef.category === 'temperature') {
    if (fromDef.canonical === 'celsius' && toDef.canonical === 'fahrenheit') {
      convertedValue = (v * 9) / 5 + 32;
      formula = `(${v} °C × 9/5) + 32 = ${convertedValue.toFixed(2)} °F`;
    } else if (fromDef.canonical === 'fahrenheit' && toDef.canonical === 'celsius') {
      convertedValue = ((v - 32) * 5) / 9;
      formula = `(${v} °F - 32) × 5/9 = ${convertedValue.toFixed(2)} °C`;
    } else {
      throw new Error(`Conversion between ${fromDef.canonical} and ${toDef.canonical} not supported.`);
    }
  } else if (fromDef.category === 'volume') {
    if (fromDef.canonical === 'liter' && toDef.canonical === 'milliliter') {
      convertedValue = v * 1000;
      formula = `${v} L × 1000 = ${convertedValue} mL`;
    } else if (fromDef.canonical === 'milliliter' && toDef.canonical === 'liter') {
      convertedValue = v / 1000;
      formula = `${v} mL / 1000 = ${convertedValue} L`;
    } else {
      throw new Error(`Conversion between ${fromDef.canonical} and ${toDef.canonical} not supported.`);
    }
  } else {
    throw new Error(`Unsupported conversion category: ${fromDef.category}`);
  }

  // Format to sensible decimal places
  const finalValue = Number(convertedValue.toFixed(5));

  return {
    original_value: v,
    from_unit: fromDef.canonical,
    converted_value: finalValue,
    to_unit: toDef.canonical,
    formula,
  };
}

// ============================================================================
// 3. PERCENTAGE CALCULATOR TOOL (X% of Y, Percentage Change, What % is X of Y)
// ============================================================================

export interface PercentageResult {
  operation: 'percentage_of' | 'percentage_change' | 'what_percentage';
  result: number;
  formula: string;
  summary: string;
  details: Record<string, any>;
}

export function executeCalculatePercentage(args: {
  operation: string;
  value1: number;
  value2: number;
}): PercentageResult {
  const { operation, value1, value2 } = args;

  if (typeof value1 !== 'number' || isNaN(value1)) {
    throw new Error('Parameter "value1" must be a valid number.');
  }
  if (typeof value2 !== 'number' || isNaN(value2)) {
    throw new Error('Parameter "value2" must be a valid number.');
  }

  const op = (operation || '').trim().toLowerCase();

  switch (op) {
    case 'percentage_of':
    case 'percent_of':
    case 'of': {
      // value1 = percentage (e.g. 18), value2 = base (e.g. 2500)
      const result = (value1 / 100) * value2;
      const cleanResult = Number(result.toFixed(6));
      return {
        operation: 'percentage_of',
        result: cleanResult,
        formula: `(${value1} / 100) × ${value2} = ${cleanResult}`,
        summary: `${value1}% of ${value2} is ${cleanResult}`,
        details: {
          percentage: value1,
          base: value2,
          calculated_amount: cleanResult,
        },
      };
    }

    case 'percentage_change':
    case 'percent_change':
    case 'change':
    case 'increase_decrease': {
      // value1 = initial value (from), value2 = final value (to)
      if (value1 === 0) {
        throw new Error('Cannot calculate percentage change from an initial value of zero.');
      }
      const difference = value2 - value1;
      const percentChange = (difference / Math.abs(value1)) * 100;
      const cleanPercent = Number(percentChange.toFixed(4));
      const direction = difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'no change';

      return {
        operation: 'percentage_change',
        result: cleanPercent,
        formula: `((${value2} - ${value1}) / |${value1}|) × 100 = ${cleanPercent}%`,
        summary: `${Math.abs(cleanPercent)}% ${direction} from ${value1} to ${value2}`,
        details: {
          original_value: value1,
          new_value: value2,
          absolute_difference: Number(difference.toFixed(6)),
          percentage_change: cleanPercent,
          direction,
        },
      };
    }

    case 'what_percentage':
    case 'what_percent':
    case 'ratio': {
      // value1 = part (e.g. 50), value2 = whole/total (e.g. 200)
      if (value2 === 0) {
        throw new Error('Cannot calculate percentage with a total/denominator of zero.');
      }
      const percent = (value1 / value2) * 100;
      const cleanPercent = Number(percent.toFixed(4));
      return {
        operation: 'what_percentage',
        result: cleanPercent,
        formula: `(${value1} / ${value2}) × 100 = ${cleanPercent}%`,
        summary: `${value1} is ${cleanPercent}% of ${value2}`,
        details: {
          part: value1,
          whole: value2,
          percentage: cleanPercent,
        },
      };
    }

    default:
      throw new Error(
        `Unsupported percentage operation: "${operation}". Supported operations are: "percentage_of", "percentage_change", or "what_percentage".`
      );
  }
}

// ============================================================================
// 4. FUNCTION DECLARATIONS (OFFICIAL @google/genai SCHEMA)
// ============================================================================

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'calculate',
    description:
      'Safely evaluate a mathematical expression. Supports basic arithmetic (+, -, *, /, %, ^), parentheses, and functions like sqrt, abs, round, sin, cos, tan, log. Always use this tool for evaluating mathematical equations, multi-step math problems, and calculations rather than doing mental math.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: {
          type: Type.STRING,
          description:
            'The mathematical expression to evaluate, e.g. "125 * 48 + 360 / 6", "2500 * 0.18", "(500 + 300) / 4", "sqrt(144) + 10", "2^8".',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'convert_units',
    description:
      'Converts a numeric value from one unit of measurement to another. Supported conversions: Kilometers ↔ Miles, Meters ↔ Feet, Kilograms ↔ Pounds, Celsius ↔ Fahrenheit, Liters ↔ Milliliters.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        value: {
          type: Type.NUMBER,
          description: 'The numeric value to convert, e.g. 5, 100, 32.5.',
        },
        from_unit: {
          type: Type.STRING,
          description:
            'The source unit. E.g. "kilometer", "km", "mile", "mi", "meter", "m", "foot", "ft", "kilogram", "kg", "pound", "lb", "celsius", "c", "fahrenheit", "f", "liter", "l", "milliliter", "ml".',
        },
        to_unit: {
          type: Type.STRING,
          description:
            'The target unit to convert into. E.g. "mile", "kilometer", "foot", "meter", "pound", "kilogram", "fahrenheit", "celsius", "milliliter", "liter".',
        },
      },
      required: ['value', 'from_unit', 'to_unit'],
    },
  },
  {
    name: 'calculate_percentage',
    description:
      'Calculates percentage-based operations: 1) "percentage_of" to find X% of Y (e.g. 18% of 2500), 2) "percentage_change" to find percentage increase or decrease from X to Y (e.g. change from 250 to 400), 3) "what_percentage" to determine what percentage X is of Y (e.g. 50 out of 200).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: {
          type: Type.STRING,
          description:
            'The percentage operation to perform: "percentage_of" (calculate X% of Y), "percentage_change" (percentage increase/decrease from X to Y), or "what_percentage" (what % is X of Y).',
        },
        value1: {
          type: Type.NUMBER,
          description:
            'First value: For "percentage_of", this is the percentage X (e.g. 18). For "percentage_change", this is the initial value X (e.g. 250). For "what_percentage", this is the part value X (e.g. 50).',
        },
        value2: {
          type: Type.NUMBER,
          description:
            'Second value: For "percentage_of", this is the base total Y (e.g. 2500). For "percentage_change", this is the final value Y (e.g. 400). For "what_percentage", this is the whole/total Y (e.g. 200).',
        },
      },
      required: ['operation', 'value1', 'value2'],
    },
  },
];

// ============================================================================
// 5. TOOL EXECUTION DISPATCHER
// ============================================================================

export interface ToolExecutionRecord {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result?: any;
  status: 'Successful' | 'Error';
  error?: string;
  timestamp: number;
}

export async function executeTool(
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    switch (toolName) {
      case 'calculate': {
        const result = executeCalculate({ expression: String(args.expression || '') });
        return { success: true, data: result };
      }
      case 'convert_units': {
        const val = typeof args.value === 'string' ? parseFloat(args.value) : Number(args.value);
        const result = executeConvertUnits({
          value: val,
          from_unit: String(args.from_unit || ''),
          to_unit: String(args.to_unit || ''),
        });
        return { success: true, data: result };
      }
      case 'calculate_percentage': {
        const val1 = typeof args.value1 === 'string' ? parseFloat(args.value1) : Number(args.value1);
        const val2 = typeof args.value2 === 'string' ? parseFloat(args.value2) : Number(args.value2);
        const result = executeCalculatePercentage({
          operation: String(args.operation || ''),
          value1: val1,
          value2: val2,
        });
        return { success: true, data: result };
      }
      default:
        throw new Error(`Unknown tool: "${toolName}". Available tools: calculate, convert_units, calculate_percentage.`);
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Tool execution encountered an error.',
    };
  }
}

