/**
 * Client-side sun, moon, and timezone location.
 * No network. Location comes only from the IANA zone reported by Intl.
 */

const RAD = Math.PI / 180;

function mod(value, cycle) {
  return ((value % cycle) + cycle) % cycle;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Subsolar point. Meeus-style low-precision solar coordinates. */
export function sunPosition(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const meanLong = mod(280.460 + 0.9856474 * n, 360);
  const anomaly = mod(357.528 + 0.9856003 * n, 360) * RAD;
  const lambda = mod(meanLong + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly), 360) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  if (ra < 0) ra += Math.PI * 2;
  const gmst = mod(280.46061837 + 360.98564736629 * n, 360) * RAD;
  let lon = ((ra - gmst) / RAD);
  lon = mod(lon + 180, 360) - 180;
  return { lat: decl / RAD, lon, decl };
}

/**
 * Moon phase from the synodic month.
 * phase 0 = new, 0.5 = full. illumination 0..1.
 */
export function moonPhase(date) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const synodic = 29.530588853;
  const knownNew = 2451550.09766; // 2000-01-06 14:24 UT
  const age = mod(jd - knownNew, synodic);
  const phase = age / synodic;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  return { age, phase, illumination };
}

/** Altitude of the sun at lat/lon, plus hour angle (+ west / afternoon). */
export function solarView(latDeg, lonDeg, sun) {
  const lat = latDeg * RAD;
  const dec = sun.lat * RAD;
  let hour = (lonDeg - sun.lon) * RAD;
  hour = Math.atan2(Math.sin(hour), Math.cos(hour));
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hour);
  return { alt: Math.asin(clamp(sinAlt, -1, 1)), hourAngle: hour };
}

