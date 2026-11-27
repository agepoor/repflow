// The Web APIs core/ may use: the ones every browser and Node have. lib "dom" isn't loaded for core/, so using the DOM
// there (document, window, localStorage) fails the type check; add an API here only if Node has it too.
declare class URLSearchParams {
  constructor(init?: string | Record<string, string>);
  toString(): string;
}
