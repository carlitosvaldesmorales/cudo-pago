import { resolveSocialReference } from './resolver.mjs';

function clean(value) { return String(value ?? '').trim(); }

export async function enrichPlantelForReview(record, { resolve = resolveSocialReference } = {}) {
  const original = { ...record };
  const uploadedPhoto = clean(record.FOTO_REF || record.foto_ref);
  const socialReference = clean(record.RED_SOCIAL_REF || record.social_reference);
  const providerHint = clean(record.RED_SOCIAL_TIPO || record.social_provider);

  if (uploadedPhoto) {
    return {
      record: original,
      review_enrichment: {
        status: 'USER_PHOTO_PRESENT',
        social_reference: socialReference || null,
        photo_candidate: null,
        selected_photo_source: 'USER_UPLOAD',
        blocking: false,
      },
    };
  }

  if (!socialReference) {
    return {
      record: original,
      review_enrichment: {
        status: 'NO_SOCIAL_REFERENCE',
        social_reference: null,
        photo_candidate: null,
        selected_photo_source: 'NONE',
        blocking: false,
      },
    };
  }

  let resolved;
  try {
    resolved = await resolve(socialReference, providerHint);
  } catch (error) {
    return {
      record: original,
      review_enrichment: {
        status: 'ENRICHMENT_ERROR_NON_BLOCKING',
        social_reference: socialReference,
        photo_candidate: null,
        selected_photo_source: 'NONE',
        blocking: false,
        reason: error?.message || String(error),
      },
    };
  }

  const candidate = resolved?.image_candidate || null;
  return {
    record: original,
    review_enrichment: {
      status: candidate ? 'SOCIAL_PHOTO_CANDIDATE' : 'SOCIAL_REFERENCE_ONLY',
      social_reference: resolved?.canonical_url || socialReference,
      social_provider: resolved?.provider || providerHint || null,
      social_kind: resolved?.kind || null,
      photo_candidate: candidate,
      selected_photo_source: candidate ? 'SOCIAL_CANDIDATE_PENDING_REVIEW' : 'NONE',
      blocking: false,
      reason: resolved?.reason || null,
    },
  };
}
