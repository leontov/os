export type TokenSplitter = (input: string) => string[];

export function createTokenSplitter(): TokenSplitter {
  const pattern = /(\s+|\S+)/gu;
  return (input: string) => {
    if (!input) {
      return [];
    }
    return input.match(pattern) ?? [input];
  };
}
