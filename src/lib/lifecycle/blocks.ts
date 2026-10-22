/**
 * The pieces a lifecycle email is built from (lib/lifecycle/copy renders them
 * once as plain text and once as a minimal HTML wrapper).
 *   p     a paragraph
 *   list  a short bulleted list
 *   link  a labelled link line
 *   code  a copy-paste snippet (not counted in the word limit)
 *   img   an image, in the HTML version only (the text version has none)
 */
export type Block =
  | { p: string }
  | { list: string[] }
  | { link: { label: string; url: string } }
  | { code: string }
  | { img: { src: string; alt: string; width: number; height: number } };
