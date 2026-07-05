// Lightweight user-agent parsing: device, browser, OS. No external dependency.

export interface UaInfo {
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
}

export function parseUa(ua: string): UaInfo {
  const s = ua || '';

  let device: UaInfo['device'] = 'desktop';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) device = 'tablet';
  else if (/Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(s)) device = 'mobile';

  let browser = 'other';
  // Edge exposes different tokens per platform: Edg (desktop), EdgiOS (iOS),
  // EdgA (Android), EdgW (WebView). Check it before Chrome/Safari, which its UA also contains.
  if (/Edg(\/|iOS|A|W)/i.test(s)) browser = 'edge';
  else if (/OPR\/|Opera|OPT\//i.test(s)) browser = 'opera';
  else if (/SamsungBrowser/i.test(s)) browser = 'samsung';
  else if (/Firefox\/|FxiOS/i.test(s)) browser = 'firefox';
  else if (/CriOS/i.test(s)) browser = 'chrome';
  else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = 'chrome';
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = 'safari';

  let os = 'other';
  if (/Windows/i.test(s)) os = 'windows';
  else if (/iPhone|iPad|iPod/i.test(s)) os = 'ios';
  else if (/Mac OS X/i.test(s)) os = 'macos';
  else if (/Android/i.test(s)) os = 'android';
  else if (/Linux/i.test(s)) os = 'linux';

  return { device, browser, os };
}
