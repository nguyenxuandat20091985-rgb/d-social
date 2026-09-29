/** Catalog disabled — not exposed in public UI */
export type ProjectItem = {
  id: string
  name: string
  title: string
  description: string
  url: string
  tags: string[]
  status: 'live' | 'beta' | 'archive'
}

export const GITHUB_PROJECTS: ProjectItem[] = []
