/**
 * A script for reflecting electricity spot price in the LED light of a
 * Shelly Plus Plug (S) using api.spot-hinta.fi.
 *
 * Only affects the Plus Plug's LED when the they are set to work in
 * "switch state" mode (will change mode at startup if not). Sets the
 * LED color according to the user configurable price<->color/brightness
 * map. LED brightness is configured for switch `on` and `off` states
 * individually.
 *
 * When started (or when device cannot contact server), the script sets
 * the led to "white". In normal operation, the script reads current price
 * & sets the lights according to the user configurable color map
 * periodically (every 15 minutes).
 *
 * Author: antti@shellykauppa.fi (Kotia Finland Inc.)
 * Source: https://github.com/shellykauppa/plus-plug-spot-illuminator
 * License: MIT
 *
 * Spot-hinta.fi service is a privately funded service and not
 * related to the author of this script in any way. Please support
 * their good work here: https://www.buymeacoffee.com/spothintafi
 */

/* global Shelly, Timer, die */

/*******************************************************************************
 *
 * User variables. Modify these!
 *
 ******************************************************************************/

// This is the color map, determining the color/brightness to use after the price
// exceeds the given limit. The entries in the color map must be in a
// pricewise rising order. The prices are euros including VAT; spot-hinta.fi
// VAT prices are used but it is undocumented which VAT they are using; only FI
// area has been tested. The colors may be given with CSS syntax #rrbbgg or
// using the named colors: https://drafts.csswg.org/css-color/#named-colors.
//
// Brightness is 0..100 integer representing a percentage.
//
// The first entry must have a price lower or equal to zero - negative prices
// are rare but possible.
//
let priceColorMap = [
  { fromPriceWithTax: -1.0, color: "purple",    onBrightness: 80, offBrightness: 10 },
  { fromPriceWithTax: 0.00, color: "green",     onBrightness: 80, offBrightness: 10 },
  { fromPriceWithTax: 0.09, color: "turquoise", onBrightness: 50, offBrightness:  7 },
  { fromPriceWithTax: 0.15, color: "#FF4500",   onBrightness: 50, offBrightness: 10 }, // "orangered"
  { fromPriceWithTax: 0.25, color: "red",       onBrightness: 50, offBrightness: 10 }
];

// Spot price region to use for price retrieval. Spot-hinta.fi supported regions:
// DK1, DK2, EE, FI, LT, LV, NO1, NO2, NO3, NO4, NO5, SE1, SE2, SE3, SE4
let spotHintaRegion = "FI";

/*******************************************************************************
 *
 * Constants & code. Proceed at your own risk.
 *
 ******************************************************************************/

let MINUTE_MSECS = 60*1000;

let API_HOST = "https://api.spot-hinta.fi";

let PRICE_URL = API_HOST + "/JustNow?region=" + spotHintaRegion;

