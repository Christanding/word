declare module "wink-lemmatizer" {
  interface WinkLemmatizer {
    noun(word: string): string;
    verb(word: string): string;
    adjective(word: string): string;
    adverb(word: string): string;
  }

  const lemmatizer: WinkLemmatizer;
  export default lemmatizer;
}
