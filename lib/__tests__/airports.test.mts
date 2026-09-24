/**
 * lib/airports.ts after the switch to generated OurAirports data
 * (scripts/build-airports.mjs). Run with:
 *   npx tsx lib/__tests__/airports.test.mts
 *
 * The core check is a REGRESSION SPEC: every airport the old hand-picked
 * list knew, searched by the city it was listed under, must still come back
 * in the top 6. That list is frozen below so the guarantee survives future
 * regenerations of the data, not just the one on 2026-09-23. When a case
 * fails after a regeneration, fix it with an alias in the generator — don't
 * delete the case. One deliberate substitution: PBI is expected as DJT (the
 * code changed on 2026-08-18; the hand list had gone stale).
 */

import airportsModule from '../airports.ts'

const { searchAirports, isKnownAirport } = airportsModule as unknown as {
  searchAirports: typeof import('../airports.ts').searchAirports
  isKnownAirport: typeof import('../airports.ts').isKnownAirport
}

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  if (!ok || process.env.VERBOSE) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}
const codes = (q: string) => searchAirports(q).map((a) => a.code)

// ── Regression spec: [city as the old list had it, expected code] ──────
const OLD_LIST: [string, string][] = [
  ["Seattle", "SEA"],
  ["Portland", "PDX"],
  ["Eugene", "EUG"],
  ["Spokane", "GEG"],
  ["Boise", "BOI"],
  ["San Francisco", "SFO"],
  ["Oakland", "OAK"],
  ["San Jose", "SJC"],
  ["Sacramento", "SMF"],
  ["Fresno", "FAT"],
  ["Los Angeles", "LAX"],
  ["Burbank", "BUR"],
  ["Long Beach", "LGB"],
  ["Ontario", "ONT"],
  ["Orange County", "SNA"],
  ["San Diego", "SAN"],
  ["Palm Springs", "PSP"],
  ["Reno", "RNO"],
  ["Las Vegas", "LAS"],
  ["Phoenix", "PHX"],
  ["Tucson", "TUS"],
  ["Salt Lake City", "SLC"],
  ["Denver", "DEN"],
  ["Albuquerque", "ABQ"],
  ["El Paso", "ELP"],
  ["Bozeman", "BZN"],
  ["Missoula", "MSO"],
  ["Billings", "BIL"],
  ["Kalispell", "FCA"],
  ["Anchorage", "ANC"],
  ["Fairbanks", "FAI"],
  ["Juneau", "JNU"],
  ["Ketchikan", "KTN"],
  ["Sitka", "SIT"],
  ["Honolulu", "HNL"],
  ["Kahului", "OGG"],
  ["Kona", "KOA"],
  ["Lihue", "LIH"],
  ["Hilo", "ITO"],
  ["Chicago", "ORD"],
  ["Chicago", "MDW"],
  ["Dallas", "DFW"],
  ["Dallas", "DAL"],
  ["Houston", "IAH"],
  ["Houston", "HOU"],
  ["Austin", "AUS"],
  ["San Antonio", "SAT"],
  ["New Orleans", "MSY"],
  ["Oklahoma City", "OKC"],
  ["Tulsa", "TUL"],
  ["Minneapolis", "MSP"],
  ["Omaha", "OMA"],
  ["Des Moines", "DSM"],
  ["Kansas City", "MCI"],
  ["St. Louis", "STL"],
  ["Milwaukee", "MKE"],
  ["Atlanta", "ATL"],
  ["Miami", "MIA"],
  ["Fort Lauderdale", "FLL"],
  ["Orlando", "MCO"],
  ["Tampa", "TPA"],
  ["Fort Myers", "RSW"],
  ["West Palm Beach", "DJT"],
  ["Jacksonville", "JAX"],
  ["Birmingham", "BHM"],
  ["Nashville", "BNA"],
  ["Memphis", "MEM"],
  ["Charlotte", "CLT"],
  ["Raleigh", "RDU"],
  ["Charleston", "CHS"],
  ["Savannah", "SAV"],
  ["Greenville", "GSP"],
  ["Richmond", "RIC"],
  ["Norfolk", "ORF"],
  ["New York", "JFK"],
  ["New York", "LGA"],
  ["Newark", "EWR"],
  ["Boston", "BOS"],
  ["Philadelphia", "PHL"],
  ["Baltimore", "BWI"],
  ["Washington", "IAD"],
  ["Washington", "DCA"],
  ["Pittsburgh", "PIT"],
  ["Buffalo", "BUF"],
  ["Rochester", "ROC"],
  ["Syracuse", "SYR"],
  ["Albany", "ALB"],
  ["Providence", "PVD"],
  ["Hartford", "BDL"],
  ["Portland", "PWM"],
  ["Bangor", "BGR"],
  ["Burlington", "BTV"],
  ["Detroit", "DTW"],
  ["Cleveland", "CLE"],
  ["Columbus", "CMH"],
  ["Cincinnati", "CVG"],
  ["Indianapolis", "IND"],
  ["Vancouver", "YVR"],
  ["Calgary", "YYC"],
  ["Edmonton", "YEG"],
  ["Winnipeg", "YWG"],
  ["Toronto", "YYZ"],
  ["Montreal", "YUL"],
  ["Ottawa", "YOW"],
  ["Halifax", "YHZ"],
  ["Quebec City", "YQB"],
  ["Mexico City", "MEX"],
  ["Canc\u00fan", "CUN"],
  ["Puerto Vallarta", "PVR"],
  ["Los Cabos", "SJD"],
  ["Guadalajara", "GDL"],
  ["Monterrey", "MTY"],
  ["Mazatl\u00e1n", "MZT"],
  ["Ixtapa/Zihuatanejo", "ZIH"],
  ["Loreto", "LTO"],
  ["San Juan", "SJU"],
  ["St. Thomas", "STT"],
  ["Nassau", "NAS"],
  ["Montego Bay", "MBJ"],
  ["San Jos\u00e9", "SJO"],
  ["Liberia", "LIR"],
  ["Panama City", "PTY"],
  ["Belize City", "BZE"],
  ["Bogot\u00e1", "BOG"],
  ["Lima", "LIM"],
  ["Santiago", "SCL"],
  ["S\u00e3o Paulo", "GRU"],
  ["Rio de Janeiro", "GIG"],
  ["Buenos Aires", "EZE"],
  ["London", "LHR"],
  ["London", "LGW"],
  ["Paris", "CDG"],
  ["Amsterdam", "AMS"],
  ["Frankfurt", "FRA"],
  ["Munich", "MUC"],
  ["Rome", "FCO"],
  ["Milan", "MXP"],
  ["Madrid", "MAD"],
  ["Barcelona", "BCN"],
  ["Lisbon", "LIS"],
  ["Zurich", "ZRH"],
  ["Vienna", "VIE"],
  ["Copenhagen", "CPH"],
  ["Stockholm", "ARN"],
  ["Oslo", "OSL"],
  ["Helsinki", "HEL"],
  ["Dublin", "DUB"],
  ["Brussels", "BRU"],
  ["Warsaw", "WAW"],
  ["Athens", "ATH"],
  ["Istanbul", "IST"],
  ["Dubai", "DXB"],
  ["Abu Dhabi", "AUH"],
  ["Doha", "DOH"],
  ["Tel Aviv", "TLV"],
  ["Johannesburg", "JNB"],
  ["Cape Town", "CPT"],
  ["Cairo", "CAI"],
  ["Tokyo", "NRT"],
  ["Tokyo", "HND"],
  ["Seoul", "ICN"],
  ["Shanghai", "PVG"],
  ["Beijing", "PEK"],
  ["Hong Kong", "HKG"],
  ["Taipei", "TPE"],
  ["Singapore", "SIN"],
  ["Bangkok", "BKK"],
  ["Kuala Lumpur", "KUL"],
  ["Manila", "MNL"],
  ["Delhi", "DEL"],
  ["Mumbai", "BOM"],
  ["Sydney", "SYD"],
  ["Melbourne", "MEL"],
  ["Brisbane", "BNE"],
  ["Auckland", "AKL"],
]
for (const [city, code] of OLD_LIST) {
  const got = codes(city)
  check(`old list: "${city}" still finds ${code}`, got.includes(code), got.join(','))
}