// Color name <-> rgb map. From https://drafts.csswg.org/css-color/#named-colors
let COLOR_NAMES = [
  { name: 'aliceblue', rgb: '#F0F8FF' },
  { name: 'antiquewhite', rgb: '#FAEBD7' },
  { name: 'aqua', rgb: '#00FFFF' },
  { name: 'aquamarine', rgb: '#7FFFD4' },
  { name: 'azure', rgb: '#F0FFFF' },
  { name: 'beige', rgb: '#F5F5DC' },
  { name: 'bisque', rgb: '#FFE4C4' },
  { name: 'black', rgb: '#000000' },
  { name: 'blanchedalmond', rgb: '#FFEBCD' },
  { name: 'blue', rgb: '#0000FF' },
  { name: 'blueviolet', rgb: '#8A2BE2' },
  { name: 'brown', rgb: '#A52A2A' },
  { name: 'burlywood', rgb: '#DEB887' },
  { name: 'cadetblue', rgb: '#5F9EA0' },
  { name: 'chartreuse', rgb: '#7FFF00' },
  { name: 'chocolate', rgb: '#D2691E' },
  { name: 'coral', rgb: '#FF7F50' },
  { name: 'cornflowerblue', rgb: '#6495ED' },
  { name: 'cornsilk', rgb: '#FFF8DC' },
  { name: 'crimson', rgb: '#DC143C' },
  { name: 'cyan', rgb: '#00FFFF' },
  { name: 'darkblue', rgb: '#00008B' },
  { name: 'darkcyan', rgb: '#008B8B' },
  { name: 'darkgoldenrod', rgb: '#B8860B' },
  { name: 'darkgray', rgb: '#A9A9A9' },
  { name: 'darkgreen', rgb: '#006400' },
  { name: 'darkgrey', rgb: '#A9A9A9' },
  { name: 'darkkhaki', rgb: '#BDB76B' },
  { name: 'darkmagenta', rgb: '#8B008B' },
  { name: 'darkolivegreen', rgb: '#556B2F' },
  { name: 'darkorange', rgb: '#FF8C00' },
  { name: 'darkorchid', rgb: '#9932CC' },
  { name: 'darkred', rgb: '#8B0000' },
  { name: 'darksalmon', rgb: '#E9967A' },
  { name: 'darkseagreen', rgb: '#8FBC8F' },
  { name: 'darkslateblue', rgb: '#483D8B' },
  { name: 'darkslategray', rgb: '#2F4F4F' },
  { name: 'darkslategrey', rgb: '#2F4F4F' },
  { name: 'darkturquoise', rgb: '#00CED1' },
  { name: 'darkviolet', rgb: '#9400D3' },
  { name: 'deeppink', rgb: '#FF1493' },
  { name: 'deepskyblue', rgb: '#00BFFF' },
  { name: 'dimgray', rgb: '#696969' },
  { name: 'dimgrey', rgb: '#696969' },
  { name: 'dodgerblue', rgb: '#1E90FF' },
  { name: 'firebrick', rgb: '#B22222' },
  { name: 'floralwhite', rgb: '#FFFAF0' },
  { name: 'forestgreen', rgb: '#228B22' },
  { name: 'fuchsia', rgb: '#FF00FF' },
  { name: 'gainsboro', rgb: '#DCDCDC' },
  { name: 'ghostwhite', rgb: '#F8F8FF' },
  { name: 'gold', rgb: '#FFD700' },
  { name: 'goldenrod', rgb: '#DAA520' },
  { name: 'gray', rgb: '#808080' },
  { name: 'green', rgb: '#008000' },
  { name: 'greenyellow', rgb: '#ADFF2F' },
  { name: 'grey', rgb: '#808080' },
  { name: 'honeydew', rgb: '#F0FFF0' },
  { name: 'hotpink', rgb: '#FF69B4' },
  { name: 'indianred', rgb: '#CD5C5C' },
  { name: 'indigo', rgb: '#4B0082' },
  { name: 'ivory', rgb: '#FFFFF0' },
  { name: 'khaki', rgb: '#F0E68C' },
  { name: 'lavender', rgb: '#E6E6FA' },
  { name: 'lavenderblush', rgb: '#FFF0F5' },
  { name: 'lawngreen', rgb: '#7CFC00' },
  { name: 'lemonchiffon', rgb: '#FFFACD' },
  { name: 'lightblue', rgb: '#ADD8E6' },
  { name: 'lightcoral', rgb: '#F08080' },
  { name: 'lightcyan', rgb: '#E0FFFF' },
  { name: 'lightgoldenrodyellow', rgb: '#FAFAD2' },
  { name: 'lightgray', rgb: '#D3D3D3' },
  { name: 'lightgreen', rgb: '#90EE90' },
  { name: 'lightgrey', rgb: '#D3D3D3' },
  { name: 'lightpink', rgb: '#FFB6C1' },
  { name: 'lightsalmon', rgb: '#FFA07A' },
  { name: 'lightseagreen', rgb: '#20B2AA' },
  { name: 'lightskyblue', rgb: '#87CEFA' },
  { name: 'lightslategray', rgb: '#778899' },
  { name: 'lightslategrey', rgb: '#778899' },
  { name: 'lightsteelblue', rgb: '#B0C4DE' },
  { name: 'lightyellow', rgb: '#FFFFE0' },
  { name: 'lime', rgb: '#00FF00' },
  { name: 'limegreen', rgb: '#32CD32' },
  { name: 'linen', rgb: '#FAF0E6' },
  { name: 'magenta', rgb: '#FF00FF' },
  { name: 'maroon', rgb: '#800000' },
  { name: 'mediumaquamarine', rgb: '#66CDAA' },
  { name: 'mediumblue', rgb: '#0000CD' },
  { name: 'mediumorchid', rgb: '#BA55D3' },
  { name: 'mediumpurple', rgb: '#9370DB' },
  { name: 'mediumseagreen', rgb: '#3CB371' },
  { name: 'mediumslateblue', rgb: '#7B68EE' },
  { name: 'mediumspringgreen', rgb: '#00FA9A' },
  { name: 'mediumturquoise', rgb: '#48D1CC' },
  { name: 'mediumvioletred', rgb: '#C71585' },
  { name: 'midnightblue', rgb: '#191970' },
  { name: 'mintcream', rgb: '#F5FFFA' },
  { name: 'mistyrose', rgb: '#FFE4E1' },
  { name: 'moccasin', rgb: '#FFE4B5' },
  { name: 'navajowhite', rgb: '#FFDEAD' },
  { name: 'navy', rgb: '#000080' },
  { name: 'oldlace', rgb: '#FDF5E6' },
  { name: 'olive', rgb: '#808000' },
  { name: 'olivedrab', rgb: '#6B8E23' },
  { name: 'orange', rgb: '#FFA500' },
  { name: 'orangered', rgb: '#FF4500' },
  { name: 'orchid', rgb: '#DA70D6' },
  { name: 'palegoldenrod', rgb: '#EEE8AA' },
  { name: 'palegreen', rgb: '#98FB98' },
  { name: 'paleturquoise', rgb: '#AFEEEE' },
  { name: 'palevioletred', rgb: '#DB7093' },
  { name: 'papayawhip', rgb: '#FFEFD5' },
  { name: 'peachpuff', rgb: '#FFDAB9' },
  { name: 'peru', rgb: '#CD853F' },
  { name: 'pink', rgb: '#FFC0CB' },
  { name: 'plum', rgb: '#DDA0DD' },
  { name: 'powderblue', rgb: '#B0E0E6' },
  { name: 'purple', rgb: '#800080' },
  { name: 'rebeccapurple', rgb: '#663399' },
  { name: 'red', rgb: '#FF0000' },
  { name: 'rosybrown', rgb: '#BC8F8F' },
  { name: 'royalblue', rgb: '#4169E1' },
  { name: 'saddlebrown', rgb: '#8B4513' },
  { name: 'salmon', rgb: '#FA8072' },
  { name: 'sandybrown', rgb: '#F4A460' },
  { name: 'seagreen', rgb: '#2E8B57' },
  { name: 'seashell', rgb: '#FFF5EE' },
  { name: 'sienna', rgb: '#A0522D' },
  { name: 'silver', rgb: '#C0C0C0' },
  { name: 'skyblue', rgb: '#87CEEB' },
  { name: 'slateblue', rgb: '#6A5ACD' },
  { name: 'slategray', rgb: '#708090' },
  { name: 'slategrey', rgb: '#708090' },
  { name: 'snow', rgb: '#FFFAFA' },
  { name: 'springgreen', rgb: '#00FF7F' },
  { name: 'steelblue', rgb: '#4682B4' },
  { name: 'tan', rgb: '#D2B48C' },
  { name: 'teal', rgb: '#008080' },
  { name: 'thistle', rgb: '#D8BFD8' },
  { name: 'tomato', rgb: '#FF6347' },
  { name: 'turquoise', rgb: '#40E0D0' },
  { name: 'violet', rgb: '#EE82EE' },
  { name: 'wheat', rgb: '#F5DEB3' },
  { name: 'white', rgb: '#FFFFFF' },
  { name: 'whitesmoke', rgb: '#F5F5F5' },
  { name: 'yellow', rgb: '#FFFF00' },
  { name: 'yellowgreen', rgb: '#9ACD32' }
];

