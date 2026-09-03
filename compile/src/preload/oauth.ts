// OAuth-popup only preload: neuter WebAuthn/passkeys BEFORE page scripts run,
// so Windows never pops the system "security key" dialog and Google falls
// back to password. Never loaded into animeon tabs (the site itself may use
// passkeys) — only into the Google/Telegram login popup, which main drives
// via webContents directly and needs no host API.
try {
  const denied = () => Promise.reject(new DOMException('Operation is not supported', 'NotSupportedError'))
  const stub = {
    get: denied,
    create: denied,
    store: denied,
    preventSilentAccess: denied,
    isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(false),
    isConditionalMediationAvailable: () => Promise.resolve(false),
  }
  try {
    Object.defineProperty(window.navigator, 'credentials', { value: stub, configurable: true, writable: false })
  } catch {}
  try {
    Object.defineProperty(window as any, 'PublicKeyCredential', { value: undefined, configurable: true, writable: true })
  } catch {}
  try { (window as any).__oauthStub = 'v1' } catch {}
} catch {}
export {}
