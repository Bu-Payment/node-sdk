import { minorUnits } from "../src/money/minor-units";

const euro = minorUnits().currency("EUR");
const units: number = euro.fromDecimal(19.99);
const decimal: number = euro.toDecimal(units);
void decimal;

// @ts-expect-error a conversion needs a currency first
minorUnits().fromDecimal(19.99);

// @ts-expect-error a conversion needs a currency first
minorUnits().toDecimal(1999);

// @ts-expect-error a currency is one code
minorUnits().currency("EUR", 2);