// Set DEBUG to true to use a 5 second intervals & 2 second timeouts. Do NOT
// use api.spot-hinta.fi as the data source in debug mode as you'll soon get
// 429 instead of data. Use the mock server instead.
let DEBUG = false;

// Flag for indicating if we're connected or not.
let isConnected = false;

// Prevent anonymous functions
function reportConfigError(res, ec) {
  if( ec )
    console.log("PlusPlugIlluminator: Config update error");
}

// Set LED as requested by the caller
function configureLight(shellyRGB, onBrightness, offBrightness) {

  // Pass color & brightness as a config-ready object.
  let onColorConfig = { rgb: shellyRGB, brightness: onBrightness };

  // Read current config
  let uiConfig = Shelly.getComponentConfig("plugs_ui");

  // Only in switch mode
  if( uiConfig.leds.mode === "switch" ) {

    // Override config's on color & brightness
    uiConfig.leds.colors["switch:0"].on = onColorConfig;

    // Set 'off' brightness; copy needed as otherwise would affects 'on' config
    let offColorConfig = Object.create( onColorConfig );
    offColorConfig.brightness = offBrightness;
    uiConfig.leds.colors["switch:0"].off = offColorConfig;

    // Write back config
    Shelly.call( "PLUGS_UI.SetConfig", { config: uiConfig }, reportConfigError )
  }
  else {
    console.log("PlusPlugIlluminator: Incorrect color mode (", uiConfig.leds.mode, "), should be \"switch\"");
  }
}

