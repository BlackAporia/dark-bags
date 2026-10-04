// Which language a new player gets, from the country their address is in (server/index.js
// /api/geo). Anything not listed, or no country at all: English.
const BY_LANG = {
  uk: ['UA'],
  ru: ['RU', 'BY', 'KZ', 'KG', 'TJ'],
  tr: ['TR', 'AZ', 'CY'],
  zh: ['CN', 'TW', 'HK', 'MO'],
  hi: ['IN'],
  es: ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'GQ', 'PR'],
  fr: ['FR', 'BE', 'LU', 'MC', 'SN', 'CI', 'CM', 'ML', 'BF', 'NE', 'TG', 'BJ', 'GN', 'CD', 'CG', 'GA', 'MG', 'HT', 'TD', 'CF', 'DJ', 'KM'],
  pt: ['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'],
  ar: ['SA', 'AE', 'EG', 'IQ', 'JO', 'KW', 'LB', 'LY', 'MA', 'OM', 'QA', 'SY', 'TN', 'YE', 'DZ', 'BH', 'SD', 'PS', 'MR'],
  sw: ['KE', 'TZ', 'UG', 'RW', 'BI'],
};
const LANG_OF = Object.fromEntries(Object.entries(BY_LANG).flatMap(([l, cs]) => cs.map((c) => [c, l])));

export const langForCountry = (cc) => LANG_OF[String(cc ?? '').toUpperCase()] ?? 'en';
