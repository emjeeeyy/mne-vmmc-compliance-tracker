import { BadRequestException } from '@nestjs/common';
import { describeResultCorrections, resolveReviewResults } from './review-results';

describe('resolveReviewResults — what a reviewer must record to approve', () => {
  it('an annual physical exam needs at least one of the chest X-ray or GeneXpert results', () => {
    expect(() => resolveReviewResults('APE', {})).toThrow(BadRequestException);
    expect(() => resolveReviewResults('APE', {})).toThrow(/at least one result/);
  });

  it('accepts the chest X-ray alone, marking the other tests not applicable', () => {
    expect(resolveReviewResults('APE', { cxrResult: 'CLEARED' })).toEqual({
      cxr_result: 'CLEARED',
      genexpert_result: 'NOT_APPLICABLE',
      titer_result: 'NOT_APPLICABLE',
    });
  });

  it('accepts GeneXpert alone, and both together', () => {
    expect(resolveReviewResults('APE', { genexpertResult: 'DETECTED' }).genexpert_result).toBe('DETECTED');
    expect(resolveReviewResults('APE', { cxrResult: 'INFILTRATE', genexpertResult: 'NOT_DETECTED' })).toEqual({
      cxr_result: 'INFILTRATE',
      genexpert_result: 'NOT_DETECTED',
      titer_result: 'NOT_APPLICABLE',
    });
  });

  it('refuses a Hep B titer result on an annual physical exam instead of ignoring it', () => {
    expect(() => resolveReviewResults('APE', { cxrResult: 'CLEARED', titerResult: 'REACTIVE' })).toThrow(/does not apply to an annual physical exam/);
  });

  it('a Hep B titer needs the titer result', () => {
    expect(() => resolveReviewResults('HEPB_TITER', {})).toThrow(/titer result/);
    expect(resolveReviewResults('HEPB_TITER', { titerResult: 'NON_REACTIVE' })).toEqual({
      cxr_result: 'NOT_APPLICABLE',
      genexpert_result: 'NOT_APPLICABLE',
      titer_result: 'NON_REACTIVE',
    });
  });

  it('refuses a chest X-ray or GeneXpert result on a Hep B titer', () => {
    expect(() => resolveReviewResults('HEPB_TITER', { titerResult: 'REACTIVE', cxrResult: 'CLEARED' })).toThrow(/does not apply to a Hep B titer/);
    expect(() => resolveReviewResults('HEPB_TITER', { titerResult: 'REACTIVE', genexpertResult: 'DETECTED' })).toThrow(BadRequestException);
  });
});

describe('describeResultCorrections — a correction is never a silent overwrite', () => {
  const NA = { cxr_result: 'NOT_APPLICABLE', genexpert_result: 'NOT_APPLICABLE', titer_result: 'NOT_APPLICABLE' };

  it('says nothing when the staff member entered nothing (the normal case now)', () => {
    expect(describeResultCorrections(NA, { ...NA, cxr_result: 'CLEARED' })).toBeNull();
  });

  it('says nothing when the reviewer confirmed what was entered', () => {
    const entered = { ...NA, cxr_result: 'CLEARED' };
    expect(describeResultCorrections(entered, entered)).toBeNull();
  });

  it('names what changed, from what to what', () => {
    expect(describeResultCorrections({ ...NA, cxr_result: 'INFILTRATE' }, { ...NA, cxr_result: 'CLEARED' })).toBe(
      'Result corrected at review (staff entered: Chest X-ray infiltrate -> cleared).',
    );
  });

  it('reports an entry the reviewer removed as not recorded, and several changes together', () => {
    const before = { cxr_result: 'INFILTRATE', genexpert_result: 'DETECTED', titer_result: 'NOT_APPLICABLE' };
    const after = { cxr_result: 'CLEARED', genexpert_result: 'NOT_APPLICABLE', titer_result: 'NOT_APPLICABLE' };
    expect(describeResultCorrections(before, after)).toBe(
      'Result corrected at review (staff entered: Chest X-ray infiltrate -> cleared; GeneXpert detected -> not recorded).',
    );
  });
});
