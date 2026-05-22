export interface Person {
  first_name: string;
  last_name: string;
  slug: string;
  picture_url: string;
  label?: string | null;
  company_name?: string | null;
  personal_url: string | null;
  github_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
}
