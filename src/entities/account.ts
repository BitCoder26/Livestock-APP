export const INDUSTRY_OPTIONS = [
  'Livestock farming',
  'Mixed farming',
  'Veterinary',
  'Farm management',
  'Other',
] as const;

export const MEASUREMENT_UNIT_OPTIONS = [
  'Metric',
  'Imperial',
] as const;

export const COUNTRY_OPTIONS = [
  'United Kingdom',
  'United States',
  'Canada',
  'Australia',
  'New Zealand',
  'Ireland',
  'South Africa',
  'Afghanistan',
  'Albania',
  'Algeria',
  'Andorra',
  'Angola',
  'Antigua and Barbuda',
  'Argentina',
  'Armenia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Belize',
  'Benin',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Burkina Faso',
  'Burundi',
  'Cabo Verde',
  'Cambodia',
  'Cameroon',
  'Central African Republic',
  'Chad',
  'Chile',
  'China',
  'Colombia',
  'Comoros',
  'Congo',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czech Republic',
  'Democratic Republic of the Congo',
  'Denmark',
  'Djibouti',
  'Dominica',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Equatorial Guinea',
  'Eritrea',
  'Estonia',
  'Eswatini',
  'Ethiopia',
  'Fiji',
  'Finland',
  'France',
  'Gabon',
  'Gambia',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Grenada',
  'Guatemala',
  'Guinea',
  'Guinea-Bissau',
  'Guyana',
  'Haiti',
  'Honduras',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Israel',
  'Italy',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kiribati',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Lesotho',
  'Liberia',
  'Libya',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Maldives',
  'Mali',
  'Malta',
  'Marshall Islands',
  'Mauritania',
  'Mauritius',
  'Mexico',
  'Micronesia',
  'Moldova',
  'Monaco',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nauru',
  'Nepal',
  'Netherlands',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Palau',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Romania',
  'Russia',
  'Rwanda',
  'Saint Kitts and Nevis',
  'Saint Lucia',
  'Saint Vincent and the Grenadines',
  'Samoa',
  'San Marino',
  'Sao Tome and Principe',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Seychelles',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Solomon Islands',
  'Somalia',
  'South Korea',
  'South Sudan',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Suriname',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Togo',
  'Tonga',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkey',
  'Turkmenistan',
  'Tuvalu',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'Uruguay',
  'Uzbekistan',
  'Vanuatu',
  'Vatican City',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
  'Other',
] as const;

export type IndustryOption = typeof INDUSTRY_OPTIONS[number];
export type MeasurementUnitOption = typeof MEASUREMENT_UNIT_OPTIONS[number];
export type CountryOption = typeof COUNTRY_OPTIONS[number];
export type IndustryValue = IndustryOption | '';

export type AccountProfile = {
  name: string;
  email: string;
  country: string;
  industry: IndustryValue;
  measurementUnits: MeasurementUnitOption;
};

export const DEFAULT_ACCOUNT_PROFILE: AccountProfile = {
  name: '',
  email: '',
  country: '',
  industry: '',
  measurementUnits: 'Metric',
};

export function getCurrencyCodeForCountry(country: string) {
  switch (country.trim().toLowerCase()) {
    case 'united kingdom':
    case 'ireland':
      return 'GBP';
    case 'united states':
      return 'USD';
    case 'canada':
      return 'CAD';
    case 'australia':
      return 'AUD';
    case 'new zealand':
      return 'NZD';
    case 'south africa':
      return 'ZAR';
    default:
      return 'GBP';
  }
}

export function formatCurrencyPrefix(country: string) {
  const code = getCurrencyCodeForCountry(country);

  switch (code) {
    case 'GBP':
      return '£';
    case 'USD':
    case 'CAD':
    case 'AUD':
    case 'NZD':
      return '$';
    case 'ZAR':
      return 'R';
    default:
      return '£';
  }
}