/** Representative latitude and longitude for an IANA timezone. */
const TZ = {
  "America/New_York": [40.71, -74.01],
  "America/Detroit": [42.33, -83.05],
  "America/Kentucky/Louisville": [38.25, -85.76],
  "America/Indiana/Indianapolis": [39.77, -86.16],
  "America/Chicago": [41.88, -87.63],
  "America/Denver": [39.74, -104.99],
  "America/Boise": [43.62, -116.21],
  "America/Phoenix": [33.45, -112.07],
  "America/Los_Angeles": [34.05, -118.24],
  "America/Anchorage": [61.22, -149.9],
  "America/Juneau": [58.3, -134.42],
  "America/Sitka": [57.05, -135.33],
  "America/Nome": [64.5, -165.41],
  "America/Adak": [51.88, -176.66],
  "America/Puerto_Rico": [18.47, -66.11],
  "America/St_Thomas": [18.34, -64.93],
  "America/Toronto": [43.65, -79.38],
  "America/Vancouver": [49.28, -123.12],
  "America/Edmonton": [53.55, -113.49],
  "America/Winnipeg": [49.9, -97.14],
  "America/Halifax": [44.65, -63.57],
  "America/St_Johns": [47.56, -52.71],
  "America/Regina": [50.45, -104.62],
  "America/Whitehorse": [60.72, -135.05],
  "America/Yellowknife": [62.45, -114.37],
  "America/Iqaluit": [63.75, -68.52],
  "America/Moncton": [46.09, -64.77],
  "America/Goose_Bay": [53.3, -60.42],
  "America/Mexico_City": [19.43, -99.13],
  "America/Cancun": [21.16, -86.85],
  "America/Monterrey": [25.67, -100.31],
  "America/Tijuana": [32.51, -117.04],
  "America/Mazatlan": [23.25, -106.41],
  "America/Chihuahua": [28.63, -106.09],
  "America/Hermosillo": [29.07, -110.96],
  "America/Merida": [20.97, -89.62],
  "America/Bogota": [4.71, -74.07],
  "America/Lima": [-12.05, -77.04],
  "America/Santiago": [-33.45, -70.67],
  "America/Argentina/Buenos_Aires": [-34.6, -58.38],
  "America/Sao_Paulo": [-23.55, -46.63],
  "America/Manaus": [-3.12, -60.02],
  "America/Belem": [-1.46, -48.5],
  "America/Fortaleza": [-3.73, -38.53],
  "America/Recife": [-8.05, -34.88],
  "America/Cuiaba": [-15.6, -56.1],
  "America/Campo_Grande": [-20.47, -54.62],
  "America/Porto_Velho": [-8.76, -63.9],
  "America/Rio_Branco": [-9.97, -67.81],
  "America/Noronha": [-3.85, -32.42],
  "America/Caracas": [10.48, -66.9],
  "America/La_Paz": [-16.5, -68.15],
  "America/Asuncion": [-25.29, -57.65],
  "America/Montevideo": [-34.9, -56.19],
  "America/Guayaquil": [-2.17, -79.92],
  "America/Panama": [8.98, -79.52],
  "America/Costa_Rica": [9.93, -84.08],
  "America/Guatemala": [14.63, -90.51],
  "America/Havana": [23.11, -82.37],
  "America/Jamaica": [18.02, -76.81],
  "America/Santo_Domingo": [18.49, -69.93],
  "Europe/London": [51.51, -0.13],
  "Europe/Dublin": [53.35, -6.26],
  "Europe/Lisbon": [38.72, -9.14],
  "Europe/Madrid": [40.42, -3.7],
  "Europe/Paris": [48.86, 2.35],
  "Europe/Brussels": [50.85, 4.35],
  "Europe/Amsterdam": [52.37, 4.9],
  "Europe/Berlin": [52.52, 13.41],
  "Europe/Rome": [41.9, 12.5],
  "Europe/Zurich": [47.38, 8.54],
  "Europe/Vienna": [48.21, 16.37],
  "Europe/Prague": [50.08, 14.44],
  "Europe/Warsaw": [52.23, 21.01],
  "Europe/Stockholm": [59.33, 18.07],
  "Europe/Oslo": [59.91, 10.75],
  "Europe/Copenhagen": [55.68, 12.57],
  "Europe/Helsinki": [60.17, 24.94],
  "Europe/Athens": [37.98, 23.73],
  "Europe/Bucharest": [44.43, 26.1],
  "Europe/Budapest": [47.5, 19.04],
  "Europe/Belgrade": [44.79, 20.45],
  "Europe/Kyiv": [50.45, 30.52],
  "Europe/Moscow": [55.76, 37.62],
  "Europe/Istanbul": [41.01, 28.98],
  "Europe/Minsk": [53.9, 27.57],
  "Atlantic/Reykjavik": [64.15, -21.94],
  "Atlantic/Azores": [37.74, -25.67],
  "Africa/Cairo": [30.04, 31.24],
  "Africa/Johannesburg": [-26.2, 28.05],
  "Africa/Lagos": [6.52, 3.38],
  "Africa/Nairobi": [-1.29, 36.82],
  "Africa/Casablanca": [33.57, -7.59],
  "Africa/Algiers": [36.75, 3.06],
  "Africa/Tunis": [36.81, 10.18],
  "Africa/Khartoum": [15.5, 32.56],
  "Africa/Addis_Ababa": [9.03, 38.75],
  "Africa/Accra": [5.6, -0.19],
  "Africa/Dakar": [14.72, -17.47],
  "Africa/Maputo": [-25.97, 32.57],
  "Africa/Kinshasa": [-4.32, 15.31],
  "Asia/Tokyo": [35.68, 139.69],
  "Asia/Seoul": [37.57, 126.98],
  "Asia/Shanghai": [31.23, 121.47],
  "Asia/Hong_Kong": [22.32, 114.17],
  "Asia/Taipei": [25.03, 121.57],
  "Asia/Singapore": [1.35, 103.82],
  "Asia/Kuala_Lumpur": [3.14, 101.69],
  "Asia/Bangkok": [13.76, 100.5],
  "Asia/Jakarta": [-6.21, 106.85],
  "Asia/Makassar": [-5.15, 119.42],
  "Asia/Jayapura": [-2.53, 140.72],
  "Asia/Manila": [14.6, 120.98],
  "Asia/Ho_Chi_Minh": [10.82, 106.63],
  "Asia/Kolkata": [22.5, 79.0],
  "Asia/Dhaka": [23.81, 90.41],
  "Asia/Kathmandu": [27.72, 85.32],
  "Asia/Colombo": [6.93, 79.85],
  "Asia/Karachi": [24.86, 67.01],
  "Asia/Dubai": [25.2, 55.27],
  "Asia/Riyadh": [24.71, 46.68],
  "Asia/Tehran": [35.69, 51.39],
  "Asia/Jerusalem": [31.77, 35.21],
  "Asia/Baghdad": [33.32, 44.37],
  "Asia/Kabul": [34.56, 69.21],
  "Asia/Yangon": [16.87, 96.2],
  "Asia/Ulaanbaatar": [47.89, 106.91],
  "Asia/Irkutsk": [52.29, 104.3],
  "Asia/Yakutsk": [62.03, 129.73],
  "Asia/Vladivostok": [43.12, 131.89],
  "Asia/Magadan": [59.56, 150.8],
  "Asia/Kamchatka": [53.02, 158.65],
  "Asia/Anadyr": [64.73, 177.51],
  "Asia/Krasnoyarsk": [56.02, 92.87],
  "Asia/Novosibirsk": [55.03, 82.92],
  "Asia/Yekaterinburg": [56.84, 60.61],
  "Asia/Omsk": [54.99, 73.37],
  "Asia/Tashkent": [41.3, 69.24],
  "Asia/Almaty": [43.24, 76.95],
  "Australia/Sydney": [-33.87, 151.21],
  "Australia/Melbourne": [-37.81, 144.96],
  "Australia/Brisbane": [-27.47, 153.03],
  "Australia/Perth": [-31.95, 115.86],
  "Australia/Adelaide": [-34.93, 138.6],
  "Australia/Darwin": [-12.46, 130.84],
  "Australia/Hobart": [-42.88, 147.33],
  "Pacific/Auckland": [-36.85, 174.76],
  "Pacific/Chatham": [-43.95, -176.55],
  "Pacific/Fiji": [-18.14, 178.44],
  "Pacific/Honolulu": [21.31, -157.86],
  "Pacific/Guam": [13.44, 144.79],
  "Pacific/Pago_Pago": [-14.28, -170.7],
  "Pacific/Tahiti": [-17.65, -149.43],
  "Pacific/Port_Moresby": [-9.44, 147.18],
  "Pacific/Noumea": [-22.28, 166.46],
  "Pacific/Tongatapu": [-21.13, -175.2],
  "Pacific/Apia": [-13.83, -171.77],
  "Pacific/Easter": [-27.11, -109.35],
  "Pacific/Galapagos": [-0.95, -90.97],
  "UTC": [0, 0],
  "Etc/UTC": [0, 0],
  "Etc/Universal": [0, 0]
};

