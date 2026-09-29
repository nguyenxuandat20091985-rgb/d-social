export type ProjectItem = {
  id: string
  name: string
  title: string
  description: string
  url: string
  tags: string[]
  status: 'live' | 'beta' | 'archive'
}

/** Chợ dự án đang chạy trên GitHub của chủ D Social */
export const GITHUB_PROJECTS: ProjectItem[] = [
  {
    id: 'd-social',
    name: 'd-social',
    title: 'D Social Network',
    description: 'Mạng xã hội realtime — feed, chat, VIP, share công khai.',
    url: 'https://d-social.vercel.app',
    tags: ['social', 'supabase', 'vite'],
    status: 'live',
  },
  {
    id: 'taxi-promax',
    name: 'taxi-promax',
    title: 'Taxi Promax',
    description: 'Công nghệ vận tải Việt — nâng tầm giá trị tài xế & hành khách.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/taxi-promax',
    tags: ['taxi', 'ops'],
    status: 'live',
  },
  {
    id: 'to-nghe-taxi',
    name: 'to-nghe-taxi-vietnam',
    title: 'Tổ Nghề Taxi Việt Nam',
    description: 'Cộng đồng tôn vinh và kết nối tài xế taxi Việt Nam.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/to-nghe-taxi-vietnam',
    tags: ['community', 'taxi'],
    status: 'live',
  },
  {
    id: 'gia-pha',
    name: 'gia-pha-nguyen-family-tree',
    title: 'Gia Phả Họ Nguyễn',
    description: 'Cây phả hệ đẹp, nhánh chính/phụ, ảnh — dùng như app mobile.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/gia-pha-nguyen-family-tree',
    tags: ['family', 'webapp'],
    status: 'live',
  },
  {
    id: 'agentflow',
    name: 'AgentFlow',
    title: 'AgentFlow AI',
    description: 'Hệ thống AI Subagents tự động hóa qua GitHub Actions + Streamlit.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/AgentFlow',
    tags: ['ai', 'agents'],
    status: 'live',
  },
  {
    id: 'autobot',
    name: 'AutoBot-Pro',
    title: 'AutoBot Pro',
    description: 'Bot tự động hóa chuyên nghiệp.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/AutoBot-Pro',
    tags: ['ai', 'automation'],
    status: 'beta',
  },
  {
    id: 'video-ai',
    name: 'MultiPlatformAIVideoGenerator',
    title: 'AI Video Generator',
    description: 'Tạo video dọc & đăng Shorts / TikTok / Reels tự động.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/MultiPlatformAIVideoGenerator',
    tags: ['ai', 'video'],
    status: 'beta',
  },
  {
    id: 'deal',
    name: 'tro-ly-san-deal',
    title: 'Trợ lý săn deal',
    description: 'AI Master/Research/Writer kết nối Groq — săn deal thông minh.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/tro-ly-san-deal',
    tags: ['ai', 'commerce'],
    status: 'beta',
  },
  {
    id: 'affiliate',
    name: 'web-affiliate',
    title: 'Web Affiliate',
    description: 'Hệ thống affiliate marketing.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/web-affiliate',
    tags: ['affiliate'],
    status: 'live',
  },
  {
    id: 'moodbeat',
    name: 'moodbeat-studio',
    title: 'MoodBeat Studio',
    description: 'Tạo video theo nhạc.',
    url: 'https://github.com/nguyenxuandat20091985-rgb/moodbeat-studio',
    tags: ['media'],
    status: 'beta',
  },
]
