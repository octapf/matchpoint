declare module 'xdate' {
  type LocaleSettings = {
    monthNames: string[];
    monthNamesShort: string[];
    dayNames: string[];
    dayNamesShort: string[];
    today?: string;
  };

  export interface XDateStatic {
    locales: Record<string, LocaleSettings>;
    defaultLocale: string;
  }

  const XDate: XDateStatic;
  export default XDate;
}

