export const colors = {
  primary: '#E8590C',
  primaryDark: '#C64A08',
  primarySoft: '#FFEDE0',
  bg: '#FFF9F4',
  card: '#FFFFFF',
  text: '#2B211B',
  muted: '#8A7A6E',
  border: '#F0E4DA',
  success: '#2F9E44',
  successSoft: '#E6F6EA',
  warning: '#B25E09',
  warningSoft: '#FCF0DA',
  danger: '#D9480F',
  dangerSoft: '#FFE9E0',
  info: '#1971C2',
  infoSoft: '#E7F1FB',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 24 };

export const CURRENCY = '₹';

export function formatMoney(amount: number): string {
  return `${CURRENCY}${amount.toLocaleString('en-IN')}`;
}
