import { describe, expect, it } from 'vitest'
import { EMPTY_RESULTS, hasPrefill, initialResults, resultPayload, reviewResultError } from './review-results'

describe('initialResults', () => {
  it('a new upload starts empty: NOT_APPLICABLE and PENDING both mean nothing recorded', () => {
    expect(initialResults({ cxrResult: 'NOT_APPLICABLE', genexpertResult: 'PENDING', titerResult: 'NOT_APPLICABLE' })).toEqual(EMPTY_RESULTS)
  })
  it('an older upload brings the staff member\'s entry along as a pre-fill', () => {
    expect(initialResults({ cxrResult: 'INFILTRATE', genexpertResult: 'NOT_DETECTED', titerResult: 'NOT_APPLICABLE' })).toEqual({ cxr: 'INFILTRATE', genexpert: 'NOT_DETECTED', titer: '' })
    expect(initialResults({ cxrResult: 'NOT_APPLICABLE', genexpertResult: 'NOT_APPLICABLE', titerResult: 'NON_REACTIVE' }).titer).toBe('NON_REACTIVE')
  })
  it('ignores a value it does not recognise instead of passing it through', () => {
    expect(initialResults({ cxrResult: 'MAYBE', genexpertResult: '', titerResult: 'x' })).toEqual(EMPTY_RESULTS)
  })
})

describe('hasPrefill', () => {
  it('is true only when something is filled in', () => {
    expect(hasPrefill(EMPTY_RESULTS)).toBe(false)
    expect(hasPrefill({ ...EMPTY_RESULTS, genexpert: 'DETECTED' })).toBe(true)
  })
})

describe('reviewResultError', () => {
  it('an annual physical exam needs the chest X-ray or GeneXpert', () => {
    expect(reviewResultError('APE', EMPTY_RESULTS)).toMatch(/chest X-ray or GeneXpert/)
    expect(reviewResultError('APE', { ...EMPTY_RESULTS, cxr: 'CLEARED' })).toBeNull()
    expect(reviewResultError('APE', { ...EMPTY_RESULTS, genexpert: 'NOT_DETECTED' })).toBeNull()
  })
  it('a Hep B titer needs the titer, and a chest X-ray does not stand in for it', () => {
    expect(reviewResultError('HEPB_TITER', EMPTY_RESULTS)).toMatch(/Hep B titer/)
    expect(reviewResultError('HEPB_TITER', { ...EMPTY_RESULTS, cxr: 'CLEARED' })).not.toBeNull()
    expect(reviewResultError('HEPB_TITER', { ...EMPTY_RESULTS, titer: 'REACTIVE' })).toBeNull()
  })
})

describe('resultPayload', () => {
  it('sends only the fields that are filled in and belong to the category', () => {
    expect(resultPayload('APE', { cxr: 'CLEARED', genexpert: '', titer: 'REACTIVE' })).toEqual({ cxrResult: 'CLEARED' })
    expect(resultPayload('APE', { cxr: 'INFILTRATE', genexpert: 'DETECTED', titer: '' })).toEqual({ cxrResult: 'INFILTRATE', genexpertResult: 'DETECTED' })
    expect(resultPayload('HEPB_TITER', { cxr: 'CLEARED', genexpert: 'DETECTED', titer: 'NON_REACTIVE' })).toEqual({ titerResult: 'NON_REACTIVE' })
  })
})
