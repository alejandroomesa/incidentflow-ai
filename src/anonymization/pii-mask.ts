const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g; // Aqui 
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/g;


export function maskPII(text: string): string {
  let masked = text.replace(EMAIL_RE, '[EMAIL_REDACTED]');
  masked = masked.replace(PHONE_RE, (match) => {
    const digitCount = match.replace(/\D/g, '').length;
    return digitCount >= 7 ? '[PHONE_REDACTED]' : match;
  });
  return masked;
}
