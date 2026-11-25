export function passwordIssue(password: string): string | null {
  if (password.length < 10) {
    return 'Use at least 10 characters.';
  }
  if (!/[A-Za-z]/.test(password)) {
    return 'Include at least one letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Include at least one number.';
  }
  return null;
}
