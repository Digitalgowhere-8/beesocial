// Strict email validation - rejects patterns like jitesh@gmail.com.com
export function isValidEmail(email) {
  const str = String(email || '').trim();
  
  // Basic format check - must have local@domain.tld
  if (!/^[^\s@]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str)) {
    return false;
  }
  
  const [, domain] = str.split('@');
  const parts = domain.split('.');
  
  // Reject if more than 3 domain levels (e.g., a.b.c.d)
  // Allows: domain.com, sub.domain.com, but not a.b.c.d
  if (parts.length > 3) {
    return false;
  }
  
  // Reject if last two parts are identical (e.g., .com.com, .net.net)
  if (parts.length === 3 && parts[1] === parts[2]) {
    return false;
  }
  
  return true;
}

export function getEmailValidationError(email) {
  const str = String(email || '').trim();
  
  if (!str) return 'Email is required';
  
  if (!str.includes('@')) {
    return 'Email must contain @ symbol';
  }
  
  if (!str.includes('.')) {
    return 'Email must contain a domain';
  }
  
  const [local, domain] = str.split('@');
  
  if (!local || local.length === 0) {
    return 'Email must have content before @';
  }
  
  if (!domain || domain.length === 0) {
    return 'Email must have content after @';
  }
  
  const parts = domain.split('.');
  
  if (parts.length > 3) {
    return 'Email domain has too many parts (e.g., avoid multiple suffixes like .com.com)';
  }
  
  if (parts.length === 3 && parts[1] === parts[2]) {
    return `Invalid email format - appears to have duplicate suffixes (.${parts[1]}.${parts[2]})`;
  }
  
  if (!isValidEmail(str)) {
    return 'Invalid email format';
  }
  
  return null;
}
