export function fixtureRichText(text = 'Published integration fixture content.') {
  return {
    root: {
      type: 'root',
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          children: [{ type: 'text', version: 1, text }],
        },
      ],
    },
  }
}
