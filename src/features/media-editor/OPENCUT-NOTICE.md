# OpenCut attribution

The mobile editor integration work references the OpenCut project:

- Main repository: https://github.com/opencut-app/opencut
- Usable legacy editor source: https://github.com/opencut-app/opencut-classic
- License: MIT
- Upstream editor entry point reviewed: `apps/web/src/app/editor/[project_id]/page.tsx`
- Upstream timeline and preview architecture reviewed for adaptation.

The current `opencut-app/opencut` rewrite has an editor route marked “Coming soon”. The legacy editor is a Next.js application with a Rust/WASM core and explicitly warns that its layout is not optimized for mobile. It cannot be safely imported as a drop-in React component into D-Social's React/Vite application. This integration therefore adapts the panel/timeline interaction model while preserving D-Social's existing media export, Supabase upload, story publishing, and post publishing pipeline. It does not claim to embed the entire OpenCut application or its Rust rendering core.

## MIT License

Copyright 2025-2026 OpenCut

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
