const VIETNAMESE_LETTERS =
  /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

// TMDB answers whatever it has when a `language=vi` text is untranslated, so the language is read off the text.
// English and romaji never carry these letters, and nearly every Vietnamese sentence does.
export function looksVietnamese(text: string): boolean {
  return VIETNAMESE_LETTERS.test(text);
}
