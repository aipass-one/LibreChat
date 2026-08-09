const { withUrlCitationSources } = require('./urlCitations');

describe('withUrlCitationSources', () => {
  it('appends and deduplicates Responses API URL citations', () => {
    const citation = {
      type: 'url_citation',
      title: 'Example [News]',
      url: 'https://example.com/latest',
    };
    const data = {
      delta: {
        content: [{ type: 'text', text: 'Current answer.', annotations: [citation, citation] }],
      },
    };

    const result = withUrlCitationSources(data);

    expect(result.delta.content[0].text).toBe(
      'Current answer.\n\nSources: [Example \\[News\\]](<https://example.com/latest>)',
    );
  });

  it('supports nested Chat Completions citation objects', () => {
    const data = {
      delta: {
        content: {
          type: 'text',
          text: '',
          annotations: [
            {
              type: 'url_citation',
              url_citation: { title: 'Source', url: 'https://example.org/article' },
            },
          ],
        },
      },
    };

    expect(withUrlCitationSources(data).delta.content.text).toBe(
      'Sources: [Source](<https://example.org/article>)',
    );
  });

  it('ignores unsafe URLs and leaves unrelated deltas unchanged', () => {
    const data = {
      delta: {
        content: [
          {
            type: 'text',
            text: 'Answer',
            annotations: [{ type: 'url_citation', url: 'javascript:alert(1)' }],
          },
        ],
      },
    };

    expect(withUrlCitationSources(data)).toBe(data);
  });
});
