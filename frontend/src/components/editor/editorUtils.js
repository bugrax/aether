export function isHTML(str) {
  if (!str) return false;
  return /^<[a-z][\s\S]*>/i.test(str.trim());
}

export function plainTextToHTML(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map(line => `<p>${line || '<br>'}</p>`)
    .join('');
}

export function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

export function prepareContent(content) {
  if (!content) return '';
  if (isHTML(content)) return content;
  return plainTextToHTML(content);
}
