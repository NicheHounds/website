/**
 * Client-side sun, moon and timezone location.
 *
 * Nothing here touches the network or the Geolocation API: the visitor's
 * place is guessed only from the IANA time zone the browser reports.
 *
 * Preview overrides (query string):
 *   ?at=2026-06-21T07:00         a moment; without an offset it is read in ?tz
 *                                (or the browser's zone). Time keeps running.
 *   ?tz=Asia/Tokyo               pretend to be in this zone
 *   ?lat=35.7&lon=139.7          pretend to be at this point
 */

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const LOADED_AT = Date.now();

const mod = (value, cycle) => ((value % cycle) + cycle) % cycle;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const julianDay = (date) => date.getTime() / DAY_MS + 2440587.5;

/** Apparent ecliptic longitude of the sun (degrees) and days since J2000. */
function solarLongitude(date) {
  const n = julianDay(date) - 2451545.0;
  const meanLong = 280.460 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  return { n, lambda: mod(meanLong + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g), 360) };
}

/** Subsolar point in degrees (low-precision Meeus, good to ~0.1 deg). */
export function sunPosition(date = now()) {
  const { n, lambda } = solarLongitude(date);
  const lam = lambda * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = mod(280.46061837 + 360.98564736629 * n, 360) * RAD;
  const lon = mod((ra - gmst) / RAD + 180, 360) - 180;
  return { lat: decl / RAD, lon };
}

/** Sun altitude above the horizon in degrees at a place. */
export function solarAltitude(lat, lon, date = now()) {
  const sun = sunPosition(date);
  const phi = lat * RAD;
  const dec = sun.lat * RAD;
  const hour = (lon - sun.lon) * RAD;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hour);
  return Math.asin(clamp(sinAlt, -1, 1)) / RAD;
}

/**
 * Moon phase from the sun-moon elongation, using the largest terms of the
 * lunar longitude series. phase: 0 new, 0.25 first quarter, 0.5 full.
 */
export function moonPhase(date = now()) {
  const { n, lambda: sunLon } = solarLongitude(date);
  const L = 218.316 + 13.176396 * n;
  const Mm = (134.963 + 13.064993 * n) * RAD;
  const Ms = (357.529 + 0.98560028 * n) * RAD;
  const D = (297.850 + 12.190749 * n) * RAD;
  const moonLon = L
    + 6.289 * Math.sin(Mm)
    + 1.274 * Math.sin(2 * D - Mm)
    + 0.658 * Math.sin(2 * D)
    + 0.214 * Math.sin(2 * Mm)
    - 0.186 * Math.sin(Ms)
    - 0.114 * Math.sin(2 * ((93.272 + 13.229350 * n) * RAD));
  const elongation = mod(moonLon - sunLon, 360);
  const phase = elongation / 360;
  return {
    phase,
    illumination: (1 - Math.cos(elongation * RAD)) / 2,
    waxing: phase < 0.5,
    age: phase * 29.530588853,
  };
}

/* ------------------------------------------------------------------------ */
/* Preview overrides                                                         */
/* ------------------------------------------------------------------------ */

let cachedSearch = null;
let cachedParams = null;

function isValidZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function systemZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Minutes east of UTC for a zone at a given instant. */
function zoneOffsetMinutes(tz, date) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    const p = {};
    for (const part of dtf.formatToParts(date)) p[part.type] = +part.value;
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    return Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  } catch {
    return -date.getTimezoneOffset();
  }
}

/** Parse ?at. A bare local time (no Z or offset) is read as wall time in `tz`. */
function parseAt(raw, tz) {
  // An unencoded '+' in "+09:00" arrives as a space.
  const text = raw.trim().replace(/(T\d\d:\d\d(?::\d\d(?:\.\d+)?)?) (\d\d:?\d\d)$/, '$1+$2');
  const bare = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/.exec(text);
  if (bare && tz) {
    const [, y, mo, d, h = 12, mi = 0, s = 0] = bare;
    const wall = Date.UTC(+y, mo - 1, +d, +h, +mi, +s);
    let t = wall - zoneOffsetMinutes(tz, new Date(wall)) * 60000;
    t = wall - zoneOffsetMinutes(tz, new Date(t)) * 60000; // settle across DST edges
    return new Date(t);
  }
  const t = Date.parse(text);
  return Number.isFinite(t) ? new Date(t) : undefined;
}

/**
 * Overrides from the page URL: { date, lat, lon, tz }, each undefined when
 * absent or invalid.
 */
