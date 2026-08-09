/**
 * Password validation rules matching backend requirements.
 * Returns which rules are satisfied for a live UI checklist.
 */
export type PasswordRuleKey = 'lower' | 'upper' | 'digit' | 'symbol' | 'length';

export type PasswordRuleStatus = Record<PasswordRuleKey, boolean>;

export function evaluatePassword(pw: string): PasswordRuleStatus {
  return {
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    digit: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
    length: (pw || '').length >= 8,
  };
}

export function isPasswordValid(pw: string): boolean {
  const s = evaluatePassword(pw);
  return s.lower && s.upper && s.digit && s.symbol && s.length;
}

export const PASSWORD_RULE_LABELS: Record<PasswordRuleKey, string> = {
  lower: 'Küçük harf',
  upper: 'Büyük harf',
  digit: 'Rakam',
  symbol: 'Sembol',
  length: 'En az 8 karakter',
};
