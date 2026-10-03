export type Visibility = 'private' | 'community' | 'viewers' | 'public';

export interface DirectoryProfile {
  id: string;
  community_id: string;
  community_name?: string;
  full_name: string;
  photo_url?: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[] | null;
  services: string[] | null;
  home_cells: string[] | null;
  location: string | null;
  open_to_work: boolean;
  units: string[] | null;
  verified_guarantors: number | null;
  testimonial_count: number | null;
}

export interface PublicDirectoryProfile {
  id: string;
  community_id: string;
  community_name: string;
  full_name: string;
  photo_url: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[] | null;
  services: string[] | null;
  location: string | null;
  units: string[] | null;
  home_cells: string[] | null;
  community_references: Array<{
    member_name: string;
    relationship: string;
    years_known: number;
    statement: string;
    responded_at: string;
  }> | null;
}

export interface CommunityGroup {
  id: string;
  name: string;
  kind: 'unit' | 'home_cell';
}

export interface ProfileLink {
  id: string;
  kind: 'portfolio' | 'linkedin' | 'github' | 'website' | 'other';
  url: string;
}

export interface HomeCellMembership {
  unit_id: string;
  status: 'pending' | 'verified' | 'rejected';
  name: string;
}

export interface HomeCellMembershipRequest {
  profile_id: string;
  unit_id: string;
  home_cell_name: string;
  full_name: string;
  status: 'pending';
}

export interface ReferenceCandidate {
  id: string;
  full_name: string;
  shared_groups: string[];
}

export interface MemberReference {
  id: string;
  requester_id: string;
  recipient_id: string;
  requester_name: string;
  recipient_name: string;
  status: 'pending' | 'accepted' | 'declined';
  relationship: string | null;
  years_known: number | null;
  statement: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface MyProfile {
  id: string;
  community_id: string;
  role: 'platform_admin' | 'community_admin' | 'member' | 'viewer';
  public_listing: boolean;
  photo_url: string | null;
  full_name: string;
  phone: string;
  headline: string | null;
  bio: string | null;
  skills: string[];
  services: string[];
  location: string | null;
  open_to_work: boolean;
  visibility: Record<string, Visibility>;
}

export interface Attestation {
  id: string;
  profile_id: string;
  community_id: string;
  guarantor_name: string;
  relationship: string | null;
  years_known: number | null;
  statement: string | null;
  status: 'pending' | 'verified' | 'revoked' | 'expired';
  verified_at: string | null;
  created_at: string;
}

export interface Testimonial {
  id: string;
  profile_id: string;
  author_id: string;
  body: string | null;
  image_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}