export function locationFromTimezone(timeZone, date = new Date()) {
  const zone = timeZone || "UTC";
  if (TZ[zone]) {
    return { lat: TZ[zone][0], lon: TZ[zone][1], timeZone: zone };
  }
  const etc = /^Etc\/GMT([+-]\d+)?$/.exec(zone);
  if (etc) {
    const hours = etc[1] ? -parseInt(etc[1], 10) : 0;
    return { lat: 0, lon: clamp(hours * 15, -180, 180), timeZone: zone };
  }
  const offsetHours = -date.getTimezoneOffset() / 60;
  return {
    lat: 20,
    lon: clamp(offsetHours * 15, -180, 180),
    timeZone: zone,
    approximate: true
  };
}

export function browserLocation(date = new Date()) {
  let zone = "UTC";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (err) {
    zone = "UTC";
  }
  return locationFromTimezone(zone, date);
}

/** Simplified coastlines, [lat, lon], each ring closed by the renderer. */
export const LAND = [
  [[71, -156], [70, -141], [69, -133], [70, -120], [73, -96], [70, -82], [66, -70], [62, -76], [58, -78], [55, -82], [58, -94], [63, -86], [66, -72], [60, -64], [55, -60], [52, -56], [47, -53], [45, -60], [44, -66], [43, -70], [41, -70], [40, -74], [37, -76], [35, -75], [32, -81], [30, -81], [25, -80], [26, -82], [29, -83], [30, -88], [29, -89], [29, -95], [26, -97], [22, -97], [19, -96], [16, -95], [18, -91], [21, -87], [18, -88], [15, -92], [16, -99], [20, -105], [23, -106], [26, -112], [28, -114], [32, -117], [35, -121], [38, -123], [42, -124], [46, -124], [49, -126], [54, -131], [58, -137], [60, -146], [59, -153], [55, -162], [60, -166], [65, -166], [68, -166], [71, -156]],
  [[83, -32], [80, -18], [75, -18], [70, -22], [66, -34], [68, -52], [72, -58], [76, -68], [80, -66], [83, -48], [83, -32]],
  [[12, -72], [10, -62], [7, -58], [4, -51], [0, -48], [-3, -42], [-7, -35], [-12, -38], [-16, -39], [-23, -43], [-28, -48], [-33, -52], [-38, -57], [-42, -63], [-46, -67], [-52, -68], [-55, -68], [-52, -74], [-46, -75], [-38, -73], [-30, -71], [-18, -70], [-15, -76], [-8, -79], [-2, -80], [2, -79], [6, -77], [8, -77], [11, -74], [12, -72]],
  [[37, 10], [32, 10], [31, 20], [31, 32], [27, 34], [22, 37], [15, 42], [12, 44], [11, 51], [4, 46], [0, 42], [-6, 39], [-12, 44], [-16, 40], [-25, 35], [-34, 26], [-35, 20], [-33, 18], [-29, 17], [-23, 14], [-18, 12], [-12, 14], [-5, 12], [1, 9], [5, 2], [5, -5], [7, -14], [12, -17], [16, -16], [21, -17], [26, -15], [31, -10], [35, -6], [36, -2], [37, 3], [37, 10]],
  [[42, -9], [43, -2], [46, -1], [48, -5], [51, 2], [53, 5], [55, 8], [58, 11], [62, 5], [64, 14], [68, 18], [71, 26], [70, 42], [68, 54], [70, 68], [73, 90], [76, 110], [72, 128], [70, 145], [66, 170], [62, 164], [58, 158], [52, 142], [46, 142], [42, 133], [38, 128], [35, 129], [31, 122], [25, 122], [22, 113], [18, 109], [12, 109], [8, 104], [1, 104], [-2, 106], [-5, 106], [-8, 115], [0, 118], [6, 100], [8, 98], [12, 80], [16, 74], [22, 70], [25, 66], [25, 57], [21, 58], [16, 42], [12, 44], [22, 38], [28, 34], [31, 32], [36, 36], [41, 29], [41, 19], [38, 24], [36, 23], [37, 15], [40, 10], [43, 3], [43, -2], [42, -9]],
  [[59, -3], [58, -6], [56, -6], [54, -5], [53, -4], [51, -5], [50, -5], [50, 1], [52, 1], [54, 0], [56, -2], [58, -3], [59, -3]],
  [[45, 142], [43, 145], [41, 141], [38, 141], [35, 136], [33, 131], [31, 131], [34, 136], [38, 139], [42, 141], [45, 142]],
  [[-12, 131], [-14, 126], [-18, 122], [-22, 114], [-28, 114], [-32, 116], [-35, 117], [-35, 137], [-38, 145], [-37, 150], [-33, 152], [-25, 153], [-16, 146], [-12, 142], [-11, 136], [-12, 131]],
  [[-35, 173], [-37, 175], [-41, 175], [-46, 167], [-47, 167], [-44, 170], [-41, 174], [-37, 175]],
  [[-12, 49], [-16, 50], [-25, 47], [-25, 44], [-16, 44], [-12, 49]],
  [[-70, -60], [-72, -20], [-75, 20], [-78, 80], [-76, 140], [-72, 170], [-70, 180], [-72, -170], [-75, -120], [-72, -80], [-70, -60]]
];
