/**
 * A curated, bundled airport list for the origin/destination autocomplete on
 * both the web and mobile "new watch" forms (components/AirportAutocomplete.tsx
 * and mobile/components/AirportAutocomplete.tsx). No `next/*` imports, so it's
 * safe to share as-is — see the header comment on lib/watches.ts for why that
 * rule exists.
 *
 * Deliberately a hand-picked ~170-airport list, not the full ~9,000-row
 * OurAirports/OpenFlights dataset: this app's routes are Alaska Airlines and
 * partner itineraries, almost entirely North America plus the major
 * international hubs AS actually partners to, so a small curated list
 * resolves the vast majority of real searches while keeping the bundle tiny
 * and every entry checkable by hand. Biased toward US/Canada/Mexico/Hawaii
 * coverage, with major hubs elsewhere for one-stop international itineraries.
 * Extend this list, don't replace it with a bulk import, if a search someone
 * actually wants to do comes up empty.
 *
 * This is a lookup aid only — it does not gate what a user can submit. The
 * API (app/api/watches/route.ts) still just validates "3 uppercase letters",
 * so typing a real code this list doesn't happen to know about still works.
 */

export interface Airport {
  code: string
  city: string
  country: string
  name: string
}

export const AIRPORTS: Airport[] = [
  // ── US West ──────────────────────────────────────────────────────────
  { code: 'SEA', city: 'Seattle', country: 'US', name: 'Seattle–Tacoma Intl' },
  { code: 'PDX', city: 'Portland', country: 'US', name: 'Portland Intl' },
  { code: 'EUG', city: 'Eugene', country: 'US', name: 'Eugene Airport' },
  { code: 'GEG', city: 'Spokane', country: 'US', name: 'Spokane Intl' },
  { code: 'BOI', city: 'Boise', country: 'US', name: 'Boise Airport' },
  { code: 'SFO', city: 'San Francisco', country: 'US', name: 'San Francisco Intl' },
  { code: 'OAK', city: 'Oakland', country: 'US', name: 'Oakland Intl' },
  { code: 'SJC', city: 'San Jose', country: 'US', name: 'Norman Y. Mineta San Jose Intl' },
  { code: 'SMF', city: 'Sacramento', country: 'US', name: 'Sacramento Intl' },
  { code: 'FAT', city: 'Fresno', country: 'US', name: 'Fresno Yosemite Intl' },
  { code: 'LAX', city: 'Los Angeles', country: 'US', name: 'Los Angeles Intl' },
  { code: 'BUR', city: 'Burbank', country: 'US', name: 'Hollywood Burbank' },
  { code: 'LGB', city: 'Long Beach', country: 'US', name: 'Long Beach Airport' },
  { code: 'ONT', city: 'Ontario', country: 'US', name: 'Ontario Intl' },
  { code: 'SNA', city: 'Orange County', country: 'US', name: 'John Wayne Airport' },
  { code: 'SAN', city: 'San Diego', country: 'US', name: 'San Diego Intl' },
  { code: 'PSP', city: 'Palm Springs', country: 'US', name: 'Palm Springs Intl' },
  { code: 'RNO', city: 'Reno', country: 'US', name: 'Reno–Tahoe Intl' },
  { code: 'LAS', city: 'Las Vegas', country: 'US', name: 'Harry Reid Intl' },
  { code: 'PHX', city: 'Phoenix', country: 'US', name: 'Phoenix Sky Harbor' },
  { code: 'TUS', city: 'Tucson', country: 'US', name: 'Tucson Intl' },
  { code: 'SLC', city: 'Salt Lake City', country: 'US', name: 'Salt Lake City Intl' },
  { code: 'DEN', city: 'Denver', country: 'US', name: 'Denver Intl' },
  { code: 'ABQ', city: 'Albuquerque', country: 'US', name: 'Albuquerque Intl Sunport' },
  { code: 'ELP', city: 'El Paso', country: 'US', name: 'El Paso Intl' },
  { code: 'BZN', city: 'Bozeman', country: 'US', name: 'Bozeman Yellowstone Intl' },
  { code: 'MSO', city: 'Missoula', country: 'US', name: 'Missoula Montana Airport' },
  { code: 'BIL', city: 'Billings', country: 'US', name: 'Billings Logan Intl' },
  { code: 'FCA', city: 'Kalispell', country: 'US', name: 'Glacier Park Intl' },

  // ── Alaska ────────────────────────────────────────────────────────────
  { code: 'ANC', city: 'Anchorage', country: 'US', name: 'Ted Stevens Anchorage Intl' },
  { code: 'FAI', city: 'Fairbanks', country: 'US', name: 'Fairbanks Intl' },
  { code: 'JNU', city: 'Juneau', country: 'US', name: 'Juneau Intl' },
  { code: 'KTN', city: 'Ketchikan', country: 'US', name: 'Ketchikan Intl' },
  { code: 'SIT', city: 'Sitka', country: 'US', name: 'Sitka Rocky Gutierrez' },

  // ── Hawaii ───────────────────────────────────────────────────────────
  { code: 'HNL', city: 'Honolulu', country: 'US', name: 'Daniel K. Inouye Intl' },
  { code: 'OGG', city: 'Kahului', country: 'US', name: 'Kahului Airport (Maui)' },
  { code: 'KOA', city: 'Kona', country: 'US', name: 'Ellison Onizuka Kona Intl' },
  { code: 'LIH', city: 'Lihue', country: 'US', name: 'Lihue Airport (Kauai)' },
  { code: 'ITO', city: 'Hilo', country: 'US', name: 'Hilo Intl' },

  // ── US Central ───────────────────────────────────────────────────────
  { code: 'ORD', city: 'Chicago', country: 'US', name: "Chicago O'Hare Intl" },
  { code: 'MDW', city: 'Chicago', country: 'US', name: 'Chicago Midway' },
  { code: 'DFW', city: 'Dallas', country: 'US', name: 'Dallas/Fort Worth Intl' },
  { code: 'DAL', city: 'Dallas', country: 'US', name: 'Dallas Love Field' },
  { code: 'IAH', city: 'Houston', country: 'US', name: 'George Bush Intercontinental' },
  { code: 'HOU', city: 'Houston', country: 'US', name: 'William P. Hobby' },
  { code: 'AUS', city: 'Austin', country: 'US', name: 'Austin–Bergstrom Intl' },
  { code: 'SAT', city: 'San Antonio', country: 'US', name: 'San Antonio Intl' },
  { code: 'MSY', city: 'New Orleans', country: 'US', name: 'Louis Armstrong New Orleans Intl' },
  { code: 'OKC', city: 'Oklahoma City', country: 'US', name: 'Will Rogers World' },
  { code: 'TUL', city: 'Tulsa', country: 'US', name: 'Tulsa Intl' },
  { code: 'MSP', city: 'Minneapolis', country: 'US', name: 'Minneapolis–St. Paul Intl' },
  { code: 'OMA', city: 'Omaha', country: 'US', name: 'Eppley Airfield' },
  { code: 'DSM', city: 'Des Moines', country: 'US', name: 'Des Moines Intl' },
  { code: 'MCI', city: 'Kansas City', country: 'US', name: 'Kansas City Intl' },
  { code: 'STL', city: 'St. Louis', country: 'US', name: 'St. Louis Lambert Intl' },
  { code: 'MKE', city: 'Milwaukee', country: 'US', name: 'Milwaukee Mitchell Intl' },

  // ── US South ─────────────────────────────────────────────────────────
  { code: 'ATL', city: 'Atlanta', country: 'US', name: 'Hartsfield–Jackson Atlanta Intl' },
  { code: 'MIA', city: 'Miami', country: 'US', name: 'Miami Intl' },
  { code: 'FLL', city: 'Fort Lauderdale', country: 'US', name: 'Fort Lauderdale–Hollywood Intl' },
  { code: 'MCO', city: 'Orlando', country: 'US', name: 'Orlando Intl' },
  { code: 'TPA', city: 'Tampa', country: 'US', name: 'Tampa Intl' },
  { code: 'RSW', city: 'Fort Myers', country: 'US', name: 'Southwest Florida Intl' },
  { code: 'PBI', city: 'West Palm Beach', country: 'US', name: 'Palm Beach Intl' },
  { code: 'JAX', city: 'Jacksonville', country: 'US', name: 'Jacksonville Intl' },
  { code: 'BHM', city: 'Birmingham', country: 'US', name: 'Birmingham–Shuttlesworth Intl' },
  { code: 'BNA', city: 'Nashville', country: 'US', name: 'Nashville Intl' },
  { code: 'MEM', city: 'Memphis', country: 'US', name: 'Memphis Intl' },
  { code: 'CLT', city: 'Charlotte', country: 'US', name: 'Charlotte Douglas Intl' },
  { code: 'RDU', city: 'Raleigh', country: 'US', name: 'Raleigh–Durham Intl' },
  { code: 'CHS', city: 'Charleston', country: 'US', name: 'Charleston Intl' },
  { code: 'SAV', city: 'Savannah', country: 'US', name: 'Savannah/Hilton Head Intl' },
  { code: 'GSP', city: 'Greenville', country: 'US', name: 'Greenville–Spartanburg Intl' },
  { code: 'RIC', city: 'Richmond', country: 'US', name: 'Richmond Intl' },
  { code: 'ORF', city: 'Norfolk', country: 'US', name: 'Norfolk Intl' },

  // ── US Northeast ─────────────────────────────────────────────────────
  { code: 'JFK', city: 'New York', country: 'US', name: 'John F. Kennedy Intl' },
  { code: 'LGA', city: 'New York', country: 'US', name: 'LaGuardia Airport' },
  { code: 'EWR', city: 'Newark', country: 'US', name: 'Newark Liberty Intl' },
  { code: 'BOS', city: 'Boston', country: 'US', name: 'Logan Intl' },
  { code: 'PHL', city: 'Philadelphia', country: 'US', name: 'Philadelphia Intl' },
  { code: 'BWI', city: 'Baltimore', country: 'US', name: 'Baltimore/Washington Intl' },
  { code: 'IAD', city: 'Washington', country: 'US', name: 'Washington Dulles Intl' },
  { code: 'DCA', city: 'Washington', country: 'US', name: 'Ronald Reagan Washington National' },
  { code: 'PIT', city: 'Pittsburgh', country: 'US', name: 'Pittsburgh Intl' },
  { code: 'BUF', city: 'Buffalo', country: 'US', name: 'Buffalo Niagara Intl' },
  { code: 'ROC', city: 'Rochester', country: 'US', name: 'Greater Rochester Intl' },
  { code: 'SYR', city: 'Syracuse', country: 'US', name: 'Syracuse Hancock Intl' },
  { code: 'ALB', city: 'Albany', country: 'US', name: 'Albany Intl' },
  { code: 'PVD', city: 'Providence', country: 'US', name: 'T.F. Green Intl' },
  { code: 'BDL', city: 'Hartford', country: 'US', name: 'Bradley Intl' },
  { code: 'PWM', city: 'Portland', country: 'US', name: 'Portland Intl Jetport (Maine)' },
  { code: 'BGR', city: 'Bangor', country: 'US', name: 'Bangor Intl' },
  { code: 'BTV', city: 'Burlington', country: 'US', name: 'Burlington Intl' },

  // ── US Midwest / Great Lakes ─────────────────────────────────────────
  { code: 'DTW', city: 'Detroit', country: 'US', name: 'Detroit Metro' },
  { code: 'CLE', city: 'Cleveland', country: 'US', name: 'Cleveland Hopkins Intl' },
  { code: 'CMH', city: 'Columbus', country: 'US', name: 'John Glenn Columbus Intl' },
  { code: 'CVG', city: 'Cincinnati', country: 'US', name: 'Cincinnati/Northern Kentucky Intl' },
  { code: 'IND', city: 'Indianapolis', country: 'US', name: 'Indianapolis Intl' },

  // ── Canada ───────────────────────────────────────────────────────────
  { code: 'YVR', city: 'Vancouver', country: 'CA', name: 'Vancouver Intl' },
  { code: 'YYC', city: 'Calgary', country: 'CA', name: 'Calgary Intl' },
  { code: 'YEG', city: 'Edmonton', country: 'CA', name: 'Edmonton Intl' },
  { code: 'YWG', city: 'Winnipeg', country: 'CA', name: 'Winnipeg Richardson Intl' },
  { code: 'YYZ', city: 'Toronto', country: 'CA', name: 'Toronto Pearson Intl' },
  { code: 'YUL', city: 'Montreal', country: 'CA', name: 'Montréal–Trudeau Intl' },
  { code: 'YOW', city: 'Ottawa', country: 'CA', name: 'Ottawa Macdonald–Cartier Intl' },
  { code: 'YHZ', city: 'Halifax', country: 'CA', name: 'Halifax Stanfield Intl' },
  { code: 'YQB', city: 'Quebec City', country: 'CA', name: 'Québec City Jean Lesage Intl' },

  // ── Mexico ───────────────────────────────────────────────────────────
  { code: 'MEX', city: 'Mexico City', country: 'MX', name: 'Mexico City Intl' },
  { code: 'CUN', city: 'Cancún', country: 'MX', name: 'Cancún Intl' },
  { code: 'PVR', city: 'Puerto Vallarta', country: 'MX', name: 'Licenciado Gustavo Díaz Ordaz Intl' },
  { code: 'SJD', city: 'Los Cabos', country: 'MX', name: 'Los Cabos Intl' },
  { code: 'GDL', city: 'Guadalajara', country: 'MX', name: 'Guadalajara Intl' },
  { code: 'MTY', city: 'Monterrey', country: 'MX', name: 'Monterrey Intl' },
  { code: 'MZT', city: 'Mazatlán', country: 'MX', name: 'Mazatlán Intl' },
  { code: 'ZIH', city: 'Ixtapa/Zihuatanejo', country: 'MX', name: 'Ixtapa-Zihuatanejo Intl' },
  { code: 'LTO', city: 'Loreto', country: 'MX', name: 'Loreto Intl' },

  // ── Caribbean & Central America ─────────────────────────────────────
  { code: 'SJU', city: 'San Juan', country: 'PR', name: 'Luis Muñoz Marín Intl' },
  { code: 'STT', city: 'St. Thomas', country: 'VI', name: 'Cyril E. King Airport' },
  { code: 'NAS', city: 'Nassau', country: 'BS', name: 'Lynden Pindling Intl' },
  { code: 'MBJ', city: 'Montego Bay', country: 'JM', name: 'Sangster Intl' },
  { code: 'SJO', city: 'San José', country: 'CR', name: 'Juan Santamaría Intl' },
  { code: 'LIR', city: 'Liberia', country: 'CR', name: 'Daniel Oduber Quirós Intl' },
  { code: 'PTY', city: 'Panama City', country: 'PA', name: 'Tocumen Intl' },
  { code: 'BZE', city: 'Belize City', country: 'BZ', name: 'Philip S. W. Goldson Intl' },

  // ── South America ────────────────────────────────────────────────────
  { code: 'BOG', city: 'Bogotá', country: 'CO', name: 'El Dorado Intl' },
  { code: 'LIM', city: 'Lima', country: 'PE', name: 'Jorge Chávez Intl' },
  { code: 'SCL', city: 'Santiago', country: 'CL', name: 'Arturo Merino Benítez Intl' },
  { code: 'GRU', city: 'São Paulo', country: 'BR', name: 'Guarulhos Intl' },
  { code: 'GIG', city: 'Rio de Janeiro', country: 'BR', name: 'Galeão Intl' },
  { code: 'EZE', city: 'Buenos Aires', country: 'AR', name: 'Ministro Pistarini Intl' },

  // ── Europe ───────────────────────────────────────────────────────────
  { code: 'LHR', city: 'London', country: 'GB', name: 'Heathrow Airport' },
  { code: 'LGW', city: 'London', country: 'GB', name: 'Gatwick Airport' },
  { code: 'CDG', city: 'Paris', country: 'FR', name: 'Charles de Gaulle Airport' },
  { code: 'AMS', city: 'Amsterdam', country: 'NL', name: 'Schiphol Airport' },
  { code: 'FRA', city: 'Frankfurt', country: 'DE', name: 'Frankfurt Airport' },
  { code: 'MUC', city: 'Munich', country: 'DE', name: 'Munich Airport' },
  { code: 'FCO', city: 'Rome', country: 'IT', name: 'Leonardo da Vinci–Fiumicino' },
  { code: 'MXP', city: 'Milan', country: 'IT', name: 'Milan Malpensa' },
  { code: 'MAD', city: 'Madrid', country: 'ES', name: 'Adolfo Suárez Madrid–Barajas' },
  { code: 'BCN', city: 'Barcelona', country: 'ES', name: 'Josep Tarradellas Barcelona–El Prat' },
  { code: 'LIS', city: 'Lisbon', country: 'PT', name: 'Humberto Delgado Airport' },
  { code: 'ZRH', city: 'Zurich', country: 'CH', name: 'Zurich Airport' },
  { code: 'VIE', city: 'Vienna', country: 'AT', name: 'Vienna Intl' },
  { code: 'CPH', city: 'Copenhagen', country: 'DK', name: 'Copenhagen Airport' },
  { code: 'ARN', city: 'Stockholm', country: 'SE', name: 'Stockholm Arlanda' },
  { code: 'OSL', city: 'Oslo', country: 'NO', name: 'Oslo Gardermoen' },
  { code: 'HEL', city: 'Helsinki', country: 'FI', name: 'Helsinki-Vantaa' },
  { code: 'DUB', city: 'Dublin', country: 'IE', name: 'Dublin Airport' },
  { code: 'BRU', city: 'Brussels', country: 'BE', name: 'Brussels Airport' },
  { code: 'WAW', city: 'Warsaw', country: 'PL', name: 'Warsaw Chopin' },
  { code: 'ATH', city: 'Athens', country: 'GR', name: 'Athens Intl' },
  { code: 'IST', city: 'Istanbul', country: 'TR', name: 'Istanbul Airport' },

  // ── Middle East & Africa ─────────────────────────────────────────────
  { code: 'DXB', city: 'Dubai', country: 'AE', name: 'Dubai Intl' },
  { code: 'AUH', city: 'Abu Dhabi', country: 'AE', name: 'Zayed Intl' },
  { code: 'DOH', city: 'Doha', country: 'QA', name: 'Hamad Intl' },
  { code: 'TLV', city: 'Tel Aviv', country: 'IL', name: 'Ben Gurion Airport' },
  { code: 'JNB', city: 'Johannesburg', country: 'ZA', name: 'O.R. Tambo Intl' },
  { code: 'CPT', city: 'Cape Town', country: 'ZA', name: 'Cape Town Intl' },
  { code: 'CAI', city: 'Cairo', country: 'EG', name: 'Cairo Intl' },

  // ── Asia ─────────────────────────────────────────────────────────────
  { code: 'NRT', city: 'Tokyo', country: 'JP', name: 'Narita Intl' },
  { code: 'HND', city: 'Tokyo', country: 'JP', name: 'Haneda Airport' },
  { code: 'ICN', city: 'Seoul', country: 'KR', name: 'Incheon Intl' },
  { code: 'PVG', city: 'Shanghai', country: 'CN', name: 'Shanghai Pudong Intl' },
  { code: 'PEK', city: 'Beijing', country: 'CN', name: 'Beijing Capital Intl' },
  { code: 'HKG', city: 'Hong Kong', country: 'HK', name: 'Hong Kong Intl' },
  { code: 'TPE', city: 'Taipei', country: 'TW', name: 'Taiwan Taoyuan Intl' },
  { code: 'SIN', city: 'Singapore', country: 'SG', name: 'Singapore Changi' },
  { code: 'BKK', city: 'Bangkok', country: 'TH', name: 'Suvarnabhumi Airport' },
  { code: 'KUL', city: 'Kuala Lumpur', country: 'MY', name: 'Kuala Lumpur Intl' },
  { code: 'MNL', city: 'Manila', country: 'PH', name: 'Ninoy Aquino Intl' },
  { code: 'DEL', city: 'Delhi', country: 'IN', name: 'Indira Gandhi Intl' },
  { code: 'BOM', city: 'Mumbai', country: 'IN', name: 'Chhatrapati Shivaji Maharaj Intl' },

  // ── Oceania ──────────────────────────────────────────────────────────
  { code: 'SYD', city: 'Sydney', country: 'AU', name: 'Sydney (Kingsford Smith) Airport' },
  { code: 'MEL', city: 'Melbourne', country: 'AU', name: 'Melbourne Airport' },
  { code: 'BNE', city: 'Brisbane', country: 'AU', name: 'Brisbane Airport' },
  { code: 'AKL', city: 'Auckland', country: 'NZ', name: 'Auckland Airport' },
]

