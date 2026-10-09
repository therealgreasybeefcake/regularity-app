import { Platform, Share } from 'react-native';

/**
 * Share the public live-timing link: the native share sheet on devices, the
 * Web Share API in browsers that have it, else copy to the clipboard.
 * Resolves true when the link was copied (so callers can say so).
 */
export async function shareLiveLink(url: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const nav: any = (globalThis as any).navigator;
      if (nav?.share) {
        await nav.share({ title: 'Live timing', url });
      } else if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        return true;
      }
    } else {
      await Share.share({ message: url, url });
    }
  } catch {
    /* user cancelled */
  }
  return false;
}