// Process API response
function handleResponse(response) {

  // A minimal error protection.
  if( response && response.code === 200 ) {

    // We trust that getting a response is a good enough indicator that we're online
    if( isConnected === false )
      connected();

    // Note! If the server returns a non-parsable JSON string, the following will
    // crash & stop this script from running forever.
    let price = JSON.parse(response.body);

    // Find the current color in reverse order and set lights
    for( let i = (priceColorMap.length - 1); i >= 0 ; i-- ) {
      if( price.PriceWithTax >= priceColorMap[i].fromPriceWithTax) {
        configureLight(
          priceColorMap[i].shellyRGB,
          priceColorMap[i].onBrightness,
          priceColorMap[i].offBrightness
        );
        return true;
      }
    }
    die("PlusPlugIlluminator: price not found in color map, cannot continue.");
  }
  else {
    if( isConnected === false ) {
      disConnected();
    }
  }

  console.log("PlusPlugIlluminator: Backend call failed (invalid response) - cannot change colors");
  return false;
}

// Returns true if current minute is on the quarter hour border
// (x:00, x:15, x:30, x:45) and false otherwise
function isQuarterOfAnHour() {

  let minStr = Shelly.getComponentStatus("sys").time.slice(3,5);

  // use hex conversion because it exists...
  let intMinutes = 10 * hexCharToInt(minStr.at(0)) + hexCharToInt(minStr.at(1));

  // true at x:00, x:15, x:30 and x:45
  return ( intMinutes % 15 === 0);
}

// Run price update unless prohibited
function tick() {
  // When we're not connected, we poll the backend at timer intervals
  // (1 minute). When connected, run every full quarter of an hour.
  if( isConnected === false || ( DEBUG ? true : isQuarterOfAnHour() ) ) {

    console.log("PlusPlugIlluminator: tick");

    Shelly.call(
      "HTTP.GET",
      { url: PRICE_URL, timeout: (DEBUG ? 2 : 10), ssl_ca: "*" },
      handleResponse
    );
  }
}

// Convert a decimal value representing a hexadecimal digit
// ('0','1',...'E','F') into an integer value. Lower case
// strings are supported.
//
// For example "A" (decimal 65) -> 10.
function hexCharToInt(hexChar) {

  if( hexChar > 96 && hexChar < 103 )
    return 10 + (hexChar - 97);
  if( hexChar > 64 && hexChar < 71 )
    return 10 + (hexChar - 65);
  if( hexChar > 47 && hexChar < 58 )
    return (hexChar - 48);

  console.log("PlusPlugIlluminator: invalid hex value", hexChar);

  die("PlusPlugIlluminator: crashing");
}

// Convert a hexadecimal string into an integer value.
// For example, "A3" -> 163
function hexToInt(hex) {
  return 16 * hexCharToInt(hex.at(0)) + hexCharToInt(hex.at(1));
}

// Convert a hexadecimal string into a Shelly flavor of integer
// For example, 'A3' -> 64 (163 / 255 * 100)
function hexToShellyColorValue(hex) {
  return Math.round( hexToInt( hex ) * 0.392156 );
}

// Convert an rgb string to an array of Shelly flavor integers
// For example, #A300FF -> [64 0 100]
function RGBStringToShellyValues(rgbString) {
  return ([
    hexToShellyColorValue(rgbString.slice(1, 3)),
    hexToShellyColorValue(rgbString.slice(3, 5)),
    hexToShellyColorValue(rgbString.slice(5, 7)),
  ]);
}

