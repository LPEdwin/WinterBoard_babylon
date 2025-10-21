let _isMobile: boolean | undefined;

export function isMobile(): boolean {
    if (_isMobile) return _isMobile;
    const ua = navigator.userAgent || '';
    const chMobile = (navigator as any).userAgentData?.mobile === true; // Chrome/Edge
    const touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    const iPadOS = /Mac/.test(ua) && touch; // iPad iOS13+ without platform
    const uaMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    _isMobile = !!(chMobile || uaMobile || iPadOS);
    return _isMobile;
}