export function previewParams() {
  const search = typeof location !== 'undefined' ? location.search : '';
  if (search === cachedSearch) return cachedParams;
  const q = new URLSearchParams(search);
  const num = (key, limit) => {
    const v = q.has(key) ? parseFloat(q.get(key)) : NaN;
    return Number.isFinite(v) && Math.abs(v) <= limit ? v : undefined;
  };
  const tzRaw = q.get('tz');
  const tz = tzRaw && isValidZone(tzRaw) ? tzRaw : undefined;
  const atRaw = q.get('at');
  cachedSearch = search;
  cachedParams = {
    date: atRaw ? parseAt(atRaw, tz || systemZone()) : undefined,
    lat: num('lat', 90),
    lon: num('lon', 180),
    tz,
  };
  return cachedParams;
}

/** Current time, or the ?at moment advancing at real speed from page load. */
export function now() {
  const { date } = previewParams();
  return date ? new Date(date.getTime() + (Date.now() - LOADED_AT)) : new Date();
}

/* ------------------------------------------------------------------------ */
/* Time zone -> representative place                                         */
/* ------------------------------------------------------------------------ */

const ZONES = {
  // United States
  'America/New_York': [40.71, -74.01],
  'America/Detroit': [42.33, -83.05],
  'America/Kentucky/Louisville': [38.25, -85.76],
  'America/Kentucky/Monticello': [36.83, -84.85],
  'America/Indiana/Indianapolis': [39.77, -86.16],
  'America/Indiana/Vincennes': [38.68, -87.53],
  'America/Indiana/Winamac': [41.05, -86.6],
  'America/Indiana/Marengo': [38.37, -86.34],
  'America/Indiana/Petersburg': [38.49, -87.28],
  'America/Indiana/Vevay': [38.75, -85.07],
  'America/Indiana/Tell_City': [37.95, -86.76],
  'America/Indiana/Knox': [41.3, -86.63],
  'America/Chicago': [41.88, -87.63],
  'America/Menominee': [45.11, -87.61],
  'America/North_Dakota/Center': [47.12, -101.3],
  'America/North_Dakota/New_Salem': [46.85, -101.41],
  'America/North_Dakota/Beulah': [47.26, -101.78],
  'America/Denver': [39.74, -104.99],
  'America/Boise': [43.62, -116.21],
  'America/Phoenix': [33.45, -112.07],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Anchorage': [61.22, -149.9],
  'America/Juneau': [58.3, -134.42],
  'America/Sitka': [57.05, -135.33],
  'America/Metlakatla': [55.13, -131.57],
  'America/Yakutat': [59.55, -139.73],
  'America/Nome': [64.5, -165.41],
  'America/Adak': [51.88, -176.66],
  'Pacific/Honolulu': [21.31, -157.86],
  // Canada
  'America/St_Johns': [47.56, -52.71],
  'America/Halifax': [44.65, -63.57],
  'America/Glace_Bay': [46.2, -59.96],
  'America/Moncton': [46.09, -64.77],
  'America/Goose_Bay': [53.3, -60.42],
  'America/Blanc-Sablon': [51.43, -57.13],
  'America/Toronto': [43.65, -79.38],
  'America/Nipigon': [49.02, -88.27],
  'America/Thunder_Bay': [48.38, -89.25],
  'America/Iqaluit': [63.75, -68.52],
  'America/Pangnirtung': [66.15, -65.7],
  'America/Atikokan': [48.76, -91.62],
  'America/Winnipeg': [49.9, -97.14],
  'America/Rainy_River': [48.72, -94.57],
  'America/Resolute': [74.7, -94.83],
  'America/Rankin_Inlet': [62.81, -92.09],
  'America/Regina': [50.45, -104.62],
  'America/Swift_Current': [50.29, -107.79],
  'America/Edmonton': [53.55, -113.49],
  'America/Cambridge_Bay': [69.12, -105.06],
  'America/Yellowknife': [62.45, -114.37],
  'America/Inuvik': [68.36, -133.72],
  'America/Creston': [49.1, -116.51],
  'America/Dawson_Creek': [55.76, -120.24],
  'America/Fort_Nelson': [58.81, -122.7],
  'America/Whitehorse': [60.72, -135.05],
  'America/Dawson': [64.06, -139.43],
  'America/Vancouver': [49.28, -123.12],
  // Mexico, Central America, Caribbean
  'America/Mexico_City': [19.43, -99.13],
  'America/Cancun': [21.16, -86.85],
  'America/Merida': [20.97, -89.62],
  'America/Monterrey': [25.67, -100.31],
  'America/Matamoros': [25.87, -97.5],
  'America/Chihuahua': [28.63, -106.09],
  'America/Ciudad_Juarez': [31.69, -106.42],
  'America/Ojinaga': [29.56, -104.41],
  'America/Mazatlan': [23.25, -106.41],
  'America/Bahia_Banderas': [20.8, -105.25],
  'America/Hermosillo': [29.07, -110.96],
  'America/Tijuana': [32.51, -117.04],
  'America/Guatemala': [14.63, -90.51],
  'America/Belize': [17.5, -88.2],
  'America/El_Salvador': [13.69, -89.22],
  'America/Tegucigalpa': [14.07, -87.19],
  'America/Managua': [12.11, -86.24],
  'America/Costa_Rica': [9.93, -84.08],
  'America/Panama': [8.98, -79.52],
  'America/Havana': [23.11, -82.37],
  'America/Jamaica': [18.02, -76.81],
  'America/Port-au-Prince': [18.54, -72.34],
  'America/Santo_Domingo': [18.49, -69.93],
  'America/Puerto_Rico': [18.47, -66.11],
  'America/St_Thomas': [18.34, -64.93],
  'America/Tortola': [18.43, -64.62],
  'America/Anguilla': [18.22, -63.05],
  'America/St_Kitts': [17.3, -62.72],
  'America/Antigua': [17.12, -61.85],
  'America/Montserrat': [16.71, -62.22],
  'America/Guadeloupe': [16.24, -61.53],
  'America/Dominica': [15.3, -61.39],
  'America/Martinique': [14.6, -61.07],
  'America/St_Lucia': [14.01, -60.99],
  'America/St_Vincent': [13.16, -61.23],
  'America/Barbados': [13.1, -59.62],
  'America/Grenada': [12.05, -61.75],
  'America/Port_of_Spain': [10.65, -61.52],
  'America/Curacao': [12.11, -68.93],
  'America/Aruba': [12.52, -70.03],
  'America/Kralendijk': [12.15, -68.27],
  'America/Lower_Princes': [18.03, -63.05],
  'America/Marigot': [18.07, -63.08],
  'America/St_Barthelemy': [17.9, -62.85],
  'America/Nassau': [25.05, -77.35],
  'America/Grand_Turk': [21.47, -71.14],
  'America/Cayman': [19.29, -81.37],
  'Atlantic/Bermuda': [32.29, -64.78],
  // South America
  'America/Bogota': [4.71, -74.07],
  'America/Caracas': [10.48, -66.9],
  'America/Guyana': [6.8, -58.16],
  'America/Paramaribo': [5.85, -55.2],
  'America/Cayenne': [4.94, -52.33],
  'America/Guayaquil': [-2.17, -79.92],
  'America/Lima': [-12.05, -77.04],
  'America/La_Paz': [-16.5, -68.15],
  'America/Santiago': [-33.45, -70.67],
  'America/Punta_Arenas': [-53.16, -70.91],
  'America/Asuncion': [-25.29, -57.65],
  'America/Montevideo': [-34.9, -56.19],
  'America/Argentina/Buenos_Aires': [-34.6, -58.38],
  'America/Argentina/Cordoba': [-31.42, -64.18],
  'America/Argentina/Salta': [-24.79, -65.41],
  'America/Argentina/Jujuy': [-24.19, -65.3],
  'America/Argentina/Tucuman': [-26.82, -65.22],
  'America/Argentina/Catamarca': [-28.47, -65.78],
  'America/Argentina/La_Rioja': [-29.41, -66.86],
  'America/Argentina/San_Juan': [-31.54, -68.54],
  'America/Argentina/Mendoza': [-32.89, -68.83],
  'America/Argentina/San_Luis': [-33.3, -66.34],
  'America/Argentina/Rio_Gallegos': [-51.62, -69.22],
  'America/Argentina/Ushuaia': [-54.8, -68.3],
  'America/Sao_Paulo': [-23.55, -46.63],
  'America/Bahia': [-12.97, -38.5],
  'America/Fortaleza': [-3.73, -38.53],
  'America/Recife': [-8.05, -34.88],
  'America/Maceio': [-9.67, -35.74],
  'America/Araguaina': [-7.19, -48.21],
  'America/Belem': [-1.46, -48.5],
  'America/Santarem': [-2.44, -54.71],
  'America/Manaus': [-3.12, -60.02],
  'America/Boa_Vista': [2.82, -60.67],
  'America/Porto_Velho': [-8.76, -63.9],
  'America/Rio_Branco': [-9.97, -67.81],
  'America/Eirunepe': [-6.66, -69.87],
  'America/Cuiaba': [-15.6, -56.1],
  'America/Campo_Grande': [-20.47, -54.62],
  'America/Noronha': [-3.85, -32.42],
  'Atlantic/Stanley': [-51.7, -57.86],
  'Atlantic/South_Georgia': [-54.28, -36.51],
  // Greenland and North Atlantic
  'America/Nuuk': [64.18, -51.72],
  'America/Danmarkshavn': [76.77, -18.67],
  'America/Scoresbysund': [70.48, -21.97],
  'America/Thule': [76.53, -68.7],
  'America/Miquelon': [47.1, -56.38],
  'Atlantic/Reykjavik': [64.15, -21.94],
  'Atlantic/Faroe': [62.01, -6.77],
  'Atlantic/Azores': [37.74, -25.67],
  'Atlantic/Madeira': [32.65, -16.91],
  'Atlantic/Canary': [28.12, -15.43],
  'Atlantic/Cape_Verde': [14.93, -23.51],
  'Atlantic/St_Helena': [-15.92, -5.72],
  // Europe
  'Europe/London': [51.51, -0.13],
  'Europe/Dublin': [53.35, -6.26],
  'Europe/Guernsey': [49.45, -2.54],
  'Europe/Jersey': [49.19, -2.11],
  'Europe/Isle_of_Man': [54.15, -4.48],
  'Europe/Lisbon': [38.72, -9.14],
  'Europe/Madrid': [40.42, -3.7],
  'Europe/Gibraltar': [36.14, -5.35],
  'Europe/Andorra': [42.51, 1.52],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Monaco': [43.74, 7.42],
  'Europe/Brussels': [50.85, 4.35],
  'Europe/Luxembourg': [49.61, 6.13],
  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Berlin': [52.52, 13.41],
  'Europe/Busingen': [47.7, 8.69],
  'Europe/Zurich': [47.38, 8.54],
  'Europe/Vaduz': [47.14, 9.52],
  'Europe/Vienna': [48.21, 16.37],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Vatican': [41.9, 12.45],
  'Europe/San_Marino': [43.94, 12.45],
  'Europe/Malta': [35.9, 14.51],
  'Europe/Ljubljana': [46.06, 14.51],
  'Europe/Zagreb': [45.81, 15.98],
  'Europe/Sarajevo': [43.86, 18.41],
  'Europe/Belgrade': [44.79, 20.45],
  'Europe/Podgorica': [42.44, 19.26],
  'Europe/Skopje': [41.99, 21.43],
  'Europe/Tirane': [41.33, 19.82],
  'Europe/Sofia': [42.7, 23.32],
  'Europe/Bucharest': [44.43, 26.1],
  'Europe/Chisinau': [47.01, 28.86],
  'Europe/Budapest': [47.5, 19.04],
  'Europe/Bratislava': [48.15, 17.11],
  'Europe/Prague': [50.08, 14.44],
  'Europe/Warsaw': [52.23, 21.01],
  'Europe/Vilnius': [54.69, 25.28],
  'Europe/Riga': [56.95, 24.11],
  'Europe/Tallinn': [59.44, 24.75],
  'Europe/Helsinki': [60.17, 24.94],
  'Europe/Mariehamn': [60.1, 19.94],
  'Europe/Stockholm': [59.33, 18.07],
  'Europe/Oslo': [59.91, 10.75],
  'Arctic/Longyearbyen': [78.22, 15.65],
  'Europe/Copenhagen': [55.68, 12.57],
  'Europe/Athens': [37.98, 23.73],
  'Europe/Istanbul': [41.01, 28.98],
  'Europe/Nicosia': [35.19, 33.38],
  'Asia/Nicosia': [35.19, 33.38],
  'Asia/Famagusta': [35.12, 33.94],
  'Europe/Kyiv': [50.45, 30.52],
  'Europe/Uzhgorod': [48.62, 22.29],
  'Europe/Zaporozhye': [47.84, 35.14],
  'Europe/Simferopol': [44.95, 34.1],
  'Europe/Minsk': [53.9, 27.57],
  'Europe/Kaliningrad': [54.71, 20.51],
  'Europe/Moscow': [55.76, 37.62],
  'Europe/Kirov': [58.6, 49.66],
  'Europe/Volgograd': [48.71, 44.51],
  'Europe/Astrakhan': [46.35, 48.04],
  'Europe/Saratov': [51.53, 46.03],
  'Europe/Ulyanovsk': [54.31, 48.4],
  'Europe/Samara': [53.2, 50.15],
  // Middle East, Caucasus, Central and South Asia
  'Asia/Jerusalem': [31.77, 35.21],
  'Asia/Gaza': [31.5, 34.47],
  'Asia/Hebron': [31.53, 35.1],
  'Asia/Beirut': [33.89, 35.5],
  'Asia/Damascus': [33.51, 36.29],
  'Asia/Amman': [31.95, 35.93],
  'Asia/Baghdad': [33.32, 44.37],
  'Asia/Kuwait': [29.38, 47.99],
  'Asia/Riyadh': [24.71, 46.68],
  'Asia/Bahrain': [26.23, 50.59],
  'Asia/Qatar': [25.29, 51.53],
  'Asia/Dubai': [25.2, 55.27],
  'Asia/Muscat': [23.59, 58.41],
  'Asia/Aden': [12.79, 45.04],
  'Asia/Tehran': [35.69, 51.39],
  'Asia/Tbilisi': [41.72, 44.79],
  'Asia/Yerevan': [40.18, 44.51],
  'Asia/Baku': [40.41, 49.87],
  'Asia/Kabul': [34.56, 69.21],
  'Asia/Karachi': [24.86, 67.01],
  'Asia/Kolkata': [22.5, 79.0],
  'Asia/Colombo': [6.93, 79.85],
  'Asia/Kathmandu': [27.72, 85.32],
  'Asia/Thimphu': [27.47, 89.64],
  'Asia/Dhaka': [23.81, 90.41],
  'Indian/Maldives': [4.18, 73.51],
  'Indian/Chagos': [-7.31, 72.41],
  'Asia/Tashkent': [41.3, 69.24],
  'Asia/Samarkand': [39.65, 66.96],
  'Asia/Dushanbe': [38.56, 68.79],
  'Asia/Ashgabat': [37.96, 58.33],
  'Asia/Bishkek': [42.87, 74.59],
  'Asia/Almaty': [43.24, 76.95],
  'Asia/Qostanay': [53.21, 63.62],
  'Asia/Qyzylorda': [44.85, 65.51],
  'Asia/Aqtobe': [50.28, 57.17],
  'Asia/Aqtau': [43.65, 51.17],
  'Asia/Atyrau': [47.1, 51.92],
  'Asia/Oral': [51.23, 51.37],
  // Russia east of the Urals
  'Asia/Yekaterinburg': [56.84, 60.61],
  'Asia/Omsk': [54.99, 73.37],
  'Asia/Novosibirsk': [55.03, 82.92],
  'Asia/Barnaul': [53.35, 83.78],
  'Asia/Tomsk': [56.5, 84.97],
  'Asia/Novokuznetsk': [53.76, 87.12],
  'Asia/Krasnoyarsk': [56.02, 92.87],
  'Asia/Irkutsk': [52.29, 104.3],
  'Asia/Chita': [52.03, 113.5],
  'Asia/Yakutsk': [62.03, 129.73],
  'Asia/Khandyga': [62.66, 135.55],
  'Asia/Vladivostok': [43.12, 131.89],
  'Asia/Ust-Nera': [64.57, 143.2],
  'Asia/Magadan': [59.56, 150.8],
  'Asia/Sakhalin': [46.96, 142.73],
  'Asia/Srednekolymsk': [67.45, 153.71],
  'Asia/Kamchatka': [53.02, 158.65],
  'Asia/Anadyr': [64.73, 177.51],
  // East and Southeast Asia
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Urumqi': [43.83, 87.62],
  'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Macau': [22.2, 113.54],
  'Asia/Taipei': [25.03, 121.57],
  'Asia/Tokyo': [35.68, 139.69],
  'Asia/Seoul': [37.57, 126.98],
  'Asia/Pyongyang': [39.04, 125.76],
  'Asia/Ulaanbaatar': [47.89, 106.91],
  'Asia/Hovd': [48.01, 91.64],
  'Asia/Choibalsan': [48.07, 114.53],
  'Asia/Yangon': [16.87, 96.2],
  'Asia/Bangkok': [13.76, 100.5],
  'Asia/Vientiane': [17.97, 102.63],
  'Asia/Phnom_Penh': [11.56, 104.92],
  'Asia/Ho_Chi_Minh': [10.82, 106.63],
  'Asia/Kuala_Lumpur': [3.14, 101.69],
  'Asia/Kuching': [1.55, 110.34],
  'Asia/Singapore': [1.35, 103.82],
  'Asia/Brunei': [4.89, 114.94],
  'Asia/Manila': [14.6, 120.98],
  'Asia/Jakarta': [-6.21, 106.85],
  'Asia/Pontianak': [-0.03, 109.34],
  'Asia/Makassar': [-5.15, 119.42],
  'Asia/Jayapura': [-2.53, 140.72],
  'Asia/Dili': [-8.56, 125.57],
  // Africa
  'Africa/Cairo': [30.04, 31.24],
  'Africa/Tripoli': [32.89, 13.19],
  'Africa/Tunis': [36.81, 10.18],
  'Africa/Algiers': [36.75, 3.06],
  'Africa/Casablanca': [33.57, -7.59],
  'Africa/El_Aaiun': [27.15, -13.2],
  'Africa/Ceuta': [35.89, -5.32],
  'Africa/Nouakchott': [18.08, -15.98],
  'Africa/Dakar': [14.72, -17.47],
  'Africa/Banjul': [13.45, -16.58],
  'Africa/Bissau': [11.86, -15.6],
  'Africa/Conakry': [9.64, -13.58],
  'Africa/Freetown': [8.48, -13.23],
  'Africa/Monrovia': [6.3, -10.8],
  'Africa/Abidjan': [5.36, -4.01],
  'Africa/Bamako': [12.64, -8.0],
  'Africa/Ouagadougou': [12.37, -1.52],
  'Africa/Accra': [5.6, -0.19],
  'Africa/Lome': [6.13, 1.22],
  'Africa/Porto-Novo': [6.5, 2.6],
  'Africa/Niamey': [13.51, 2.11],
  'Africa/Lagos': [6.52, 3.38],
  'Africa/Ndjamena': [12.13, 15.06],
  'Africa/Douala': [4.05, 9.77],
  'Africa/Malabo': [3.75, 8.78],
  'Africa/Sao_Tome': [0.34, 6.73],
  'Africa/Libreville': [0.42, 9.47],
  'Africa/Bangui': [4.39, 18.56],
  'Africa/Brazzaville': [-4.26, 15.24],
  'Africa/Kinshasa': [-4.32, 15.31],
  'Africa/Lubumbashi': [-11.66, 27.48],
  'Africa/Luanda': [-8.84, 13.23],
  'Africa/Khartoum': [15.5, 32.56],
  'Africa/Juba': [4.86, 31.57],
  'Africa/Addis_Ababa': [9.03, 38.75],
  'Africa/Asmara': [15.32, 38.93],
  'Africa/Djibouti': [11.59, 43.15],
  'Africa/Mogadishu': [2.05, 45.32],
  'Africa/Nairobi': [-1.29, 36.82],
  'Africa/Kampala': [0.35, 32.58],
  'Africa/Kigali': [-1.95, 30.06],
  'Africa/Bujumbura': [-3.38, 29.36],
  'Africa/Dar_es_Salaam': [-6.79, 39.21],
  'Africa/Lusaka': [-15.39, 28.32],
  'Africa/Blantyre': [-15.79, 35.01],
  'Africa/Harare': [-17.83, 31.05],
  'Africa/Maputo': [-25.97, 32.57],
  'Africa/Gaborone': [-24.65, 25.91],
  'Africa/Windhoek': [-22.56, 17.08],
  'Africa/Johannesburg': [-26.2, 28.05],
  'Africa/Maseru': [-29.31, 27.48],
  'Africa/Mbabane': [-26.31, 31.14],
  'Indian/Antananarivo': [-18.88, 47.51],
  'Indian/Comoro': [-11.7, 43.26],
  'Indian/Mayotte': [-12.78, 45.23],
  'Indian/Mauritius': [-20.16, 57.5],
  'Indian/Reunion': [-20.88, 55.45],
  'Indian/Mahe': [-4.62, 55.45],
  'Indian/Christmas': [-10.42, 105.68],
  'Indian/Cocos': [-12.19, 96.83],
  'Indian/Kerguelen': [-49.35, 70.22],
  // Australia and Oceania
  'Australia/Sydney': [-33.87, 151.21],
  'Australia/Melbourne': [-37.81, 144.96],
  'Australia/Brisbane': [-27.47, 153.03],
  'Australia/Lindeman': [-20.27, 149.0],
  'Australia/Hobart': [-42.88, 147.33],
  'Australia/Adelaide': [-34.93, 138.6],
  'Australia/Broken_Hill': [-31.95, 141.47],
  'Australia/Darwin': [-12.46, 130.84],
  'Australia/Perth': [-31.95, 115.86],
  'Australia/Eucla': [-31.68, 128.88],
  'Australia/Lord_Howe': [-31.55, 159.08],
  'Antarctica/Macquarie': [-54.5, 158.95],
  'Pacific/Auckland': [-36.85, 174.76],
  'Pacific/Chatham': [-43.95, -176.55],
  'Pacific/Norfolk': [-29.06, 167.96],
  'Pacific/Fiji': [-18.14, 178.44],
  'Pacific/Noumea': [-22.28, 166.46],
  'Pacific/Efate': [-17.73, 168.32],
  'Pacific/Guadalcanal': [-9.43, 159.95],
  'Pacific/Bougainville': [-6.23, 155.57],
  'Pacific/Port_Moresby': [-9.44, 147.18],
  'Pacific/Guam': [13.44, 144.79],
  'Pacific/Saipan': [15.18, 145.75],
  'Pacific/Palau': [7.34, 134.48],
  'Pacific/Chuuk': [7.45, 151.85],
  'Pacific/Pohnpei': [6.96, 158.21],
  'Pacific/Kosrae': [5.32, 162.98],
  'Pacific/Majuro': [7.09, 171.38],
  'Pacific/Kwajalein': [8.72, 167.73],
  'Pacific/Nauru': [-0.52, 166.93],
  'Pacific/Tarawa': [1.33, 172.98],
  'Pacific/Kanton': [-2.81, -171.67],
  'Pacific/Kiritimati': [1.87, -157.43],
  'Pacific/Funafuti': [-8.52, 179.2],
  'Pacific/Wallis': [-13.28, -176.17],
  'Pacific/Tongatapu': [-21.13, -175.2],
  'Pacific/Apia': [-13.83, -171.77],
  'Pacific/Pago_Pago': [-14.28, -170.7],
  'Pacific/Niue': [-19.06, -169.92],
  'Pacific/Fakaofo': [-9.38, -171.25],
  'Pacific/Rarotonga': [-21.21, -159.78],
  'Pacific/Tahiti': [-17.65, -149.43],
  'Pacific/Marquesas': [-9.0, -139.5],
  'Pacific/Gambier': [-23.12, -134.97],
  'Pacific/Pitcairn': [-25.07, -130.1],
  'Pacific/Easter': [-27.11, -109.35],
  'Pacific/Galapagos': [-0.95, -90.97],
  'Pacific/Midway': [28.21, -177.38],
  'Pacific/Wake': [19.28, 166.65],
  // Antarctica (research stations)
  'Antarctica/McMurdo': [-77.85, 166.67],
  'Antarctica/Casey': [-66.28, 110.53],
  'Antarctica/Davis': [-68.58, 77.97],
  'Antarctica/Mawson': [-67.6, 62.87],
  'Antarctica/Palmer': [-64.77, -64.05],
  'Antarctica/Rothera': [-67.57, -68.13],
  'Antarctica/Syowa': [-69.0, 39.58],
  'Antarctica/Troll': [-72.01, 2.53],
  'Antarctica/Vostok': [-78.46, 106.84],
  'Antarctica/DumontDUrville': [-66.66, 140.0],
  // UTC
  'UTC': [51.48, 0],
  'Etc/UTC': [51.48, 0],
  'Etc/GMT': [51.48, 0],
};

