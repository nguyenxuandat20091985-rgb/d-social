# D-Social feature module boundaries

The application exposes feature entry points under `src/features`:

- `home`: home feed entry point. `ShortVideoFeed.tsx` is deliberately left unchanged.
- `explore`: discovery and search panel.
- `chat`: chat and messaging panel.
- `notifications`: notifications panel.
- `profile`: current-user and public profile pages.
- `media-editor`: creator tools, timeline editor, and media export pipeline.

## Dependency rules

1. `src/App.tsx` is the composition/routing shell and imports feature entry points rather than feature implementation files.
2. Feature code may depend on shared services in `src/lib` and shared UI primitives, but must not import another feature's implementation directly.
3. Media-editor changes belong in `src/features/media-editor`; its old `src/components` and `src/lib` paths are compatibility re-exports only.
4. Do not edit `src/components/ShortVideoFeed.tsx` as part of media-editor work.
5. New editor controls must either be connected to preview/export or explicitly marked unavailable; never imply an unconnected AI service is active.

## Migration note

The media editor has been moved behind its own module boundary. The Home feed/composer still has orchestration code in `src/App.tsx`; fully extracting that state machine is a separate refactor and should be done with regression tests rather than a blind file move. The other feature panels now have module-owned implementation files and compatibility re-exports for older imports.
