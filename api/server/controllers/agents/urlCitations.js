function getUrlCitation(annotation) {
  if (annotation?.type !== 'url_citation') {
    return null;
  }

  const citation = annotation.url_citation ?? annotation;
  if (typeof citation?.url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(citation.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return {
      title:
        typeof citation.title === 'string' && citation.title.trim()
          ? citation.title.trim()
          : parsed.hostname,
      url: parsed.toString(),
    };
  } catch {
    return null;
  }
}

function escapeMarkdownLabel(value) {
  return value.replace(/([\\[\]])/g, '\\$1');
}

function appendSourcesToPart(part) {
  if (part?.type !== 'text' || !Array.isArray(part.annotations)) {
    return part;
  }

  const seen = new Set();
  const citations = [];
  for (const annotation of part.annotations) {
    const citation = getUrlCitation(annotation);
    if (!citation || seen.has(citation.url)) {
      continue;
    }
    seen.add(citation.url);
    citations.push(citation);
  }

  if (citations.length === 0) {
    return part;
  }

  const links = citations
    .map(({ title, url }) => `[${escapeMarkdownLabel(title)}](<${url}>)`)
    .join(' · ');
  const text = typeof part.text === 'string' ? part.text : '';
  const separator = text.trim().length > 0 ? '\n\n' : '';

  return {
    ...part,
    text: `${text}${separator}Sources: ${links}`,
  };
}

/**
 * Makes OpenAI Responses-style URL annotations visible in LibreChat's stored
 * text content. The agent content aggregator currently retains text but not
 * the annotation objects themselves, so append compact source links before
 * both SSE emission and persistence.
 */
function withUrlCitationSources(data) {
  const content = data?.delta?.content;
  if (content == null) {
    return data;
  }

  if (Array.isArray(content)) {
    const nextContent = content.map(appendSourcesToPart);
    if (nextContent.every((part, index) => part === content[index])) {
      return data;
    }
    return { ...data, delta: { ...data.delta, content: nextContent } };
  }

  const nextContent = appendSourcesToPart(content);
  if (nextContent === content) {
    return data;
  }
  return { ...data, delta: { ...data.delta, content: nextContent } };
}

module.exports = { withUrlCitationSources };
