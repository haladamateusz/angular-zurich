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

  it('groups three sentences into one paragraph', () => {
    expect(splitTextIntoParagraphs('First sentence. Second sentence. Third sentence.')).toEqual([
      'First sentence. Second sentence. Third sentence.',
    ]);
  });

  it('regroups existing one-sentence paragraphs', () => {
    expect(splitTextIntoParagraphs('Intro sentence.\n\nSecond block sentence.')).toEqual([
      'Intro sentence. Second block sentence.',
    ]);
  });

  it('starts a new paragraph after three sentences and keeps the remaining text', () => {
    expect(splitTextIntoParagraphs('One.\nTwo!\n\nThree? Four. Five. Six. Seven')).toEqual([
      'One. Two! Three?',
      'Four. Five. Six.',
      'Seven',
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
