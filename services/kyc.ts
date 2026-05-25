export type DocumentType = 'passport' | 'driving_licence' | 'national_id';

export interface DocumentSubmission {
  documentType: DocumentType;
  frontCaptured: boolean;
  backCaptured: boolean;
}

export type KycStatus = 'pending' | 'processing' | 'approved' | 'rejected';

export const kycService = {
  async submitDocument(_submission: DocumentSubmission): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
  },

  async submitSelfie(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
  },

  async pollStatus(): Promise<KycStatus> {
    await new Promise<void>((resolve) => setTimeout(resolve, 2500));
    return 'approved';
  },
};
