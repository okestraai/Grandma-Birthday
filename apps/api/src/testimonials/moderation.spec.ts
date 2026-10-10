import { AppException } from '../common/errors';
import { applyModerationRules } from './testimonials.service';

const pending = { status: 'PENDING' as const, isPublic: false, isFeatured: false };
const approved = { status: 'APPROVED' as const, isPublic: false, isFeatured: false };
const live = { status: 'APPROVED' as const, isPublic: true, isFeatured: true };

describe('applyModerationRules', () => {
  it('approving never publishes', () => {
    expect(applyModerationRules(pending, { status: 'APPROVED' })).toEqual(approved);
  });
  it('refuses to publish or feature an unapproved message', () => {
    expect(() => applyModerationRules(pending, { isPublic: true })).toThrow(AppException);
    expect(() => applyModerationRules(pending, { isFeatured: true })).toThrow(AppException);
    expect(() => applyModerationRules(approved, { status: 'REJECTED', isPublic: true })).toThrow(AppException);
  });
  it('featuring makes a message public', () => {
    expect(applyModerationRules(approved, { isFeatured: true })).toEqual(live);
  });
  it('unpublishing also unfeatures', () => {
    expect(applyModerationRules(live, { isPublic: false })).toEqual(approved);
  });
  it('rejecting or un-approving takes a message off the website', () => {
    expect(applyModerationRules(live, { status: 'REJECTED' })).toEqual({ status: 'REJECTED', isPublic: false, isFeatured: false });
    expect(applyModerationRules(live, { status: 'PENDING' })).toEqual(pending);
  });
});