/** Legacy and alternate names that browsers still report. */
const ALIASES = {
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
  'US/Arizona': 'America/Phoenix',
  'US/Alaska': 'America/Anchorage',
  'US/Aleutian': 'America/Adak',
  'US/Hawaii': 'Pacific/Honolulu',
  'US/Michigan': 'America/Detroit',
  'US/East-Indiana': 'America/Indiana/Indianapolis',
  'US/Indiana-Starke': 'America/Indiana/Knox',
  'US/Samoa': 'Pacific/Pago_Pago',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Fort_Wayne': 'America/Indiana/Indianapolis',
  'America/Knox_IN': 'America/Indiana/Knox',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Shiprock': 'America/Denver',
  'America/Atka': 'America/Adak',
  'America/Virgin': 'America/St_Thomas',
  'America/Ensenada': 'America/Tijuana',
  'America/Santa_Isabel': 'America/Tijuana',
  'America/Montreal': 'America/Toronto',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Godthab': 'America/Nuuk',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Argentina/ComodRivadavia': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Rosario': 'America/Argentina/Cordoba',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'America/Porto_Acre': 'America/Rio_Branco',
  'Canada/Eastern': 'America/Toronto',
  'Canada/Central': 'America/Winnipeg',
  'Canada/Mountain': 'America/Edmonton',
  'Canada/Pacific': 'America/Vancouver',
  'Canada/Atlantic': 'America/Halifax',
  'Canada/Newfoundland': 'America/St_Johns',
  'Canada/Saskatchewan': 'America/Regina',
  'Canada/Yukon': 'America/Whitehorse',
  'Mexico/General': 'America/Mexico_City',
  'Mexico/BajaNorte': 'America/Tijuana',
  'Mexico/BajaSur': 'America/Mazatlan',
  'Brazil/East': 'America/Sao_Paulo',
  'Brazil/West': 'America/Manaus',
  'Brazil/Acre': 'America/Rio_Branco',
  'Brazil/DeNoronha': 'America/Noronha',
  'Chile/Continental': 'America/Santiago',
  'Chile/EasterIsland': 'Pacific/Easter',
  'Cuba': 'America/Havana',
  'Jamaica': 'America/Jamaica',
  'Navajo': 'America/Denver',
  'GB': 'Europe/London',
  'GB-Eire': 'Europe/London',
  'Europe/Belfast': 'Europe/London',
  'Eire': 'Europe/Dublin',
  'Portugal': 'Europe/Lisbon',
  'Poland': 'Europe/Warsaw',
  'Iceland': 'Atlantic/Reykjavik',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Atlantic/Jan_Mayen': 'Arctic/Longyearbyen',
  'Europe/Kiev': 'Europe/Kyiv',
  'Europe/Tiraspol': 'Europe/Chisinau',
  'Turkey': 'Europe/Istanbul',
  'Asia/Istanbul': 'Europe/Istanbul',
  'W-SU': 'Europe/Moscow',
  'Egypt': 'Africa/Cairo',
  'Libya': 'Africa/Tripoli',
  'Africa/Asmera': 'Africa/Asmara',
  'Africa/Timbuktu': 'Africa/Bamako',
  'Israel': 'Asia/Jerusalem',
  'Asia/Tel_Aviv': 'Asia/Jerusalem',
  'Iran': 'Asia/Tehran',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Dacca': 'Asia/Dhaka',
  'Asia/Thimbu': 'Asia/Thimphu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Ashkhabad': 'Asia/Ashgabat',
  'Asia/Ulan_Bator': 'Asia/Ulaanbaatar',
  'Asia/Chongqing': 'Asia/Shanghai',
  'Asia/Chungking': 'Asia/Shanghai',
  'Asia/Harbin': 'Asia/Shanghai',
  'Asia/Kashgar': 'Asia/Urumqi',
  'Asia/Macao': 'Asia/Macau',
  'Asia/Ujung_Pandang': 'Asia/Makassar',
  'PRC': 'Asia/Shanghai',
  'ROC': 'Asia/Taipei',
  'ROK': 'Asia/Seoul',
  'Japan': 'Asia/Tokyo',
  'Hongkong': 'Asia/Hong_Kong',
  'Singapore': 'Asia/Singapore',
  'Australia/ACT': 'Australia/Sydney',
  'Australia/Canberra': 'Australia/Sydney',
  'Australia/NSW': 'Australia/Sydney',
  'Australia/Victoria': 'Australia/Melbourne',
  'Australia/Queensland': 'Australia/Brisbane',
  'Australia/Tasmania': 'Australia/Hobart',
  'Australia/Currie': 'Australia/Hobart',
  'Australia/South': 'Australia/Adelaide',
  'Australia/Yancowinna': 'Australia/Broken_Hill',
  'Australia/North': 'Australia/Darwin',
  'Australia/West': 'Australia/Perth',
  'Australia/LHI': 'Australia/Lord_Howe',
  'NZ': 'Pacific/Auckland',
  'NZ-CHAT': 'Pacific/Chatham',
  'Antarctica/South_Pole': 'Antarctica/McMurdo',
  'Pacific/Samoa': 'Pacific/Pago_Pago',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Yap': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Johnston': 'Pacific/Honolulu',
  'Kwajalein': 'Pacific/Kwajalein',
  'US/Pacific-New': 'America/Los_Angeles',
  'Etc/Universal': 'UTC',
  'Etc/Zulu': 'UTC',
  'Etc/UCT': 'UTC',
  'Etc/Greenwich': 'UTC',
  'Etc/GMT0': 'UTC',
  'Etc/GMT+0': 'UTC',
  'Etc/GMT-0': 'UTC',
  'Universal': 'UTC',
  'Zulu': 'UTC',
  'UCT': 'UTC',
  'GMT': 'UTC',
  'Greenwich': 'UTC',
};

/** Representative place for an IANA zone, falling back to its UTC offset. */
export function locationFromTimeZone(timeZone, date = now()) {
  const zone = timeZone || 'UTC';
  const point = ZONES[zone] || ZONES[ALIASES[zone]];
  if (point) return { lat: point[0], lon: point[1], timeZone: zone };
  const offsetHours = zoneOffsetMinutes(zone, date) / 60;
  return {
    lat: 20,
    lon: mod(offsetHours * 15 + 180, 360) - 180,
    timeZone: zone,
    approximate: true,
  };
}

/**
 * Where the visitor probably is, from the browser's time zone only.
 * Honors ?tz and ?lat/?lon preview overrides.
 */
export function browserLocation(date = now()) {
  const p = previewParams();
  const loc = locationFromTimeZone(p.tz || systemZone(), date);
  if (p.lat !== undefined) loc.lat = p.lat;
  if (p.lon !== undefined) loc.lon = p.lon;
  return loc;
}
