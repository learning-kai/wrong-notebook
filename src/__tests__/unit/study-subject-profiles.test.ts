import { describe, expect, it } from 'vitest';
import { subjectProfile, subjectProfileKey, isProfileField, subjectModes } from '@/lib/study-subject-profiles';

describe('subject-aware card profiles', () => {
  it('maps seeded course subjectKeys onto focused profiles', () => {
    expect(subjectProfileKey('calculus')).toBe('math');
    expect(subjectProfileKey('linear-algebra')).toBe('math');
    expect(subjectProfileKey('probability')).toBe('math');
    expect(subjectProfileKey('signals-systems')).toBe('signals-systems');
    expect(subjectProfileKey('postgraduate-english')).toBe('postgraduate-english');
  });

  it('makes English a composition-memorization profile (no formula/ROC/reading fields)', () => {
    const english = subjectProfile('postgraduate-english');
    expect(isProfileField(english, 'formula')).toBe(false);
    expect(isProfileField(english, 'roc')).toBe(false);
    expect(isProfileField(english, 'initialConditions')).toBe(false);
    // Reading-analysis classification is not part of composition memorization.
    expect(isProfileField(english, 'sentenceFunction')).toBe(false);
    expect(isProfileField(english, 'chinese')).toBe(true);
    expect(isProfileField(english, 'english')).toBe(true);
    expect(isProfileField(english, 'letterType')).toBe(true);
    expect(isProfileField(english, 'paragraphPosition')).toBe(true);
    expect(isProfileField(english, 'sentences')).toBe(true);
    expect(english.defaultCardType).toBe('template');
  });

  it('does not show letter/paragraph/sentence-classification fields for math', () => {
    const math = subjectProfile('calculus');
    expect(isProfileField(math, 'letterType')).toBe(false);
    expect(isProfileField(math, 'paragraphPosition')).toBe(false);
    expect(isProfileField(math, 'sentenceFunction')).toBe(false);
    expect(isProfileField(math, 'formula')).toBe(true);
    expect(isProfileField(math, 'conditions')).toBe(true);
    expect(isProfileField(math, 'steps')).toBe(true);
  });

  it('keeps ROC and initial/final conditions for signals but not letter classification', () => {
    const signals = subjectProfile('signals-systems');
    expect(isProfileField(signals, 'roc')).toBe(true);
    expect(isProfileField(signals, 'initialConditions')).toBe(true);
    expect(isProfileField(signals, 'finalConditions')).toBe(true);
    expect(isProfileField(signals, 'letterType')).toBe(false);
  });

  it('offers composition-only training modes for English', () => {
    expect(subjectModes(subjectProfile('postgraduate-english'))).toContain('zh-en');
    expect(subjectModes(subjectProfile('postgraduate-english'))).toContain('cloze');
    expect(subjectModes(subjectProfile('postgraduate-english'))).toContain('template-match');
    expect(subjectModes(subjectProfile('postgraduate-english'))).toContain('sentence-order');
    expect(subjectModes(subjectProfile('postgraduate-english'))).toContain('sentence-compose');
    // Not a reading or translation-profile subject.
    expect(subjectModes(subjectProfile('postgraduate-english'))).not.toContain('en-zh');
    expect(subjectModes(subjectProfile('postgraduate-english'))).not.toContain('paragraph');
    expect(subjectModes(subjectProfile('postgraduate-english'))).not.toContain('roc');
    expect(subjectModes(subjectProfile('postgraduate-english'))).not.toContain('formula');
    expect(subjectModes(subjectProfile('signals-systems'))).toContain('roc');
    expect(subjectModes(subjectProfile('signals-systems'))).toContain('transform');
    expect(subjectModes(subjectProfile('signals-systems'))).not.toContain('zh-en');
    expect(subjectModes(subjectProfile('calculus'))).toContain('formula');
    expect(subjectModes(subjectProfile('calculus'))).not.toContain('sentence-order');
  });

  it('falls back to the full general profile for an unknown or missing subject', () => {
    const general = subjectProfile(undefined);
    expect(general.key).toBe('general');
    expect(isProfileField(general, 'formula')).toBe(true);
    expect(isProfileField(general, 'letterType')).toBe(true);
    expect(subjectProfileKey('自定义课程')).toBe('general');
  });
});