// ── Known / unknown codes (the hint) ───────────────────────────────────
for (const c of ['GVA', 'ZRH', 'SEA', 'TPA', 'DJT', 'FAI', 'JNU', 'KTN', 'OTZ', 'BRW', 'PAE', 'gva']) {
  check(`isKnownAirport(${c})`, isKnownAirport(c))
}
for (const c of ['ZEH', 'XYZ', 'PBI', '']) {
  check(`!isKnownAirport(${JSON.stringify(c)})`, !isKnownAirport(c))
}

// ── Accents, aliases, keywords, ranking ────────────────────────────────
const first = (q: string, code: string) => {
  const got = codes(q)
  check(`"${q}" → ${code} first`, got[0] === code, got.join(','))
}
const within = (q: string, code: string) => {
  const got = codes(q)
  check(`"${q}" includes ${code}`, got.includes(code), got.join(','))
}
first('cancun', 'CUN')
first('montreal', 'YUL')
first('zurich', 'ZRH')
first('geneva', 'GVA')
first('gva', 'GVA')
within('sao paulo', 'GRU')
first('maui', 'OGG')
first('kona', 'KOA') // not Iran's Konarak (ZBR, medium)
first('kauai', 'LIH')
first('st thomas', 'STT')
first('panama city', 'PTY') // not Florida's ECP (medium)
within('taipei', 'TPE')
first('portland', 'PDX') // large before PWM (medium)
first('seattle', 'SEA')
within('nyc', 'JFK')
within('pbi', 'DJT') // old code still finds the renamed airport
within('palm beach', 'DJT')
check('empty query → []', searchAirports('   ').length === 0)
check('limit honoured', searchAirports('a', 3).length === 3)

console.log(failures ? `\n${failures} FAILED` : `\nall passed (${OLD_LIST.length} regression cases + spot checks)`)
process.exit(failures ? 1 : 0)