/**
 * Ranked, case-insensitive search over AIRPORTS by code, city, or airport
 * name. Empty/whitespace query returns [] deliberately — the autocomplete
 * shouldn't dump all ~170 rows on focus, only once the user types something.
 *
 * Ranking (best match first): exact code match, code-starts-with,
 * city-starts-with, name-starts-with, then a substring match anywhere in
 * city/name, then a substring match anywhere in the code. Ties break
 * alphabetically by city so results are stable and scannable.
 */
export function searchAirports(query: string, limit = 6): Airport[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const scored: { airport: Airport; score: number }[] = []
  for (const airport of AIRPORTS) {
    const code = airport.code.toLowerCase()
    const city = airport.city.toLowerCase()
    const name = airport.name.toLowerCase()

    let score = -1
    if (code === q) score = 0
    else if (code.startsWith(q)) score = 1
    else if (city.startsWith(q)) score = 2
    else if (name.startsWith(q)) score = 3
    else if (city.includes(q) || name.includes(q)) score = 4
    else if (code.includes(q)) score = 5

    if (score >= 0) scored.push({ airport, score })
  }

  scored.sort((a, b) => a.score - b.score || a.airport.city.localeCompare(b.airport.city))
  return scored.slice(0, limit).map((s) => s.airport)
}