// Looks up an rgb value for the color name. Crashes if not there
// so you'll know you wrote something silly up in the color map.
function colorNameToRGBString(name){
  // Brute force search
  for( let i=0; i < COLOR_NAMES.length ; i++ ) {
    if( COLOR_NAMES[i].name === name )
      return COLOR_NAMES[i].rgb;
  }
  die("PlusPlugIlluminator: Incorrect color " + name + " in the color map - crashing");
}

// Check a brightness value to be in range [0, 1, ..., 100]
function brightnessInRange(brightness) {
  return ( 0 <= brightness && 100 >= brightness);
}

// Set connected state
function connected() {
  console.log("PlusPlugIlluminator: connected")
  isConnected = true;
}

// Set disconnected state
function disConnected() {
  console.log("PlusPlugIlluminator: disconnected, making LED white.")
  configureLight( RGBStringToShellyValues( colorNameToRGBString("white") ), 50, 10 );
  isConnected = false;
}

// Catch connect / disconnect events and either run a tick or indicate
// the non-connection status immediately. Without these events, it
// might take up to 15 minutes for the state to be apparent.
function handleEvents(eventData) {

  if(!(
    typeof eventData.info           === "object" &&
    typeof eventData.info.component === "string" &&
    typeof eventData.info.event     === "string"
  ))
    return;

  // If cloud is in use, use cloud connect event for restoring LED
  // (e2e connectivity is what counts)
  if( Shelly.getComponentConfig("cloud").enable === true ) {
    if( ( eventData.info.component === "cloud" ) &&
        ( eventData.info.event === "connected" ) ) {
      tick();
    }
  }
  // Otherwise use just wifi connect (ip got)
  else {
    if( ( eventData.info.component === "wifi" ) &&
        ( eventData.info.event === "sta_ip_acquired" ) ) {
      tick();
    }
  }

  // Both cloud & network events are listened for disconnects.
  if( ( ( eventData.info.component === "wifi" ) &&
        ( eventData.info.event === "sta_disconnected" ) )
      ||
      ( ( eventData.info.component === "cloud" ) &&
        ( eventData.info.event === "disconnected" ) )
    ) {
    disConnected();
  }
}

function checkConfig() {

  // Ensure device is in switch mode
  let uiConfig = Shelly.getComponentConfig("plugs_ui");
  if( uiConfig.leds.mode !== "switch" ) {
    uiConfig.leds.mode = "switch";
    Shelly.call( "PLUGS_UI.SetConfig", { config: uiConfig }, reportConfigError )
  }

  // Check that first price-color map entry is zero or lower price
  if( priceColorMap[0].fromPriceWithTax > 0 )
    die("PlusPlugIlluminator: First entry in price map must have price of 0 or less, crashing");

  // Ensure price-color map prices are in rising order
  for( let i=1; i < priceColorMap.length; i++ ) {
    if( priceColorMap[i-1].fromPriceWithTax >= priceColorMap[i].fromPriceWithTax)
      die("PlusPlugIlluminator: Color limits are not in a rising order, crashing.");
  }

  // Ensure price-color map brightness values are in range
  for( let i=0; i < priceColorMap.length; i++ ) {
    if( !brightnessInRange(priceColorMap[i].onBrightness) )
      die("PlusPlugIlluminator: Incorrect ON brightness value for color " + priceColorMap[i].color + ", crashing");
    if( !brightnessInRange(priceColorMap[i].offBrightness) )
      die("PlusPlugIlluminator: Incorrect OFF brightness value for color " + priceColorMap[i].color + ", crashing");
  }

  // Check color validity and precalculate RGB values.
  for( let i=0; i < priceColorMap.length; i++ ) {
    priceColorMap[i].shellyRGB = RGBStringToShellyValues(
      priceColorMap[i].color[0] === '#'
        ? priceColorMap[i].color
        : colorNameToRGBString( priceColorMap[i].color )
    );
  }
}

// Run code
console.log("PlusPlugIlluminator: start at ", Shelly.getComponentStatus("sys").uptime);

// Ensure config is correct or die
checkConfig();

// Attach connect/disconnect event handler
Shelly.addEventHandler( handleEvents );

// Turn the leds white until we have a response from backend
disConnected();

// Make first update
tick();

// Start periodical updates
Timer.set( (DEBUG ? 5000 : MINUTE_MSECS), true, tick );
