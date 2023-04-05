// A silly server returning random (price) samples in the format of
// https://api.spot-hinta.fi/swagger/ui#/(JSON)%20Current%20hour%20(or%20one%20of%20the%20next%20hours)/JustNow

import { createServer } from 'node:http';

const UPPER_PRICE_EUROS_INC_VAT = 0.4;
const SERVER_PORT = (process?.env?.PORT || 4390);
const VAT_PERCENTAGE = 24;

console.log(`Starting a https://api.spot-hinta.fi/JustNow simulator running at http://localhost:${SERVER_PORT}`);

createServer((req, res) => {

  // Allow prices to go slightly below 0
  const PriceWithTax = ( Math.random() * UPPER_PRICE_EUROS_INC_VAT ) / 0.95 - 0.05;

  console.log("Returned price " + PriceWithTax.toFixed(4) + " €");

  res.writeHead(200, { "content-type": "application/json" });
  res.write(JSON.stringify({
    Rank: parseInt(Math.random() * 23),
    DateTime: (new Date()).toISOString(),
    PriceWithTax,
    PriceNoTax: PriceWithTax / (1 + VAT_PERCENTAGE / 100)
  }));
  res.end();

}).listen(SERVER_PORT);
