import { splitTextIntoParagraphs } from './split-text-into-paragraphs';

describe('splitTextIntoParagraphs', () => {
  it('returns an empty array for blank text', () => {
    expect(splitTextIntoParagraphs('   ')).toEqual([]);
  });

  it('keeps a single sentence as one paragraph', () => {
    expect(splitTextIntoParagraphs('How signals make state easier to manage.')).toEqual([
      'How signals make state easier to manage.',
    ]);
  });

  it('splits multiple sentences into separate paragraphs', () => {
    expect(
      splitTextIntoParagraphs('First sentence. Second sentence. Third sentence.'),
    ).toEqual(['First sentence.', 'Second sentence.', 'Third sentence.']);
  });

  it('respects explicit paragraph breaks before sentence splitting', () => {
    expect(splitTextIntoParagraphs('Intro sentence.\n\nSecond block sentence.')).toEqual([
      'Intro sentence.',
      'Second block sentence.',
    ]);
  });

  it('keeps dotted words inside the same sentence', () => {
    expect(
      splitTextIntoParagraphs(
        "You'll learn what it means to go zoneless and how to build applications without Zone.js.",
      ),
    ).toEqual([
      "You'll learn what it means to go zoneless and how to build applications without Zone.js.",
    ]);
  });
});
