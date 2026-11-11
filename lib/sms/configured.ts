// Czy salon ma skonfigurowaną bramkę SMS: wybrany dostawca i niepusty klucz API.
// Sam wybór dostawcy (pusta konfiguracja `{}`) nie wystarcza.
export function smsGatewayConfigured(provider: unknown, config: unknown): boolean {
  if (!provider || !config || typeof config !== 'object') return false;
  const apiKey = (config as { apiKey?: unknown }).apiKey;
  return typeof apiKey === 'string' && apiKey.trim().length > 0;
}
